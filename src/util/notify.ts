import * as vscode from 'vscode';
import { logger } from './logger';

export type NotificationLevel = 'all' | 'errors' | 'none';

export interface Notifier {
  /** Show a success/info status bar message (suppressed at 'errors' and 'none'). */
  statusBar(message: string, durationMs?: number): void;

  /** Show an informational message popup (suppressed at 'errors' and 'none'). */
  info(message: string): void;

  /** Show a warning message popup (suppressed at 'errors' and 'none'). Returns the button choice or undefined. */
  warning(message: string, ...buttons: string[]): Promise<string | undefined>;

  /** Show an error message popup (suppressed at 'none'). Always logged to output channel. */
  error(message: string): void;
}

function getLevel(): NotificationLevel {
  return vscode.workspace
    .getConfiguration('terminalImgPaste')
    .get<NotificationLevel>('notifications', 'all');
}

export function createNotifier(): Notifier {
  return {
    statusBar(message: string, durationMs = 3000): void {
      logger.info(message);
      if (getLevel() === 'all') {
        vscode.window.setStatusBarMessage(message, durationMs);
      }
    },

    info(message: string): void {
      logger.info(message);
      if (getLevel() === 'all') {
        vscode.window.showInformationMessage(message);
      }
    },

    async warning(message: string, ...buttons: string[]): Promise<string | undefined> {
      logger.warn(message);
      if (getLevel() === 'all') {
        return vscode.window.showWarningMessage(message, ...buttons);
      }
      // When suppressed with action buttons, auto-approve (first button)
      // so confirmation dialogs don't silently block operations.
      return buttons.length > 0 ? buttons[0] : undefined;
    },

    error(message: string): void {
      logger.error(message);
      const level = getLevel();
      if (level === 'all' || level === 'errors') {
        vscode.window.showErrorMessage(message);
      }
    },
  };
}

export const notify: Notifier = createNotifier();
