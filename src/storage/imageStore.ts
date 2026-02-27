import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { logger } from '../util/logger';
import { writeSecureFile } from '../util/fs';
import type { ClipboardFormat } from '../clipboard/types';

export interface ImageStore {
  /** Save an image buffer to the image folder. Returns the absolute file path. */
  save(imageBuffer: Buffer, format?: ClipboardFormat): Promise<string>;

  /** Delete the oldest images if count exceeds maxImages setting. */
  cleanup(): Promise<void>;

  /** Ensure the image folder is listed in .gitignore (if autoGitIgnore is enabled). */
  ensureGitIgnored(): Promise<void>;
}

const DEFAULT_FOLDER_NAME = '.tip-images';

/** All image file extensions managed by this store. */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.webp'];

/** Map from ClipboardFormat to file extension. */
function formatToExtension(format: ClipboardFormat): string {
  switch (format) {
    case 'jpeg':
      return '.jpg';
    case 'tiff':
      return '.tiff';
    case 'bmp':
      return '.bmp';
    case 'webp':
      return '.webp';
    case 'png':
    case 'unknown':
    default:
      return '.png';
  }
}

/** First 8 bytes of every valid PNG file. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Validate image data matches the expected format's magic bytes. */
function validateImage(buffer: Buffer, format: ClipboardFormat): void {
  switch (format) {
    case 'png':
      if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
        throw new Error('Clipboard data is not a valid PNG image');
      }
      break;
    case 'jpeg':
      if (buffer.length < 2 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
        throw new Error('Clipboard data is not a valid JPEG image');
      }
      break;
    case 'bmp':
      if (buffer.length < 2 || buffer[0] !== 0x42 || buffer[1] !== 0x4d) {
        throw new Error('Clipboard data is not a valid BMP image');
      }
      break;
    case 'webp':
      if (
        buffer.length < 12 ||
        buffer.subarray(0, 4).toString('ascii') !== 'RIFF' ||
        buffer.subarray(8, 12).toString('ascii') !== 'WEBP'
      ) {
        throw new Error('Clipboard data is not a valid WebP image');
      }
      break;
    case 'tiff':
      if (
        buffer.length < 2 ||
        !(
          (buffer[0] === 0x49 && buffer[1] === 0x49) ||
          (buffer[0] === 0x4d && buffer[1] === 0x4d)
        )
      ) {
        throw new Error('Clipboard data is not a valid TIFF image');
      }
      break;
    case 'unknown':
      logger.warn('Skipping image validation for unknown format');
      break;
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

const DEFAULT_FILENAME_PATTERN = 'img-{timestamp}';

/** Placeholders that guarantee unique filenames for rapid consecutive pastes. */
const UNIQUENESS_PLACEHOLDERS = ['{timestamp}', '{n}', '{hash}'];

/**
 * Resolve a filename pattern by replacing placeholders with actual values.
 * Exported for unit testing.
 */
export function resolveFilenamePattern(
  pattern: string,
  imageBuffer: Buffer,
  existingFiles: string[],
): string {
  if (!pattern) {
    pattern = DEFAULT_FILENAME_PATTERN;
  }

  const now = new Date();

  const hasPlaceholder = pattern.includes('{');
  if (!hasPlaceholder) {
    // No placeholders at all — append timestamp to avoid collisions
    const ts = formatTimestamp(now);
    pattern = `${pattern}-${ts}`;
  } else if (!UNIQUENESS_PLACEHOLDERS.some((p) => pattern.includes(p))) {
    logger.warn(
      `Filename pattern "${pattern}" lacks a uniqueness placeholder (${UNIQUENESS_PLACEHOLDERS.join(', ')}). Filenames may collide.`,
    );
  }
  let result = pattern;

  // {timestamp}
  result = result.replace(/\{timestamp\}/g, formatTimestamp(now));

  // {date}
  result = result.replace(/\{date\}/g, formatDate(now));

  // {time}
  result = result.replace(/\{time\}/g, formatTime(now));

  // {hash}
  if (result.includes('{hash}')) {
    const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex').slice(0, 8);
    result = result.replace(/\{hash\}/g, hash);
  }

  // {n}
  if (result.includes('{n}')) {
    result = resolveSequentialNumber(result, existingFiles);
  }

  return result;
}

function formatTimestamp(now: Date): string {
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${formatDate(now)}T${formatTime(now)}-${ms}`;
}

function formatDate(now: Date): string {
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function formatTime(now: Date): string {
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}-${mi}-${s}`;
}

/**
 * Replace `{n}` with the next sequential number.
 * Scans existing files in the folder to determine the highest number used so far.
 */
function resolveSequentialNumber(pattern: string, existingFiles: string[]): string {
  // Build a regex from the pattern that captures the number where {n} is
  const escaped = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\{n\\}/g, '(\\d+)');
  const regex = new RegExp(`^${escaped}`);

  let maxN = 0;
  for (const file of existingFiles) {
    // Strip extension for matching
    const baseName = file.replace(/\.[^.]+$/, '');
    const match = baseName.match(regex);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (num > maxN) {
        maxN = num;
      }
    }
  }

  return pattern.replace(/\{n\}/g, String(maxN + 1));
}

