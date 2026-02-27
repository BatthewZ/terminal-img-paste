import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window, workspace } from 'vscode';

import { insertPathToTerminal, quotePath } from '../src/terminal/insertPath';
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
    (window as any).activeTerminal = { sendText: vi.fn(), creationOptions: { shellPath: '/bin/bash' } };
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
// quotePath unit tests
// ---------------------------------------------------------------------------
describe('quotePath', () => {
  // -- bash / zsh -----------------------------------------------------------
  describe('bash/zsh', () => {
    it('single-quotes a simple path', () => {
      expect(quotePath('/home/user/img.png', 'bash')).toBe("'/home/user/img.png'");
    });

    it('preserves spaces inside single quotes', () => {
      expect(quotePath('/home/user/my images/img.png', 'bash')).toBe("'/home/user/my images/img.png'");
    });

    it("escapes embedded single quotes with '\\''", () => {
      expect(quotePath("/home/it's here/img.png", 'bash')).toBe("'/home/it'\\''s here/img.png'");
    });

    it('keeps $, backticks, and ! safe inside single quotes', () => {
      expect(quotePath('/home/$HOME`whoami`!(test)', 'bash')).toBe("'/home/$HOME`whoami`!(test)'");
    });

    it('zsh uses same quoting as bash', () => {
      expect(quotePath("/it's a test", 'zsh')).toBe(quotePath("/it's a test", 'bash'));
    });
  });

  // -- fish -----------------------------------------------------------------
  describe('fish', () => {
    it('single-quotes a simple path', () => {
      expect(quotePath('/home/user/img.png', 'fish')).toBe("'/home/user/img.png'");
    });

    it("escapes single quotes with \\' (not '\\'')", () => {
      expect(quotePath("/home/it's here/img.png", 'fish')).toBe("'/home/it\\'s here/img.png'");
    });

    it('escapes backslashes', () => {
      expect(quotePath('/home/user\\dir/img.png', 'fish')).toBe("'/home/user\\\\dir/img.png'");
    });
  });

  // -- powershell -----------------------------------------------------------
  describe('powershell', () => {
    it('double-quotes a simple path', () => {
      expect(quotePath('/home/user/img.png', 'powershell')).toBe('"/home/user/img.png"');
    });

    it('handles path with single quotes (no escape needed)', () => {
      expect(quotePath("/home/it's here/img.png", 'powershell')).toBe("\"/home/it's here/img.png\"");
    });

    it('escapes $ with `$', () => {
      expect(quotePath('/home/$var/img.png', 'powershell')).toBe('"/home/`$var/img.png"');
    });

    it('escapes backticks with ``', () => {
      expect(quotePath('/home/`tick/img.png', 'powershell')).toBe('"/home/``tick/img.png"');
    });

    it('escapes double quotes with `"', () => {
      expect(quotePath('/home/"quoted"/img.png', 'powershell')).toBe('"/home/`"quoted`"/img.png"');
    });
  });

  // -- cmd ------------------------------------------------------------------
  describe('cmd', () => {
    it('double-quotes a simple path', () => {
      expect(quotePath('/home/user/img.png', 'cmd')).toBe('"/home/user/img.png"');
    });

    it('escapes % with %%', () => {
      expect(quotePath('/home/%VAR%/img.png', 'cmd')).toBe('"/home/%%VAR%%/img.png"');
    });

    it('escapes double quotes with ""', () => {
      expect(quotePath('/home/"quoted"/img.png', 'cmd')).toBe('"/home/""quoted""/img.png"');
    });
  });

  // -- unknown --------------------------------------------------------------
  describe('unknown', () => {
    it('falls back to bash-style quoting', () => {
      expect(quotePath("/it's a test", 'unknown')).toBe(quotePath("/it's a test", 'bash'));
    });
  });
});

// ---------------------------------------------------------------------------
// insertPathToTerminal integration tests
// ---------------------------------------------------------------------------
describe('insertPathToTerminal', () => {
  // -- Path quoting (existing tests, still pass with bash default) ----------

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
      "Inserted path into terminal (bash): '/home/user/img.png'",
    );
  });

  // -- Shell-aware integration tests ----------------------------------------

  it('uses fish quoting when shell is fish', () => {
    (window as any).activeTerminal = { sendText: vi.fn(), creationOptions: { shellPath: '/usr/bin/fish' } };
    insertPathToTerminal("/home/it's here/img.png");
    expect(window.activeTerminal!.sendText).toHaveBeenCalledWith(
      "'/home/it\\'s here/img.png'",
      false,
    );
  });

  it('uses powershell quoting when shell is powershell', () => {
    (window as any).activeTerminal = { sendText: vi.fn(), creationOptions: { shellPath: '/usr/bin/pwsh' } };
    insertPathToTerminal('/home/$var/img.png');
    expect(window.activeTerminal!.sendText).toHaveBeenCalledWith(
      '"/home/`$var/img.png"',
      false,
    );
  });

  it('uses cmd quoting when shell is cmd', () => {
    (window as any).activeTerminal = { sendText: vi.fn(), creationOptions: { shellPath: 'C:\\Windows\\System32\\cmd.exe' } };
    insertPathToTerminal('/home/%VAR%/img.png');
    expect(window.activeTerminal!.sendText).toHaveBeenCalledWith(
      '"/home/%%VAR%%/img.png"',
      false,
    );
  });

  it('detects shell type from terminal creationOptions', () => {
    (window as any).activeTerminal = { sendText: vi.fn(), creationOptions: { shellPath: '/usr/bin/zsh' } };
    insertPathToTerminal('/tmp/img.png');
    expect(window.activeTerminal!.sendText).toHaveBeenCalledWith(
      "'/tmp/img.png'",
      false,
    );
  });
});
