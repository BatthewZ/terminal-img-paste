import * as vscode from 'vscode';
import { logger } from '../util/logger';
import { detectShellType, type ShellType } from './shellDetect';

/**
 * Quote a file path for safe insertion into a specific shell.
 */
export function quotePath(filePath: string, shell: ShellType): string {
  switch (shell) {
    case 'fish':
      // Fish uses single quotes but escapes ' with \'
      return "'" + filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
    case 'powershell':
      // PowerShell uses double quotes; escape ` with ``, $ with `$, " with `"
      return '"' + filePath.replace(/`/g, '``').replace(/\$/g, '`$').replace(/"/g, '`"') + '"';
    case 'cmd':
      // cmd uses double quotes; escape % with %%, " with ""
      return '"' + filePath.replace(/%/g, '%%').replace(/"/g, '""') + '"';
    case 'bash':
    case 'zsh':
    case 'unknown':
    default:
      // Single-quote the path, escape embedded single quotes with '\''
      return "'" + filePath.replace(/'/g, "'\\''") + "'";
  }
}

/**
 * Send a file path to the active terminal.
 * Detects the shell type and applies the correct quoting strategy.
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

  const shellType = detectShellType(terminal);
  const text = quotePath(filePath, shellType);

  const config = vscode.workspace.getConfiguration('terminalImgPaste');
  const addNewline = config.get<boolean>('sendNewline', false);

  terminal.sendText(text, addNewline);
  logger.info(`Inserted path into terminal (${shellType}): ${text}`);
}
