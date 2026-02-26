import * as vscode from 'vscode';
import { logger } from '../util/logger';

/**
 * Send a file path to the active terminal.
 * Single-quotes the path to prevent shell expansion of special characters.
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

  // Single-quote the path, escaping any embedded single quotes
  const text = "'" + filePath.replace(/'/g, "'\\''") + "'";

  const config = vscode.workspace.getConfiguration('terminalImgPaste');
  const addNewline = config.get<boolean>('sendNewline', false);

  terminal.sendText(text, addNewline);
  logger.info(`Inserted path into terminal: ${text}`);
}
