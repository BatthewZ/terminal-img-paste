import * as vscode from 'vscode';
import { logger } from '../util/logger';

/**
 * Send a file path to the active terminal.
 * Quotes the path if it contains spaces.
 * Reads `sendNewline` setting to decide whether to append a newline.
 */
export function insertPathToTerminal(filePath: string): void {
  const terminal = vscode.window.activeTerminal;
  if (!terminal) {
    vscode.window.showErrorMessage(
      'Terminal Image Paste: No active terminal. Please open a terminal first.',
    );
    return;
  }

  const text = filePath.includes(' ') ? `"${filePath}"` : filePath;

  const config = vscode.workspace.getConfiguration('terminalImgPaste');
  const addNewline = config.get<boolean>('sendNewline', false);

  terminal.sendText(text, addNewline);
  logger.info(`Inserted path into terminal: ${text}`);
}
