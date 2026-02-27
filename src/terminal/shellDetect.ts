import * as vscode from 'vscode';
import * as path from 'path';

export type ShellType = 'bash' | 'zsh' | 'fish' | 'powershell' | 'cmd' | 'unknown';

const shellPatterns: Array<{ pattern: RegExp; type: ShellType }> = [
  { pattern: /\bbash\b/i, type: 'bash' },
  { pattern: /\bzsh\b/i, type: 'zsh' },
  { pattern: /\bfish\b/i, type: 'fish' },
  { pattern: /\b(?:pwsh|powershell)\b/i, type: 'powershell' },
  { pattern: /\bcmd\b/i, type: 'cmd' },
];

function matchShell(shellPath: string): ShellType {
  const base = path.basename(shellPath).replace(/\.exe$/i, '');
  for (const { pattern, type } of shellPatterns) {
    if (pattern.test(base)) {
      return type;
    }
  }
  return 'unknown';
}

export function detectShellType(terminal: vscode.Terminal): ShellType {
  // 1. Check terminal's explicit shell path
  const shellPath = (terminal.creationOptions as vscode.TerminalOptions)?.shellPath;
  if (shellPath) {
    return matchShell(shellPath);
  }

  // 2. Fall back to SHELL environment variable
  const envShell = process.env.SHELL;
  if (envShell) {
    return matchShell(envShell);
  }

  // 3. Windows default: PowerShell
  if (process.platform === 'win32') {
    return 'powershell';
  }

  return 'unknown';
}
