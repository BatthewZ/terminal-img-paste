import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  __createMockWebviewView,
  __clearLastWebviewView,
  EventEmitter,
  Uri,
  CancellationTokenSource,
} from 'vscode';

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

import { DropZoneProvider } from '../src/views/dropZoneProvider';
import { insertPathToTerminal } from '../src/terminal/insertPath';
import { convertImage } from '../src/image/convert';
import { notify } from '../src/util/notify';
import { logger } from '../src/util/logger';
import type { PasteResult } from '../src/api';

function makeProvider(overrides: { save?: (...args: unknown[]) => Promise<string> } = {}) {
  const imageStore = {
    save: overrides.save ?? vi.fn().mockResolvedValue('/test/workspace/.tip-images/img.png'),
    cleanup: vi.fn(),
    ensureGitIgnored: vi.fn(),
  };

  const emitter = new EventEmitter<PasteResult>();

  const extensionUri = { fsPath: '/test/extension', scheme: 'file' } as any;

  const provider = new DropZoneProvider(extensionUri, imageStore as any, emitter as any);

  return { provider, imageStore, emitter, extensionUri };
}

function resolveView(provider: DropZoneProvider) {
  const view = __createMockWebviewView();
  const tokenSource = new CancellationTokenSource();
  provider.resolveWebviewView(view as any, {} as any, tokenSource.token as any);
  return view;
}

beforeEach(() => {
  vi.restoreAllMocks();
  __clearLastWebviewView();
});