function generateFileName(
  format: ClipboardFormat,
  imageBuffer: Buffer,
  existingFiles: string[],
): string {
  const pattern = getConfig().get<string>('filenamePattern', DEFAULT_FILENAME_PATTERN);
  const baseName = resolveFilenamePattern(pattern, imageBuffer, existingFiles);
  const ext = formatToExtension(format);
  return `${baseName}${ext}`;
}

/**
 * Verify that `target` is inside `root` after resolving symlinks.
 * On case-insensitive filesystems (Windows/macOS) paths are lowercased before
 * comparison; on Linux (case-sensitive) exact casing is preserved.
 * Throws if the resolved path escapes the workspace.
 */
async function assertInsideWorkspace(target: string, root: string): Promise<string> {
  const realTarget = await fs.promises.realpath(target);
  const realRoot = await fs.promises.realpath(root);
  // Only normalise case on case-insensitive filesystems (Windows, macOS).
  // Linux is case-sensitive so lowercasing would bypass the check.
  const caseInsensitive = process.platform === 'win32' || process.platform === 'darwin';
  const normTarget = caseInsensitive ? realTarget.toLowerCase() : realTarget;
  const normRoot = caseInsensitive ? realRoot.toLowerCase() : realRoot;
  if (normTarget !== normRoot && !normTarget.startsWith(normRoot + path.sep)) {
    throw new Error(
      `Image folder resolves to a path outside the workspace (possible symlink escape): ${realTarget}`,
    );
  }
  return realTarget;
}

export function createImageStore(): ImageStore {
  return {
    async save(imageBuffer: Buffer, format: ClipboardFormat = 'png'): Promise<string> {
      validateImage(imageBuffer, format);

      const folder = getImageFolderPath();
      const root = getWorkspaceRoot();
      await fs.promises.mkdir(folder, { recursive: true });

      // Verify the resolved folder stays within the workspace
      await assertInsideWorkspace(folder, root);

      let existingFiles: string[];
      try {
        existingFiles = await fs.promises.readdir(folder);
      } catch {
        existingFiles = [];
      }

      const fileName = generateFileName(format, imageBuffer, existingFiles);
      const filePath = path.join(folder, fileName);
      await writeSecureFile(filePath, imageBuffer);

      // Defense-in-depth: verify the saved file also stays within the workspace
      await assertInsideWorkspace(filePath, root);

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

      const imageFiles = entries
        .filter((f) => IMAGE_EXTENSIONS.some((ext) => f.endsWith(ext)))
        .sort();

      if (imageFiles.length <= maxImages) {
        return;
      }

      const toDelete = imageFiles.slice(0, imageFiles.length - maxImages);
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
