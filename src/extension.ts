import * as vscode from 'vscode';
import { detectPlatform } from './platform/detect';
import { createClipboardReader, ClipboardReader } from './clipboard/index';
import { createImageStore, ImageStore } from './storage/imageStore';
import { insertPathToTerminal } from './terminal/insertPath';
import { logger } from './util/logger';
import { Mutex } from './util/mutex';

function handleCommandError(commandName: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  vscode.window.showErrorMessage(`Terminal Image Paste: ${message}`);
  logger.error(`${commandName} command failed`, err);
}

export function activate(context: vscode.ExtensionContext): void {
  const platform = detectPlatform();
  const reader: ClipboardReader = createClipboardReader(platform);
  const imageStore: ImageStore = createImageStore();

  // Check tool availability at activation — warn but don't block
  reader.isToolAvailable().then((available) => {
    if (!available) {
      vscode.window.showWarningMessage(
        `Terminal Image Paste: clipboard tool "${reader.requiredTool()}" not found. ` +
          `Install it to use clipboard image pasting.`,
      );
    }
  }).catch((err) => {
    logger.error('Failed to check tool availability', err);
  });

  const pasteMutex = new Mutex();

  const pasteImageDisposable = vscode.commands.registerCommand(
    'terminalImgPaste.pasteImage',
    async () => {
      const release = await pasteMutex.acquire();
      try {
        const toolAvailable = await reader.isToolAvailable();
        if (!toolAvailable) {
          vscode.window.showWarningMessage(
            `Terminal Image Paste: "${reader.requiredTool()}" is not installed. ` +
              `Please install it to paste clipboard images.`,
          );
          return;
        }

        const hasImage = await reader.hasImage();
        if (!hasImage) {
          vscode.window.showInformationMessage('No image found in clipboard.');
          return;
        }

        const { data, format } = await reader.readImage();
        const filePath = await imageStore.save(data, format);
        insertPathToTerminal(filePath);

        vscode.window.setStatusBarMessage('Image pasted to terminal', 3000);
      } catch (err) {
        handleCommandError('pasteImage', err);
      } finally {
        release();
      }
    },
  );

  const sendPathDisposable = vscode.commands.registerCommand(
    'terminalImgPaste.sendPathToTerminal',
    async (uri: vscode.Uri) => {
      try {
        if (!uri?.fsPath) {
          vscode.window.showErrorMessage(
            'Terminal Image Paste: No file selected.',
          );
          return;
        }

        insertPathToTerminal(uri.fsPath);
        vscode.window.setStatusBarMessage('Path sent to terminal', 3000);
      } catch (err) {
        handleCommandError('sendPathToTerminal', err);
      }
    },
  );

  context.subscriptions.push(pasteImageDisposable, sendPathDisposable);
  logger.info(`Extension activated (platform: ${platform.os}, WSL: ${platform.isWSL})`);
}

export function deactivate(): void {
  logger.info('Extension deactivating');
}
