import * as vscode from 'vscode';
import type { ClipboardFormat } from '../clipboard/types';

const TIMEOUT_MS = 10_000;

/**
 * Show a webview panel previewing the clipboard image.
 * Resolves `true` if the user confirms, `false` if they cancel or the panel times out / is closed.
 */
export function showImagePreview(
  imageData: Buffer,
  format: ClipboardFormat,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let resolved = false;
    const finish = (value: boolean) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      panel.dispose();
      resolve(value);
    };

    const panel = vscode.window.createWebviewPanel(
      'terminalImgPaste.preview',
      'Image Preview — Terminal Image Paste',
      vscode.ViewColumn.Active,
      { enableScripts: true },
    );

    const mimeType = `image/${format}`;
    const base64 = imageData.toString('base64');

    panel.webview.html = buildHtml(mimeType, base64, TIMEOUT_MS);

    panel.webview.onDidReceiveMessage((msg: { command: string }) => {
      if (msg.command === 'paste') {
        finish(true);
      } else if (msg.command === 'cancel' || msg.command === 'timeout') {
        finish(false);
      }
    });

    panel.onDidDispose(() => {
      finish(false);
    });

    const timer = setTimeout(() => {
      finish(false);
    }, TIMEOUT_MS + 500); // small buffer beyond the client-side countdown
  });
}

function buildHtml(mimeType: string, base64: string, timeoutMs: number): string {
  const timeoutSec = Math.round(timeoutMs / 1000);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Image Preview</title>
  <style>
    body { font-family: var(--vscode-font-family, sans-serif); padding: 16px; text-align: center; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    img { max-width: 100%; max-height: 60vh; border: 1px solid var(--vscode-panel-border, #444); margin-bottom: 12px; }
    .info { margin-bottom: 16px; opacity: 0.8; font-size: 13px; }
    .buttons { display: flex; justify-content: center; gap: 12px; }
    button { padding: 8px 20px; font-size: 14px; cursor: pointer; border: none; border-radius: 4px; }
    .btn-paste { background: var(--vscode-button-background, #0078d4); color: var(--vscode-button-foreground, #fff); }
    .btn-paste:hover { background: var(--vscode-button-hoverBackground, #005a9e); }
    .btn-cancel { background: var(--vscode-button-secondaryBackground, #333); color: var(--vscode-button-secondaryForeground, #fff); }
    .btn-cancel:hover { background: var(--vscode-button-secondaryHoverBackground, #444); }
    .countdown { margin-top: 12px; font-size: 12px; opacity: 0.6; }
  </style>
</head>
<body>
  <img id="preview" src="data:${mimeType};base64,${base64}" alt="Clipboard image preview"
       onload="document.getElementById('dims').textContent = this.naturalWidth + ' × ' + this.naturalHeight + ' px';" />
  <div class="info" id="dims"></div>
  <div class="buttons">
    <button class="btn-paste" id="pasteBtn">Paste</button>
    <button class="btn-cancel" id="cancelBtn">Cancel</button>
  </div>
  <div class="countdown" id="timer">Auto-cancel in ${timeoutSec}s</div>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('pasteBtn').addEventListener('click', () => vscode.postMessage({ command: 'paste' }));
    document.getElementById('cancelBtn').addEventListener('click', () => vscode.postMessage({ command: 'cancel' }));

    let remaining = ${timeoutSec};
    const timerEl = document.getElementById('timer');
    const interval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(interval);
        timerEl.textContent = 'Auto-cancelled';
        vscode.postMessage({ command: 'timeout' });
      } else {
        timerEl.textContent = 'Auto-cancel in ' + remaining + 's';
      }
    }, 1000);
  </script>
</body>
</html>`;
}
