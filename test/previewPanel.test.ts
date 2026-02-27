import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window, __getLastCreatedPanel, __clearLastPanel, ViewColumn } from 'vscode';

vi.mock('../src/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), show: vi.fn() },
}));

import { showImagePreview } from '../src/views/previewPanel';

beforeEach(() => {
  vi.restoreAllMocks();
  __clearLastPanel();
});

describe('showImagePreview', () => {
  it('creates a webview panel with correct parameters', async () => {
    const promise = showImagePreview(Buffer.from('PNG'), 'png');

    const panel = __getLastCreatedPanel()!;
    expect(panel).toBeTruthy();
    expect(window.createWebviewPanel).toHaveBeenCalledWith(
      'terminalImgPaste.preview',
      'Image Preview — Terminal Image Paste',
      ViewColumn.Active,
      { enableScripts: true },
    );

    // Clean up: simulate cancel to resolve
    panel.__simulateMessage({ command: 'cancel' });
    await promise;
  });

  it('resolves true when user clicks Paste', async () => {
    const promise = showImagePreview(Buffer.from('PNG'), 'png');

    const panel = __getLastCreatedPanel()!;
    panel.__simulateMessage({ command: 'paste' });

    expect(await promise).toBe(true);
  });

  it('resolves false when user clicks Cancel', async () => {
    const promise = showImagePreview(Buffer.from('PNG'), 'png');

    const panel = __getLastCreatedPanel()!;
    panel.__simulateMessage({ command: 'cancel' });

    expect(await promise).toBe(false);
  });

  it('resolves false when panel is closed without action', async () => {
    const promise = showImagePreview(Buffer.from('PNG'), 'png');

    const panel = __getLastCreatedPanel()!;
    panel.__simulateDispose();

    expect(await promise).toBe(false);
  });

  it('resolves false on timeout message', async () => {
    const promise = showImagePreview(Buffer.from('PNG'), 'png');

    const panel = __getLastCreatedPanel()!;
    panel.__simulateMessage({ command: 'timeout' });

    expect(await promise).toBe(false);
  });

  it('disposes the panel after resolution', async () => {
    const promise = showImagePreview(Buffer.from('PNG'), 'png');

    const panel = __getLastCreatedPanel()!;
    panel.__simulateMessage({ command: 'paste' });

    await promise;
    expect(panel.dispose).toHaveBeenCalled();
  });

  it('only resolves once even with multiple messages', async () => {
    const promise = showImagePreview(Buffer.from('PNG'), 'png');

    const panel = __getLastCreatedPanel()!;
    panel.__simulateMessage({ command: 'paste' });
    panel.__simulateMessage({ command: 'cancel' }); // second message should be ignored

    expect(await promise).toBe(true); // first message wins
  });

  it('sets webview HTML with base64-encoded image', async () => {
    const imageData = Buffer.from('test-image-data');
    const promise = showImagePreview(imageData, 'png');

    const panel = __getLastCreatedPanel()!;
    expect(panel.webview.html).toContain('data:image/png;base64,');
    expect(panel.webview.html).toContain(imageData.toString('base64'));

    panel.__simulateMessage({ command: 'cancel' });
    await promise;
  });

  it('uses correct mime type for jpeg format', async () => {
    const promise = showImagePreview(Buffer.from('JPEG'), 'jpeg');

    const panel = __getLastCreatedPanel()!;
    expect(panel.webview.html).toContain('data:image/jpeg;base64,');

    panel.__simulateMessage({ command: 'cancel' });
    await promise;
  });

  it('includes Content-Security-Policy in HTML', async () => {
    const promise = showImagePreview(Buffer.from('PNG'), 'png');

    const panel = __getLastCreatedPanel()!;
    expect(panel.webview.html).toContain('Content-Security-Policy');
    expect(panel.webview.html).toContain("img-src data:");

    panel.__simulateMessage({ command: 'cancel' });
    await promise;
  });

  it('includes countdown timer in HTML', async () => {
    const promise = showImagePreview(Buffer.from('PNG'), 'png');

    const panel = __getLastCreatedPanel()!;
    expect(panel.webview.html).toContain('Auto-cancel in');

    panel.__simulateMessage({ command: 'cancel' });
    await promise;
  });
});
