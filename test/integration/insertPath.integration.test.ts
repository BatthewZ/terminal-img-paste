import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window, workspace } from 'vscode';

vi.mock('../../src/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), show: vi.fn() },
}));

vi.mock('../../src/terminal/shellDetect', () => ({
  detectShellType: vi.fn(() => 'bash'),
}));

import { insertPathToTerminal, quotePath } from '../../src/terminal/insertPath';
import { detectShellType } from '../../src/terminal/shellDetect';

let configValues: Record<string, unknown>;

function resetConfig(): void {
  configValues = { sendNewline: false };
}

function setConfig(key: string, value: unknown): void {
  configValues[key] = value;
}

function setupVscodeMock(hasTerminal = true): void {
  if (hasTerminal) {
    (window as any).activeTerminal = { sendText: vi.fn(), creationOptions: {} };
  } else {
    (window as any).activeTerminal = undefined;
  }
  vi.mocked(workspace.getConfiguration).mockImplementation(
    () =>
      ({
        get: vi.fn(<T>(key: string, defaultValue?: T): T => {
          const val = configValues[key];
          return (val !== undefined ? val : defaultValue) as T;
        }),
      }) as any,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetConfig();
  setupVscodeMock();
  vi.mocked(detectShellType).mockReturnValue('bash');
});

describe('insertPath integration — path quoting and sendText', () => {
  it('sends a correctly quoted simple path via sendText', () => {
    insertPathToTerminal('/home/user/images/screenshot.png');
    expect(window.activeTerminal!.sendText).toHaveBeenCalledWith(
      "'/home/user/images/screenshot.png'",
      false,
    );
  });

  it('handles paths with spaces, quotes, and unicode', () => {
    const complexPath = "/home/user/my images/it's a 截屏.png";
    insertPathToTerminal(complexPath);

    const expectedQuoted = quotePath(complexPath, 'bash');
    expect(window.activeTerminal!.sendText).toHaveBeenCalledWith(
      expectedQuoted,
      false,
    );
  });

  it('respects sendNewline=true config', () => {
    setConfig('sendNewline', true);
    insertPathToTerminal('/tmp/img.png');
    expect(window.activeTerminal!.sendText).toHaveBeenCalledWith(
      "'/tmp/img.png'",
      true,
    );
  });

  it('respects sendNewline=false config (default)', () => {
    insertPathToTerminal('/tmp/img.png');
    expect(window.activeTerminal!.sendText).toHaveBeenCalledWith(
      "'/tmp/img.png'",
      false,
    );
  });

  it('uses shell-specific quoting for powershell', () => {
    vi.mocked(detectShellType).mockReturnValue('powershell');
    insertPathToTerminal('/home/$var/img.png');
    expect(window.activeTerminal!.sendText).toHaveBeenCalledWith(
      '"/home/`$var/img.png"',
      false,
    );
  });

  it('uses shell-specific quoting for fish', () => {
    vi.mocked(detectShellType).mockReturnValue('fish');
    insertPathToTerminal("/home/it's here/img.png");
    expect(window.activeTerminal!.sendText).toHaveBeenCalledWith(
      "'/home/it\\'s here/img.png'",
      false,
    );
  });
});

describe('quotePath — special character handling', () => {
  it('handles path with only special characters', () => {
    const result = quotePath("$`'!\"\\", 'bash');
    // Should be safely quoted for bash
    expect(result).toContain("'");
  });

  it('handles Windows-style backslash paths in powershell', () => {
    const result = quotePath('C:\\Users\\test\\img.png', 'powershell');
    expect(result).toBe('"C:\\Users\\test\\img.png"');
  });

  it('handles empty string', () => {
    expect(quotePath('', 'bash')).toBe("''");
    expect(quotePath('', 'powershell')).toBe('""');
    expect(quotePath('', 'cmd')).toBe('""');
    expect(quotePath('', 'fish')).toBe("''");
  });
});
