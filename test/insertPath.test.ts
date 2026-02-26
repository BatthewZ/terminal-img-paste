import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window, workspace } from 'vscode';

vi.mock('../src/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), show: vi.fn() },
}));

import { insertPathToTerminal } from '../src/terminal/insertPath';
import { logger } from '../src/util/logger';

// ---------------------------------------------------------------------------
// Test-local config store (mirrors the pattern in imageStore.test.ts)
// ---------------------------------------------------------------------------
let configValues: Record<string, unknown>;

function resetConfig(): void {
  configValues = { sendNewline: false };
}

function setConfig(key: string, value: unknown): void {
  configValues[key] = value;
}

/** Re-establish the vscode mocks after vitest's mockReset clears them. */
function setupVscodeMock(hasTerminal = true): void {
  if (hasTerminal) {
    (window as any).activeTerminal = { sendText: vi.fn() };
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
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('insertPathToTerminal', () => {
  // -- Path quoting --------------------------------------------------------

  it('single-quotes a simple path', () => {
    insertPathToTerminal('/home/user/img.png');
    expect(window.activeTerminal!.sendText).toHaveBeenCalledWith(
      "'/home/user/img.png'",
      false,
    );
  });

  it('preserves spaces inside single quotes', () => {
    insertPathToTerminal('/home/user/my images/img.png');
    expect(window.activeTerminal!.sendText).toHaveBeenCalledWith(
      "'/home/user/my images/img.png'",
      false,
    );
  });

  it("escapes embedded single quotes with '\\''", () => {
    insertPathToTerminal("/home/user/it's here/img.png");
    expect(window.activeTerminal!.sendText).toHaveBeenCalledWith(
      "'/home/user/it'\\''s here/img.png'",
      false,
    );
  });

  it('escapes multiple single quotes', () => {
    insertPathToTerminal("it's a 'test' path");
    expect(window.activeTerminal!.sendText).toHaveBeenCalledWith(
      "'it'\\''s a '\\''test'\\'' path'",
      false,
    );
  });

  it('keeps special shell characters safe inside single quotes', () => {
    insertPathToTerminal('/home/user/$HOME`whoami`!(test)');
    expect(window.activeTerminal!.sendText).toHaveBeenCalledWith(
      "'/home/user/$HOME`whoami`!(test)'",
      false,
    );
  });

  // -- sendNewline config --------------------------------------------------

  it('passes addNewline=false by default', () => {
    insertPathToTerminal('/tmp/img.png');
    expect(window.activeTerminal!.sendText).toHaveBeenCalledWith(
      "'/tmp/img.png'",
      false,
    );
  });

  it('passes addNewline=true when sendNewline config is true', () => {
    setConfig('sendNewline', true);
    insertPathToTerminal('/tmp/img.png');
    expect(window.activeTerminal!.sendText).toHaveBeenCalledWith(
      "'/tmp/img.png'",
      true,
    );
  });

  // -- No active terminal --------------------------------------------------

  it('shows an error and does not sendText when no terminal is active', () => {
    setupVscodeMock(false);

    insertPathToTerminal('/tmp/img.png');

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'Terminal Image Paste: No active terminal. Please open a terminal first.',
    );
  });

  // -- Edge cases ----------------------------------------------------------

  it('handles empty string path', () => {
    insertPathToTerminal('');
    expect(window.activeTerminal!.sendText).toHaveBeenCalledWith("''", false);
  });

  it('handles unicode characters in path', () => {
    insertPathToTerminal('/home/user/图片/截屏.png');
    expect(window.activeTerminal!.sendText).toHaveBeenCalledWith(
      "'/home/user/图片/截屏.png'",
      false,
    );
  });

  it("handles path that is only a single quote", () => {
    insertPathToTerminal("'");
    expect(window.activeTerminal!.sendText).toHaveBeenCalledWith(
      "''\\'''",
      false,
    );
  });

  // -- Logger --------------------------------------------------------------

  it('logs the quoted path via logger.info', () => {
    insertPathToTerminal('/home/user/img.png');
    expect(logger.info).toHaveBeenCalledWith(
      "Inserted path into terminal: '/home/user/img.png'",
    );
  });
});
