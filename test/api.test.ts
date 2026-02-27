import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter, workspace, __setConfig, __resetConfig } from 'vscode';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('../src/terminal/insertPath', () => ({
  insertPathToTerminal: vi.fn(),
}));

vi.mock('../src/image/convert', () => ({
  convertImage: vi.fn(async (data: Buffer, format: string) => ({ data, format })),
}));

// Import after mocks
import { createApi, type PasteResult, type TerminalImgPasteApi } from '../src/api';
import { insertPathToTerminal } from '../src/terminal/insertPath';
import { convertImage } from '../src/image/convert';
import type { ClipboardReader } from '../src/clipboard/types';
import type { ImageStore } from '../src/storage/imageStore';
import type { PlatformInfo } from '../src/platform/detect';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeMockReader(overrides: Partial<ClipboardReader> = {}): ClipboardReader {
  return {
    requiredTool: () => 'mock-tool',
    isToolAvailable: vi.fn().mockResolvedValue(true),
    hasImage: vi.fn().mockResolvedValue(true),
    readImage: vi.fn().mockResolvedValue({ data: Buffer.from('PNG'), format: 'png' }),
    detectFormat: vi.fn().mockResolvedValue('png'),
    ...overrides,
  };
}

function makeMockImageStore(overrides: Partial<ImageStore> = {}): ImageStore {
  return {
    save: vi.fn().mockResolvedValue('/test/workspace/.tip-images/img.png'),
    cleanup: vi.fn().mockResolvedValue(undefined),
    ensureGitIgnored: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const defaultPlatform: PlatformInfo = {
  os: 'linux',
  isWSL: false,
  displayServer: 'x11',
  powershellPath: null,
  hasWslg: false,
};

function makeApi(
  readerOverrides?: Partial<ClipboardReader>,
  storeOverrides?: Partial<ImageStore>,
): { api: TerminalImgPasteApi; reader: ClipboardReader; store: ImageStore; emitter: EventEmitter<PasteResult> } {
  const reader = makeMockReader(readerOverrides);
  const store = makeMockImageStore(storeOverrides);
  const emitter = new EventEmitter<PasteResult>();
  const api = createApi(defaultPlatform, reader, store, emitter);
  return { api, reader, store, emitter };
}

// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.restoreAllMocks();
  __resetConfig();
});

// ---------------------------------------------------------------------------
// pasteFromClipboard()
// ---------------------------------------------------------------------------
describe('pasteFromClipboard', () => {
  it('returns path and format on success', async () => {
    const { api } = makeApi();
    const result = await api.pasteFromClipboard();
    expect(result).toEqual({ path: '/test/workspace/.tip-images/img.png', format: 'png' });
  });

  it('returns undefined when no image on clipboard', async () => {
    const { api } = makeApi({ hasImage: vi.fn().mockResolvedValue(false) });
    const result = await api.pasteFromClipboard();
    expect(result).toBeUndefined();
  });

  it('calls save with correct data and format', async () => {
    const { api, store } = makeApi();
    await api.pasteFromClipboard();
    expect(store.save).toHaveBeenCalledWith(Buffer.from('PNG'), 'png');
  });

  it('fires onImagePasted event on success', async () => {
    const { api } = makeApi();
    const listener = vi.fn();
    api.onImagePasted(listener);

    await api.pasteFromClipboard();
    expect(listener).toHaveBeenCalledWith({
      path: '/test/workspace/.tip-images/img.png',
      format: 'png',
    });
  });

  it('does not fire event when no image', async () => {
    const { api } = makeApi({ hasImage: vi.fn().mockResolvedValue(false) });
    const listener = vi.fn();
    api.onImagePasted(listener);

    await api.pasteFromClipboard();
    expect(listener).not.toHaveBeenCalled();
  });

  it('applies format conversion when saveFormat is set', async () => {
    __setConfig('saveFormat', 'png');
    const { api } = makeApi({
      readImage: vi.fn().mockResolvedValue({ data: Buffer.from('JPEG'), format: 'jpeg' }),
    });

    await api.pasteFromClipboard();
    expect(convertImage).toHaveBeenCalledWith(
      Buffer.from('JPEG'),
      'jpeg',
      'png',
      defaultPlatform,
    );
  });

  it('passes auto saveFormat by default', async () => {
    const { api } = makeApi();
    await api.pasteFromClipboard();
    expect(convertImage).toHaveBeenCalledWith(
      Buffer.from('PNG'),
      'png',
      'auto',
      defaultPlatform,
    );
  });

  it('throws when readImage throws', async () => {
    const { api } = makeApi({
      readImage: vi.fn().mockRejectedValue(new Error('read failed')),
    });
    await expect(api.pasteFromClipboard()).rejects.toThrow('read failed');
  });

  it('throws when save throws', async () => {
    const { api } = makeApi(undefined, {
      save: vi.fn().mockRejectedValue(new Error('save failed')),
    });
    await expect(api.pasteFromClipboard()).rejects.toThrow('save failed');
  });
});

// ---------------------------------------------------------------------------
// sendPathToTerminal()
// ---------------------------------------------------------------------------
describe('sendPathToTerminal', () => {
  it('calls insertPathToTerminal with the given path', () => {
    const { api } = makeApi();
    api.sendPathToTerminal('/home/user/photo.png');
    expect(insertPathToTerminal).toHaveBeenCalledWith('/home/user/photo.png');
  });

  it('handles paths with special characters', () => {
    const { api } = makeApi();
    api.sendPathToTerminal('/home/user/my photo (2).png');
    expect(insertPathToTerminal).toHaveBeenCalledWith('/home/user/my photo (2).png');
  });
});

// ---------------------------------------------------------------------------
// getImageFolder()
// ---------------------------------------------------------------------------
describe('getImageFolder', () => {
  it('returns resolved path when workspace is open', () => {
    const { api } = makeApi();
    const folder = api.getImageFolder();
    expect(folder).toBe('/test/workspace/.tip-images');
  });

  it('returns undefined when no workspace is open', () => {
    const original = workspace.workspaceFolders;
    (workspace as any).workspaceFolders = undefined;

    try {
      const { api } = makeApi();
      expect(api.getImageFolder()).toBeUndefined();
    } finally {
      (workspace as any).workspaceFolders = original;
    }
  });

  it('uses custom folderName config', () => {
    __setConfig('folderName', 'screenshots');
    const { api } = makeApi();
    const folder = api.getImageFolder();
    expect(folder).toBe('/test/workspace/screenshots');
  });
});

// ---------------------------------------------------------------------------
// onImagePasted event
// ---------------------------------------------------------------------------
describe('onImagePasted', () => {
  it('supports multiple subscribers', async () => {
    const { api } = makeApi();
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    api.onImagePasted(listener1);
    api.onImagePasted(listener2);

    await api.pasteFromClipboard();
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe works', async () => {
    const { api } = makeApi();
    const listener = vi.fn();
    const disposable = api.onImagePasted(listener);

    await api.pasteFromClipboard();
    expect(listener).toHaveBeenCalledTimes(1);

    disposable.dispose();
    await api.pasteFromClipboard();
    // Should still be 1 call (no second fire)
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('event includes correct format', async () => {
    const { api } = makeApi({
      readImage: vi.fn().mockResolvedValue({ data: Buffer.from('JPEG'), format: 'jpeg' }),
    });
    vi.mocked(convertImage).mockResolvedValue({ data: Buffer.from('JPEG'), format: 'jpeg' });

    const listener = vi.fn();
    api.onImagePasted(listener);
    await api.pasteFromClipboard();

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'jpeg' }),
    );
  });
});
