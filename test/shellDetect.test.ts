import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectShellType } from '../src/terminal/shellDetect';
import type { Terminal, TerminalOptions } from 'vscode';

function makeTerminal(shellPath?: string): Terminal {
  return {
    creationOptions: shellPath ? { shellPath } : {},
    name: 'test',
    processId: Promise.resolve(1),
    sendText: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
    state: { isInteractedWith: false },
    exitStatus: undefined,
  } as unknown as Terminal;
}

describe('detectShellType', () => {
  let originalShell: string | undefined;
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalShell = process.env.SHELL;
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  });

  afterEach(() => {
    if (originalShell !== undefined) {
      process.env.SHELL = originalShell;
    } else {
      delete process.env.SHELL;
    }
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  // -- Detection from shellPath ---------------------------------------------

  it('detects bash from shellPath', () => {
    expect(detectShellType(makeTerminal('/usr/bin/bash'))).toBe('bash');
  });

  it('detects zsh from shellPath', () => {
    expect(detectShellType(makeTerminal('/usr/bin/zsh'))).toBe('zsh');
  });

  it('detects fish from shellPath', () => {
    expect(detectShellType(makeTerminal('/usr/local/bin/fish'))).toBe('fish');
  });

  it('detects PowerShell from pwsh.exe path', () => {
    expect(detectShellType(makeTerminal('C:\\Program Files\\PowerShell\\7\\pwsh.exe'))).toBe('powershell');
  });

  it('detects PowerShell from powershell.exe path', () => {
    expect(detectShellType(makeTerminal('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'))).toBe('powershell');
  });

  it('detects cmd from shellPath', () => {
    expect(detectShellType(makeTerminal('C:\\Windows\\System32\\cmd.exe'))).toBe('cmd');
  });

  it('returns unknown for unrecognized shell', () => {
    expect(detectShellType(makeTerminal('/some/custom/shell'))).toBe('unknown');
  });

  it('is case-insensitive for shellPath', () => {
    expect(detectShellType(makeTerminal('/usr/bin/Fish'))).toBe('fish');
  });

  // -- Fallback to SHELL env ------------------------------------------------

  it('falls back to SHELL env when shellPath is undefined', () => {
    process.env.SHELL = '/bin/fish';
    expect(detectShellType(makeTerminal())).toBe('fish');
  });

  // -- Windows default ------------------------------------------------------

  it('defaults to powershell on Windows when SHELL is unset', () => {
    delete process.env.SHELL;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    expect(detectShellType(makeTerminal())).toBe('powershell');
  });

  // -- Final fallback -------------------------------------------------------

  it('returns unknown when nothing matches on Linux', () => {
    delete process.env.SHELL;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    expect(detectShellType(makeTerminal())).toBe('unknown');
  });
});