describe('DropZoneProvider', () => {
  describe('resolveWebviewView', () => {
    it('sets enableScripts to true', () => {
      const { provider } = makeProvider();
      const view = resolveView(provider);
      expect(view.webview.options.enableScripts).toBe(true);
    });

    it('sets HTML with drop zone content', () => {
      const { provider } = makeProvider();
      const view = resolveView(provider);
      expect(view.webview.html).toContain('drop-zone');
      expect(view.webview.html).toContain('Drop images here');
    });

    it('includes Content-Security-Policy in HTML', () => {
      const { provider } = makeProvider();
      const view = resolveView(provider);
      expect(view.webview.html).toContain('Content-Security-Policy');
    });

    it('references external CSS and JS files', () => {
      const { provider } = makeProvider();
      const view = resolveView(provider);
      expect(view.webview.html).toContain('dropZone.css');
      expect(view.webview.html).toContain('dropZone.js');
    });

    it('registers a message listener', () => {
      const { provider } = makeProvider();
      const view = resolveView(provider);
      expect(view.webview.onDidReceiveMessage).toHaveBeenCalled();
    });
  });

  describe('file drop handling', () => {
    it('saves dropped image and inserts path to terminal', async () => {
      const { provider, imageStore } = makeProvider();
      const view = resolveView(provider);

      const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const base64 = pngData.toString('base64');

      view.__simulateMessage({
        type: 'files-dropped',
        files: [{ name: 'screenshot.png', data: base64, mimeType: 'image/png' }],
      });

      // Wait for async handler
      await vi.waitFor(() => {
        expect(imageStore.save).toHaveBeenCalled();
      });

      expect(insertPathToTerminal).toHaveBeenCalledWith('/test/workspace/.tip-images/img.png');
    });

    it('sends success message back to webview', async () => {
      const { provider } = makeProvider();
      const view = resolveView(provider);

      const data = Buffer.from('test').toString('base64');
      view.__simulateMessage({
        type: 'files-dropped',
        files: [{ name: 'test.png', data, mimeType: 'image/png' }],
      });

      await vi.waitFor(() => {
        expect(view.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'drop-result', success: true }),
        );
      });
    });

    it('shows status bar notification on success', async () => {
      const { provider } = makeProvider();
      const view = resolveView(provider);

      const data = Buffer.from('test').toString('base64');
      view.__simulateMessage({
        type: 'files-dropped',
        files: [{ name: 'test.png', data, mimeType: 'image/png' }],
      });

      await vi.waitFor(() => {
        expect(notify.statusBar).toHaveBeenCalledWith('Image dropped and saved', 3000);
      });
    });

    it('fires paste emitter event on success', async () => {
      const { provider, emitter } = makeProvider();
      const view = resolveView(provider);

      const firedEvents: PasteResult[] = [];
      emitter.event((e) => firedEvents.push(e));

      const data = Buffer.from('test').toString('base64');
      view.__simulateMessage({
        type: 'files-dropped',
        files: [{ name: 'test.png', data, mimeType: 'image/png' }],
      });

      await vi.waitFor(() => {
        expect(firedEvents).toHaveLength(1);
        expect(firedEvents[0].path).toBe('/test/workspace/.tip-images/img.png');
      });
    });

    it('applies format conversion via convertImage', async () => {
      const { provider } = makeProvider();
      const view = resolveView(provider);

      const data = Buffer.from('jpeg-data').toString('base64');
      view.__simulateMessage({
        type: 'files-dropped',
        files: [{ name: 'photo.jpg', data, mimeType: 'image/jpeg' }],
      });

      await vi.waitFor(() => {
        expect(convertImage).toHaveBeenCalledWith(
          expect.any(Buffer),
          'jpeg',
          'auto',
          expect.objectContaining({ os: 'linux' }),
        );
      });
    });
  });

  describe('non-image rejection', () => {
    it('rejects non-image MIME types', async () => {
      const { provider, imageStore } = makeProvider();
      const view = resolveView(provider);

      const data = Buffer.from('text content').toString('base64');
      view.__simulateMessage({
        type: 'files-dropped',
        files: [{ name: 'readme.txt', data, mimeType: 'text/plain' }],
      });

      await vi.waitFor(() => {
        expect(view.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'drop-result',
            success: false,
            message: expect.stringContaining('Unsupported file type'),
          }),
        );
      });

      expect(imageStore.save).not.toHaveBeenCalled();
    });

    it('rejects application/pdf', async () => {
      const { provider, imageStore } = makeProvider();
      const view = resolveView(provider);

      const data = Buffer.from('pdf').toString('base64');
      view.__simulateMessage({
        type: 'files-dropped',
        files: [{ name: 'doc.pdf', data, mimeType: 'application/pdf' }],
      });

      await vi.waitFor(() => {
        expect(view.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({ success: false }),
        );
      });

      expect(imageStore.save).not.toHaveBeenCalled();
    });
  });

  describe('size limit', () => {
    it('rejects files larger than 50MB', async () => {
      const { provider, imageStore } = makeProvider();
      const view = resolveView(provider);

      // Create a base64 string that decodes to > 50MB
      // 50MB + 1 byte = 52428801 bytes
      const largeBuffer = Buffer.alloc(50 * 1024 * 1024 + 1, 0x41);
      const base64 = largeBuffer.toString('base64');

      view.__simulateMessage({
        type: 'files-dropped',
        files: [{ name: 'huge.png', data: base64, mimeType: 'image/png' }],
      });

      await vi.waitFor(() => {
        expect(view.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'drop-result',
            success: false,
            message: expect.stringContaining('too large'),
          }),
        );
      });

      expect(imageStore.save).not.toHaveBeenCalled();
    });
  });

  describe('empty data', () => {
    it('rejects empty file data', async () => {
      const { provider, imageStore } = makeProvider();
      const view = resolveView(provider);

      view.__simulateMessage({
        type: 'files-dropped',
        files: [{ name: 'empty.png', data: '', mimeType: 'image/png' }],
      });

      await vi.waitFor(() => {
        expect(view.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            message: expect.stringContaining('Empty'),
          }),
        );
      });

      expect(imageStore.save).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('sends error message when imageStore.save fails', async () => {
      const { provider } = makeProvider({
        save: vi.fn().mockRejectedValue(new Error('No workspace folder')),
      });
      const view = resolveView(provider);

      const data = Buffer.from('test').toString('base64');
      view.__simulateMessage({
        type: 'files-dropped',
        files: [{ name: 'test.png', data, mimeType: 'image/png' }],
      });

      await vi.waitFor(() => {
        expect(view.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'drop-result',
            success: false,
            message: expect.stringContaining('No workspace folder'),
          }),
        );
      });
    });

    it('logs error when processing fails', async () => {
      const { provider } = makeProvider({
        save: vi.fn().mockRejectedValue(new Error('disk full')),
      });
      const view = resolveView(provider);

      const data = Buffer.from('test').toString('base64');
      view.__simulateMessage({
        type: 'files-dropped',
        files: [{ name: 'test.png', data, mimeType: 'image/png' }],
      });

      await vi.waitFor(() => {
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('failed to process'),
          expect.any(Error),
        );
      });
    });
  });

  describe('multiple files', () => {
    it('processes multiple dropped files', async () => {
      const { provider, imageStore } = makeProvider();
      const view = resolveView(provider);

      const data1 = Buffer.from('img1').toString('base64');
      const data2 = Buffer.from('img2').toString('base64');

      view.__simulateMessage({
        type: 'files-dropped',
        files: [
          { name: 'a.png', data: data1, mimeType: 'image/png' },
          { name: 'b.jpeg', data: data2, mimeType: 'image/jpeg' },
        ],
      });

      await vi.waitFor(() => {
        expect(imageStore.save).toHaveBeenCalledTimes(2);
      });

      expect(insertPathToTerminal).toHaveBeenCalledTimes(2);
    });
  });

  describe('accepted MIME types', () => {
    const acceptedTypes = [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/bmp',
      'image/webp',
      'image/svg+xml',
    ];

    for (const mimeType of acceptedTypes) {
      it(`accepts ${mimeType}`, async () => {
        const { provider, imageStore } = makeProvider();
        const view = resolveView(provider);

        const data = Buffer.from('test-data').toString('base64');
        view.__simulateMessage({
          type: 'files-dropped',
          files: [{ name: 'test-file', data, mimeType }],
        });

        await vi.waitFor(() => {
          expect(imageStore.save).toHaveBeenCalled();
        });
      });
    }
  });

  describe('ignores unrelated messages', () => {
    it('ignores messages with unknown type', async () => {
      const { provider, imageStore } = makeProvider();
      const view = resolveView(provider);

      view.__simulateMessage({ type: 'unknown-type', data: 'test' });

      // Give handler time to process
      await new Promise((r) => setTimeout(r, 50));
      expect(imageStore.save).not.toHaveBeenCalled();
    });

    it('ignores files-dropped with empty files array', async () => {
      const { provider, imageStore } = makeProvider();
      const view = resolveView(provider);

      view.__simulateMessage({ type: 'files-dropped', files: [] });

      await new Promise((r) => setTimeout(r, 50));
      expect(imageStore.save).not.toHaveBeenCalled();
    });
  });
});
