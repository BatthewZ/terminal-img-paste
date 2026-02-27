import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  commands,
  window,
  __getRegisteredCommand,
  __clearRegisteredCommands,
  __setConfig,
  __resetConfig,
  __setRemoteName,
} from 'vscode';

// ---------------------------------------------------------------------------
// Mocks at module boundaries
// ---------------------------------------------------------------------------
vi.mock('../src/clipboard/index', () => ({
  createClipboardReader: vi.fn(),
}));

vi.mock('../src/storage/imageStore', () => ({
  createImageStore: vi.fn(),
}));

vi.mock('../src/terminal/insertPath', () => ({
  insertPathToTerminal: vi.fn(),
}));

vi.mock('../src/platform/detect', () => ({
  detectPlatform: vi.fn(() => ({
    os: 'linux',
    isWSL: false,
    displayServer: 'x11',
    powershellPath: null,
  })),
}));

vi.mock('../src/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), show: vi.fn() },
}));

vi.mock('../src/util/notify', () => ({
  notify: {
    statusBar: vi.fn(),
    info: vi.fn(),
    warning: vi.fn().mockResolvedValue(undefined),
    error: vi.fn(),
  },
}));

vi.mock('../src/image/convert', () => ({
  convertImage: vi.fn(async (data: Buffer, format: string) => ({ data, format })),
}));

vi.mock('../src/platform/remote', () => ({
  detectRemoteContext: vi.fn(() => ({ remote: false })),
}));

vi.mock('../src/views/previewPanel', () => ({
  showImagePreview: vi.fn().mockResolvedValue(true),
}));

// Import after mocks
import { activate, deactivate } from '../src/extension';
import { createClipboardReader } from '../src/clipboard/index';
import { createImageStore } from '../src/storage/imageStore';
import { insertPathToTerminal } from '../src/terminal/insertPath';
import { convertImage } from '../src/image/convert';
import { detectRemoteContext } from '../src/platform/remote';
import { showImagePreview } from '../src/views/previewPanel';
import { logger } from '../src/util/logger';
import { notify } from '../src/util/notify';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeContext() {
  return { subscriptions: [] } as unknown as import('vscode').ExtensionContext;
}

/** Build a mock ClipboardReader with sensible defaults. */
function makeMockReader(overrides: Partial<{
  isToolAvailable: () => Promise<boolean>;
  hasImage: () => Promise<boolean>;
  readImage: () => Promise<{ data: Buffer; format: string }>;
  requiredTool: () => string;
}> = {}) {
  return {
    isToolAvailable: overrides.isToolAvailable ?? vi.fn().mockResolvedValue(true),
    hasImage: overrides.hasImage ?? vi.fn().mockResolvedValue(true),
    readImage: overrides.readImage ?? vi.fn().mockResolvedValue({ data: Buffer.from('PNG'), format: 'png' }),
    requiredTool: overrides.requiredTool ?? vi.fn().mockReturnValue('xclip'),
  };
}

function makeMockImageStore(overrides: Partial<{
  save: (buf: Buffer) => Promise<string>;
}> = {}) {
  return {
    save: overrides.save ?? vi.fn().mockResolvedValue('/test/workspace/.tip-images/img.png'),
    cleanup: vi.fn(),
    ensureGitIgnored: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.restoreAllMocks();
  __clearRegisteredCommands();
  __resetConfig();
  __setRemoteName(undefined);

  // Re-establish default mock implementations after mockReset
  vi.mocked(createClipboardReader).mockReturnValue(makeMockReader() as any);
  vi.mocked(createImageStore).mockReturnValue(makeMockImageStore() as any);
  vi.mocked(detectRemoteContext).mockReturnValue({ remote: false });
});

