import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, window, env } from 'vscode';

vi.mock('../src/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/terminal/shellDetect', () => ({
  detectShellType: vi.fn(() => 'bash'),
}));

vi.mock('../src/platform/remote', () => ({
  detectRemoteContext: vi.fn(() => ({ remote: false })),
}));

import {
  gatherDiagnostics,
  formatDiagnosticsMarkdown,
  type DiagnosticReport,
} from '../src/commands/diagnostics';
import type { PlatformInfo } from '../src/platform/detect';
import type { ClipboardReader, ClipboardFormat, ClipboardImageResult } from '../src/clipboard/types';
import { FallbackClipboardReader } from '../src/clipboard/fallback';
import { detectShellType } from '../src/terminal/shellDetect';
import { detectRemoteContext } from '../src/platform/remote';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makePlatform(overrides?: Partial<PlatformInfo>): PlatformInfo {
  return {
    os: 'linux',
    isWSL: false,
    wslVersion: null,
    hasWslg: false,
    displayServer: 'x11',
    powershellPath: null,
    ...overrides,
  };
}

function makeReader(overrides?: Partial<ClipboardReader>): ClipboardReader {
  return {
    requiredTool: () => 'xclip',
    isToolAvailable: vi.fn(async () => true),
    hasImage: vi.fn(async () => false),
    readImage: vi.fn(async (): Promise<ClipboardImageResult> => ({
      data: Buffer.alloc(0),
      format: 'png',
    })),
    detectFormat: vi.fn(async (): Promise<ClipboardFormat> => 'png'),
    ...overrides,
  };
}

let configValues: Record<string, unknown>;

function resetConfig(): void {
  configValues = {
    folderName: '.tip-images',
    maxImages: 20,
    autoGitIgnore: true,
    sendNewline: false,
    saveFormat: 'auto',
    showPreview: false,
    warnOnRemote: true,
    notifications: 'all',
    organizeFolders: 'flat',
    filenamePattern: 'img-{timestamp}',
  };
}

function setupVscodeMock(): void {
  (workspace as any).workspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
  vi.mocked(workspace.getConfiguration).mockImplementation(
    () =>
      ({
        get: vi.fn(<T>(key: string, defaultValue?: T): T => {
          const val = configValues[key];
          return (val !== undefined ? val : defaultValue) as T;
        }),
      }) as any,
  );
  (window as any).activeTerminal = { sendText: vi.fn(), creationOptions: {} };
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetConfig();
  setupVscodeMock();
  vi.mocked(detectShellType).mockReturnValue('bash');
  vi.mocked(detectRemoteContext).mockReturnValue({ remote: false });
});

// ---------------------------------------------------------------------------
// gatherDiagnostics
// ---------------------------------------------------------------------------
describe('gatherDiagnostics', () => {
  it('returns all report sections', async () => {
    const report = await gatherDiagnostics(makePlatform(), makeReader());

    expect(report.platform).toBeDefined();
    expect(report.clipboard).toBeDefined();
    expect(report.storage).toBeDefined();
    expect(report.settings).toBeDefined();
    expect(report.terminal).toBeDefined();
  });

  it('reports Linux/X11 platform correctly', async () => {
    const report = await gatherDiagnostics(
      makePlatform({ os: 'linux', displayServer: 'x11' }),
      makeReader(),
    );

    expect(report.platform.os).toBe('linux');
    expect(report.platform.isWsl).toBe(false);
    expect(report.platform.displayServer).toBe('x11');
  });

  it('reports WSL2 with WSLg platform correctly', async () => {
    const report = await gatherDiagnostics(
      makePlatform({
        os: 'linux',
        isWSL: true,
        wslVersion: 2,
        hasWslg: true,
        displayServer: 'wayland',
        powershellPath: '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
      }),
      makeReader(),
    );

    expect(report.platform.isWsl).toBe(true);
    expect(report.platform.wslVersion).toBe('WSL2');
    expect(report.platform.hasWslg).toBe('Yes');
    expect(report.platform.powershellPath).toContain('powershell.exe');
  });

  it('checks tool availability for each reader in fallback chain', async () => {
    const r1 = makeReader({ requiredTool: () => 'xclip' });
    const r2 = makeReader({
      requiredTool: () => 'wl-paste',
      isToolAvailable: vi.fn(async () => false),
    });
    const fallback = new FallbackClipboardReader([r1, r2]);

    const report = await gatherDiagnostics(makePlatform(), fallback);

    expect(report.clipboard.readers).toHaveLength(2);
    expect(report.clipboard.readers[0].available).toBe('Yes');
    expect(report.clipboard.readers[1].available).toBe('No');
  });

  it('handles detectFormat failure gracefully', async () => {
    const reader = makeReader({
      detectFormat: vi.fn(async () => {
        throw new Error('No clipboard content');
      }),
    });

    const report = await gatherDiagnostics(makePlatform(), reader);

    expect(report.clipboard.detectedFormat).toContain('Error');
    expect(report.clipboard.detectedFormat).toContain('No clipboard content');
  });

  it('handles isToolAvailable failure gracefully', async () => {
    const reader = makeReader({
      isToolAvailable: vi.fn(async () => {
        throw new Error('spawn failed');
      }),
    });

    const report = await gatherDiagnostics(makePlatform(), reader);

    expect(report.clipboard.readers[0].available).toContain('Error');
  });

  it('reports terminal shell type', async () => {
    vi.mocked(detectShellType).mockReturnValue('fish');

    const report = await gatherDiagnostics(makePlatform(), makeReader());

    expect(report.terminal.activeShell).toBe('fish');
  });

  it('handles no active terminal', async () => {
    (window as any).activeTerminal = undefined;

    const report = await gatherDiagnostics(makePlatform(), makeReader());

    expect(report.terminal.activeShell).toBe('No active terminal');
  });

  it('reports remote context', async () => {
    vi.mocked(detectRemoteContext).mockReturnValue({ remote: true, type: 'ssh-remote' });

    const report = await gatherDiagnostics(makePlatform(), makeReader());

    expect(report.terminal.isRemote).toBe(true);
    expect(report.terminal.remoteName).toBe('ssh-remote');
  });

  it('handles no workspace folder', async () => {
    (workspace as any).workspaceFolders = undefined;

    const report = await gatherDiagnostics(makePlatform(), makeReader());

    expect(report.storage.workspaceFolder).toBe('None');
  });

  it('reports all settings', async () => {
    const report = await gatherDiagnostics(makePlatform(), makeReader());

    expect(report.settings.maxImages).toBe(20);
    expect(report.settings.autoGitIgnore).toBe(true);
    expect(report.settings.sendNewline).toBe(false);
    expect(report.settings.showPreview).toBe(false);
    expect(report.settings.notifications).toBe('all');
    expect(report.settings.saveFormat).toBe('auto');
  });

  it('reports a single reader (not FallbackClipboardReader)', async () => {
    const reader = makeReader();

    const report = await gatherDiagnostics(makePlatform(), reader);

    expect(report.clipboard.readers).toHaveLength(1);
    // Constructor.name won't be meaningful for plain objects but the code handles it
  });
});

