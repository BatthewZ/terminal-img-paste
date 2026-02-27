import * as vscode from 'vscode';

export interface Logger {
  info(message: string): void;
  warn(message: string, err?: unknown): void;
  error(message: string, err?: unknown): void;
  show(): void;
}

function timestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `[${h}:${m}:${s}.${ms}]`;
}

export function createLogger(name: string): Logger {
  const channel = vscode.window.createOutputChannel(name);

  return {
    info(message: string): void {
      channel.appendLine(`${timestamp()} [INFO] ${message}`);
    },

    warn(message: string, err?: unknown): void {
      let line = `${timestamp()} [WARN] ${message}`;
      if (err !== undefined) {
        if (err instanceof Error && err.stack) {
          line += `\n${err.stack}`;
        } else {
          line += `\n${String(err)}`;
        }
      }
      channel.appendLine(line);
    },

    error(message: string, err?: unknown): void {
      let line = `${timestamp()} [ERROR] ${message}`;
      if (err !== undefined) {
        if (err instanceof Error && err.stack) {
          line += `\n${err.stack}`;
        } else {
          line += `\n${String(err)}`;
        }
      }
      channel.appendLine(line);
    },

    show(): void {
      channel.show();
    },
  };
}

export const logger: Logger = createLogger('Terminal Image Paste');