// ---------------------------------------------------------------------------
// activate()
// ---------------------------------------------------------------------------
describe('activate', () => {
  it('registers the pasteImage command', () => {
    activate(makeContext());
    expect(commands.registerCommand).toHaveBeenCalledWith(
      'terminalImgPaste.pasteImage',
      expect.any(Function),
    );
  });

  it('registers the sendPathToTerminal command', () => {
    activate(makeContext());
    expect(commands.registerCommand).toHaveBeenCalledWith(
      'terminalImgPaste.sendPathToTerminal',
      expect.any(Function),
    );
  });

  it('pushes all disposables to context.subscriptions', () => {
    const ctx = makeContext();
    activate(ctx);
    // 3 command disposables + 1 EventEmitter (pasteEmitter)
    expect(ctx.subscriptions).toHaveLength(4);
  });

  it('returns API object with all expected methods', () => {
    const api = activate(makeContext());
    expect(api).toBeDefined();
    expect(typeof api.pasteFromClipboard).toBe('function');
    expect(typeof api.sendPathToTerminal).toBe('function');
    expect(typeof api.getImageFolder).toBe('function');
    expect(typeof api.onImagePasted).toBe('function');
  });

  it('logs activation with platform info', () => {
    activate(makeContext());
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Extension activated'),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('platform:'),
    );
  });

  it('checks tool availability on startup', () => {
    const reader = makeMockReader();
    vi.mocked(createClipboardReader).mockReturnValue(reader as any);
    activate(makeContext());
    expect(reader.isToolAvailable).toHaveBeenCalled();
  });

  it('shows warning when clipboard tool is not available on startup', async () => {
    const reader = makeMockReader({
      isToolAvailable: vi.fn().mockResolvedValue(false),
    });
    vi.mocked(createClipboardReader).mockReturnValue(reader as any);
    activate(makeContext());

    // Let the promise chain settle
    await vi.waitFor(() => {
      expect(notify.warning).toHaveBeenCalledWith(
        expect.stringContaining('not found'),
      );
    });
  });

  it('logs error when tool availability check rejects', async () => {
    const reader = makeMockReader({
      isToolAvailable: vi.fn().mockRejectedValue(new Error('spawn fail')),
    });
    vi.mocked(createClipboardReader).mockReturnValue(reader as any);
    activate(makeContext());

    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to check tool availability'),
        expect.any(Error),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// pasteImage command handler
// ---------------------------------------------------------------------------
describe('pasteImage command handler', () => {
  it('reads clipboard image, converts it, saves it, and inserts path to terminal', async () => {
    const reader = makeMockReader();
    const store = makeMockImageStore();
    vi.mocked(createClipboardReader).mockReturnValue(reader as any);
    vi.mocked(createImageStore).mockReturnValue(store as any);

    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.pasteImage')!;
    await handler();

    expect(reader.isToolAvailable).toHaveBeenCalled();
    expect(reader.hasImage).toHaveBeenCalled();
    expect(reader.readImage).toHaveBeenCalled();
    expect(convertImage).toHaveBeenCalledWith(
      Buffer.from('PNG'),
      'png',
      'auto',
      expect.objectContaining({ os: 'linux' }),
    );
    expect(store.save).toHaveBeenCalledWith(Buffer.from('PNG'), 'png');
    expect(insertPathToTerminal).toHaveBeenCalledWith(
      '/test/workspace/.tip-images/img.png',
    );
  });

  it('shows status bar message on success', async () => {
    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.pasteImage')!;
    await handler();

    expect(notify.statusBar).toHaveBeenCalledWith(
      'Image pasted to terminal',
      3000,
    );
  });

  it('shows info message when clipboard has no image', async () => {
    const reader = makeMockReader({
      hasImage: vi.fn().mockResolvedValue(false),
    });
    vi.mocked(createClipboardReader).mockReturnValue(reader as any);

    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.pasteImage')!;
    await handler();

    expect(notify.info).toHaveBeenCalledWith(
      'No image found in clipboard.',
    );
    expect(insertPathToTerminal).not.toHaveBeenCalled();
  });

  it('shows warning when tool is not available at paste time', async () => {
    const reader = makeMockReader({
      isToolAvailable: vi.fn().mockResolvedValue(false),
    });
    vi.mocked(createClipboardReader).mockReturnValue(reader as any);

    activate(makeContext());

    // Wait for the startup tool check to settle
    await new Promise((r) => setTimeout(r, 0));

    const handler = __getRegisteredCommand('terminalImgPaste.pasteImage')!;
    await handler();

    expect(notify.warning).toHaveBeenCalledWith(
      expect.stringContaining('is not installed'),
    );
    expect(insertPathToTerminal).not.toHaveBeenCalled();
  });

  it('shows error when readImage throws', async () => {
    const reader = makeMockReader({
      readImage: vi.fn().mockRejectedValue(new Error('pngpaste crashed')),
    });
    vi.mocked(createClipboardReader).mockReturnValue(reader as any);

    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.pasteImage')!;
    await handler();

    expect(notify.error).toHaveBeenCalledWith(
      expect.stringContaining('pngpaste crashed'),
    );
  });

  it('shows error when imageStore.save throws', async () => {
    const store = makeMockImageStore({
      save: vi.fn().mockRejectedValue(new Error('No workspace folder is open')),
    });
    vi.mocked(createImageStore).mockReturnValue(store as any);

    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.pasteImage')!;
    await handler();

    expect(notify.error).toHaveBeenCalledWith(
      expect.stringContaining('No workspace folder is open'),
    );
  });

  it('serializes concurrent paste calls via mutex', async () => {
    const order: number[] = [];
    let callCount = 0;

    const reader = makeMockReader({
      readImage: vi.fn().mockImplementation(async () => {
        const n = ++callCount;
        // Simulate some async work
        await new Promise((r) => setTimeout(r, 10));
        order.push(n);
        return { data: Buffer.from('PNG'), format: 'png' };
      }),
    });
    vi.mocked(createClipboardReader).mockReturnValue(reader as any);

    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.pasteImage')!;

    // Fire two concurrent pastes
    const p1 = handler();
    const p2 = handler();
    await Promise.all([p1, p2]);

    // Should execute sequentially (1 then 2), not interleaved
    expect(order).toEqual([1, 2]);
  });

  it('releases mutex even when an error occurs', async () => {
    const reader = makeMockReader({
      readImage: vi.fn().mockRejectedValueOnce(new Error('fail')),
    });
    vi.mocked(createClipboardReader).mockReturnValue(reader as any);

    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.pasteImage')!;

    // First call fails
    await handler();

    // Reset readImage to succeed on second call
    vi.mocked(reader.readImage).mockResolvedValueOnce({ data: Buffer.from('PNG2'), format: 'png' } as any);

    // Second call should succeed (mutex was released)
    await handler();
    expect(insertPathToTerminal).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Remote terminal awareness
// ---------------------------------------------------------------------------
describe('pasteImage remote terminal awareness', () => {
  it('shows warning when in SSH remote context', async () => {
    vi.mocked(detectRemoteContext).mockReturnValue({ remote: true, type: 'ssh-remote' });
    vi.mocked(window.showWarningMessage).mockResolvedValue('Cancel' as any);

    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.pasteImage')!;
    await handler();

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('may not be accessible from the remote terminal'),
      'Paste Anyway',
      'Cancel',
    );
  });

  it('proceeds without warning when in WSL remote context', async () => {
    vi.mocked(detectRemoteContext).mockReturnValue({ remote: true, type: 'wsl' });

    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.pasteImage')!;
    await handler();

    expect(window.showWarningMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('may not be accessible from the remote terminal'),
      expect.anything(),
      expect.anything(),
    );
    expect(insertPathToTerminal).toHaveBeenCalled();
  });

  it('proceeds without warning when not in remote context', async () => {
    vi.mocked(detectRemoteContext).mockReturnValue({ remote: false });

    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.pasteImage')!;
    await handler();

    expect(insertPathToTerminal).toHaveBeenCalled();
  });

  it('respects warnOnRemote: false setting (no warning shown)', async () => {
    vi.mocked(detectRemoteContext).mockReturnValue({ remote: true, type: 'ssh-remote' });
    __setConfig('warnOnRemote', false);

    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.pasteImage')!;
    await handler();

    expect(window.showWarningMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('may not be accessible from the remote terminal'),
      expect.anything(),
      expect.anything(),
    );
    expect(insertPathToTerminal).toHaveBeenCalled();
  });

  it('aborts when user selects "Cancel" on remote warning', async () => {
    vi.mocked(detectRemoteContext).mockReturnValue({ remote: true, type: 'ssh-remote' });
    vi.mocked(window.showWarningMessage).mockResolvedValue('Cancel' as any);

    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.pasteImage')!;
    await handler();

    expect(insertPathToTerminal).not.toHaveBeenCalled();
  });

  it('aborts when user dismisses remote warning', async () => {
    vi.mocked(detectRemoteContext).mockReturnValue({ remote: true, type: 'dev-container' });
    vi.mocked(window.showWarningMessage).mockResolvedValue(undefined as any);

    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.pasteImage')!;
    await handler();

    expect(insertPathToTerminal).not.toHaveBeenCalled();
  });

  it('proceeds when user selects "Paste Anyway" on remote warning', async () => {
    vi.mocked(detectRemoteContext).mockReturnValue({ remote: true, type: 'ssh-remote' });
    vi.mocked(window.showWarningMessage).mockResolvedValue('Paste Anyway' as any);

    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.pasteImage')!;
    await handler();

    expect(insertPathToTerminal).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// sendPathToTerminal command handler
// ---------------------------------------------------------------------------
describe('sendPathToTerminal command handler', () => {
  it('inserts uri.fsPath to terminal', async () => {
    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.sendPathToTerminal')!;
    await handler({ fsPath: '/home/user/photo.png' });

    expect(insertPathToTerminal).toHaveBeenCalledWith('/home/user/photo.png');
  });

  it('shows error when uri is undefined', async () => {
    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.sendPathToTerminal')!;
    await handler(undefined);

    expect(notify.error).toHaveBeenCalledWith(
      expect.stringContaining('No file selected'),
    );
    expect(insertPathToTerminal).not.toHaveBeenCalled();
  });

  it('shows status bar message on success', async () => {
    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.sendPathToTerminal')!;
    await handler({ fsPath: '/home/user/photo.png' });

    expect(notify.statusBar).toHaveBeenCalledWith(
      'Path sent to terminal',
      3000,
    );
  });
});

// ---------------------------------------------------------------------------
// Image preview before save
// ---------------------------------------------------------------------------
describe('pasteImage preview integration', () => {
  it('shows preview and saves when user confirms (showPreview enabled)', async () => {
    __setConfig('showPreview', true);
    vi.mocked(showImagePreview).mockResolvedValue(true);

    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.pasteImage')!;
    await handler();

    expect(showImagePreview).toHaveBeenCalledWith(Buffer.from('PNG'), 'png');
    expect(insertPathToTerminal).toHaveBeenCalled();
  });

  it('shows preview and does NOT save when user cancels (showPreview enabled)', async () => {
    __setConfig('showPreview', true);
    vi.mocked(showImagePreview).mockResolvedValue(false);

    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.pasteImage')!;
    await handler();

    expect(showImagePreview).toHaveBeenCalled();
    expect(insertPathToTerminal).not.toHaveBeenCalled();
    expect(notify.statusBar).toHaveBeenCalledWith('Image paste cancelled', 3000);
  });

  it('skips preview when showPreview is disabled (default)', async () => {
    __setConfig('showPreview', false);

    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.pasteImage')!;
    await handler();

    expect(showImagePreview).not.toHaveBeenCalled();
    expect(insertPathToTerminal).toHaveBeenCalled();
  });

  it('passes correct image data and format to preview', async () => {
    __setConfig('showPreview', true);
    vi.mocked(showImagePreview).mockResolvedValue(true);

    const reader = makeMockReader({
      readImage: vi.fn().mockResolvedValue({ data: Buffer.from('JPEG-DATA'), format: 'jpeg' }),
    });
    vi.mocked(createClipboardReader).mockReturnValue(reader as any);

    activate(makeContext());
    const handler = __getRegisteredCommand('terminalImgPaste.pasteImage')!;
    await handler();

    expect(showImagePreview).toHaveBeenCalledWith(Buffer.from('JPEG-DATA'), 'jpeg');
  });
});

// ---------------------------------------------------------------------------
// deactivate()
// ---------------------------------------------------------------------------
describe('deactivate', () => {
  it('logs deactivation message', () => {
    deactivate();
    expect(logger.info).toHaveBeenCalledWith('Extension deactivating');
  });
});
