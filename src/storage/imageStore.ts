import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { logger } from '../util/logger';

export interface ImageStore {
  /** Save a PNG buffer to the image folder. Returns the absolute file path. */
  save(imageBuffer: Buffer): Promise<string>;

  /** Delete the oldest images if count exceeds maxImages setting. */
  cleanup(): Promise<void>;

  /** Ensure the image folder is listed in .gitignore (if autoGitIgnore is enabled). */
  ensureGitIgnored(): Promise<void>;
}

const DEFAULT_FOLDER_NAME = '.tip-images';

/** First 8 bytes of every valid PNG file. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function validatePng(buffer: Buffer): void {
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('Clipboard data is not a valid PNG image');
  }
}

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('terminalImgPaste');
}

function getWorkspaceRoot(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage(
      'Terminal Image Paste: No workspace folder is open. Please open a folder first.',
    );
    throw new Error('No workspace folder is open');
  }
  return folders[0].uri.fsPath;
}

function getFolderName(): string {
  return getConfig().get<string>('folderName', DEFAULT_FOLDER_NAME);
}

function getImageFolderPath(): string {
  const root = getWorkspaceRoot();
  const folderName = getFolderName();
  const resolved = path.resolve(root, folderName);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error(
      `Configured folderName "${folderName}" must resolve to a subdirectory of the workspace root`,
    );
  }
  return resolved;
}

function generateFileName(): string {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `img-${y}-${mo}-${d}T${h}-${mi}-${s}-${ms}.png`;
}

export function createImageStore(): ImageStore {
  return {
    async save(imageBuffer: Buffer): Promise<string> {
      validatePng(imageBuffer);

      const folder = getImageFolderPath();
      await fs.promises.mkdir(folder, { recursive: true });

      const fileName = generateFileName();
      const filePath = path.join(folder, fileName);
      await fs.promises.writeFile(filePath, imageBuffer, { mode: 0o600 });

      logger.info(`Saved image: ${filePath}`);

      await this.cleanup();
      await this.ensureGitIgnored();

      return filePath;
    },

    async cleanup(): Promise<void> {
      const config = getConfig();
      const rawMaxImages = config.get<number>('maxImages', 20);
      const maxImages =
        Number.isInteger(rawMaxImages) && rawMaxImages > 0
          ? rawMaxImages
          : 20;
      const folder = getImageFolderPath();

      let entries: string[];
      try {
        entries = await fs.promises.readdir(folder);
      } catch {
        return;
      }

      const pngFiles = entries
        .filter((f) => f.endsWith('.png'))
        .sort();

      if (pngFiles.length <= maxImages) {
        return;
      }

      const toDelete = pngFiles.slice(0, pngFiles.length - maxImages);
      for (const file of toDelete) {
        const filePath = path.join(folder, file);
        try {
          await fs.promises.unlink(filePath);
          logger.info(`Deleted old image: ${filePath}`);
        } catch (err) {
          logger.warn(`Failed to delete old image: ${filePath}`, err);
        }
      }
    },

    async ensureGitIgnored(): Promise<void> {
      const config = getConfig();
      if (!config.get<boolean>('autoGitIgnore', true)) {
        return;
      }

      const folderName = getFolderName();
      const workspaceRoot = getWorkspaceRoot();
      const gitignorePath = path.join(workspaceRoot, '.gitignore');

      let content: string;
      try {
        content = await fs.promises.readFile(gitignorePath, 'utf-8');
      } catch {
        await fs.promises.writeFile(gitignorePath, folderName + '\n', 'utf-8');
        logger.info(`Created .gitignore with ${folderName}`);
        return;
      }

      const lines = content.split('\n').map((line) => line.trim());
      if (lines.includes(folderName)) {
        return;
      }

      const suffix = content.endsWith('\n') ? '' : '\n';
      await fs.promises.writeFile(
        gitignorePath,
        content + suffix + folderName + '\n',
        'utf-8',
      );
      logger.info(`Added ${folderName} to .gitignore`);
    },
  };
}