// ---------------------------------------------------------------------------
// formatDiagnosticsMarkdown
// ---------------------------------------------------------------------------
describe('formatDiagnosticsMarkdown', () => {
  function makeReport(overrides?: Partial<DiagnosticReport>): DiagnosticReport {
    return {
      platform: {
        os: 'linux',
        isWsl: false,
        wslVersion: 'N/A',
        hasWslg: 'N/A',
        displayServer: 'x11',
        powershellPath: 'N/A',
      },
      clipboard: {
        readers: [{ name: 'LinuxClipboardReader', available: 'Yes' }],
        detectedFormat: 'png',
      },
      storage: {
        workspaceFolder: '/home/user/project',
        imageFolder: '/home/user/project/.tip-images',
        imageCount: '3 / 20',
        organizeFolders: 'flat',
        filenamePattern: 'img-{timestamp}',
      },
      settings: {
        maxImages: 20,
        autoGitIgnore: true,
        sendNewline: false,
        showPreview: false,
        notifications: 'all',
        saveFormat: 'auto',
        folderName: '.tip-images',
        warnOnRemote: true,
      },
      terminal: {
        activeShell: 'bash',
        isRemote: false,
        remoteName: 'N/A',
      },
      ...overrides,
    };
  }

  it('contains the main heading', () => {
    const md = formatDiagnosticsMarkdown(makeReport());
    expect(md).toContain('# Terminal Image Paste — Diagnostics');
  });

  it('contains all section headings', () => {
    const md = formatDiagnosticsMarkdown(makeReport());
    expect(md).toContain('## Platform');
    expect(md).toContain('## Clipboard');
    expect(md).toContain('## Storage');
    expect(md).toContain('## Settings');
    expect(md).toContain('## Terminal');
  });

  it('includes platform info in tables', () => {
    const md = formatDiagnosticsMarkdown(makeReport());
    expect(md).toContain('| OS | linux |');
    expect(md).toContain('| WSL | No |');
    expect(md).toContain('| Display Server | x11 |');
  });

  it('shows WSL details when WSL is true', () => {
    const report = makeReport({
      platform: {
        os: 'linux',
        isWsl: true,
        wslVersion: 'WSL2',
        hasWslg: 'Yes',
        displayServer: 'wayland',
        powershellPath: '/mnt/c/powershell.exe',
      },
    });
    const md = formatDiagnosticsMarkdown(report);
    expect(md).toContain('| WSL | Yes (WSL2) |');
    expect(md).toContain('| WSLg | Yes |');
    expect(md).toContain('| PowerShell Path | /mnt/c/powershell.exe |');
  });

  it('hides WSLg row when not WSL', () => {
    const md = formatDiagnosticsMarkdown(makeReport());
    expect(md).not.toContain('WSLg');
  });

  it('includes clipboard reader table', () => {
    const md = formatDiagnosticsMarkdown(makeReport());
    expect(md).toContain('| LinuxClipboardReader | Yes |');
    expect(md).toContain('| Detected Format | png |');
  });

  it('includes storage info', () => {
    const md = formatDiagnosticsMarkdown(makeReport());
    expect(md).toContain('| Image Count | 3 / 20 |');
    expect(md).toContain('| Organization | flat |');
  });

  it('includes settings', () => {
    const md = formatDiagnosticsMarkdown(makeReport());
    expect(md).toContain('| maxImages | 20 |');
    expect(md).toContain('| saveFormat | auto |');
  });

  it('includes terminal info', () => {
    const md = formatDiagnosticsMarkdown(makeReport());
    expect(md).toContain('| Active Shell | bash |');
    expect(md).toContain('| Remote | No |');
  });

  it('shows remote name when remote is true', () => {
    const report = makeReport({
      terminal: {
        activeShell: 'bash',
        isRemote: true,
        remoteName: 'ssh-remote',
      },
    });
    const md = formatDiagnosticsMarkdown(report);
    expect(md).toContain('| Remote | Yes |');
    expect(md).toContain('| Remote Name | ssh-remote |');
  });

  it('includes generated timestamp', () => {
    const md = formatDiagnosticsMarkdown(makeReport());
    expect(md).toContain('*Generated at');
  });
});
