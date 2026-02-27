import * as vscode from 'vscode';
import * as path from 'path';
import type { ImageStore } from '../storage/imageStore';
import type { ClipboardFormat } from '../clipboard/types';
import type { PasteResult } from '../api';
import { convertImage, SaveFormat } from '../image/convert';
import { insertPathToTerminal } from '../terminal/insertPath';
import { detectPlatform } from '../platform/detect';
import { logger } from '../util/logger';
import { notify } from '../util/notify';

const ACCEPTED_MIMES: Record<string, ClipboardFormat> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/gif': 'png', // will be treated as raw data, save as png
  'image/bmp': 'bmp',
  'image/webp': 'webp',
  'image/svg+xml': 'png', // SVG saved as png fallback
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

interface DroppedFile {
  name: string;
  data: string; // base64
  mimeType: string;
}

interface FilesDroppedMessage {
  type: 'files-dropped';
  files: DroppedFile[];
}

type WebviewMessage = FilesDroppedMessage;

export class DropZoneProvider implements vscode.WebviewViewProvider {
  private readonly _extensionUri: vscode.Uri;

  constructor(
    extensionUri: vscode.Uri,
    private readonly imageStore: ImageStore,
    private readonly pasteEmitter: vscode.EventEmitter<PasteResult>,
  ) {
    this._extensionUri = extensionUri;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
      this._handleMessage(message, webviewView.webview).catch((err) => {
        logger.error('Drop zone: unhandled message error', err);
      });
    });
  }

  private async _handleMessage(
    message: WebviewMessage,
    webview: vscode.Webview,
  ): Promise<void> {
    if (message.type !== 'files-dropped') {
      return;
    }

    const files = message.files;
    if (!files || files.length === 0) {
      return;
    }

    const config = vscode.workspace.getConfiguration('terminalImgPaste');
    const saveFormat = config.get<SaveFormat>('saveFormat', 'auto');
    const platform = detectPlatform();

    for (const file of files) {
      try {
        // Validate MIME type
        const format = ACCEPTED_MIMES[file.mimeType];
        if (!format) {
          webview.postMessage({
            type: 'drop-result',
            success: false,
            message: `Unsupported file type: ${file.mimeType}`,
          });
          logger.warn(`Rejected drop: unsupported MIME type ${file.mimeType}`);
          continue;
        }

        // Decode base64
        const buffer = Buffer.from(file.data, 'base64');

        // Validate size
        if (buffer.length > MAX_FILE_SIZE) {
          webview.postMessage({
            type: 'drop-result',
            success: false,
            message: 'File too large (max 50 MB)',
          });
          logger.warn(`Rejected drop: file too large (${buffer.length} bytes)`);
          continue;
        }

        if (buffer.length === 0) {
          webview.postMessage({
            type: 'drop-result',
            success: false,
            message: 'Empty file data',
          });
          continue;
        }

        // Apply format conversion if configured
        const converted = await convertImage(buffer, format, saveFormat, platform);

        // Save to image store
        const filePath = await this.imageStore.save(converted.data, converted.format);

        // Insert path to terminal
        insertPathToTerminal(filePath);

        // Fire the paste event
        this.pasteEmitter.fire({ path: filePath, format: converted.format });

        webview.postMessage({
          type: 'drop-result',
          success: true,
          message: `Saved: ${path.basename(filePath)}`,
        });

        notify.statusBar('Image dropped and saved', 3000);
        logger.info(`Drop zone: saved ${file.name} as ${filePath}`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        webview.postMessage({
          type: 'drop-result',
          success: false,
          message: `Failed: ${errMsg}`,
        });
        logger.error(`Drop zone: failed to process ${file.name}`, err);
      }
    }
  }

  private _getHtml(webview: vscode.Webview): string {
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'dropZone.css'),
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'dropZone.js'),
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${cssUri}">
  <title>Drop Zone</title>
</head>
<body>
  <div id="drop-zone" class="drop-zone">
    <div class="drop-icon">&#128247;</div>
    <div class="drop-text">Drop images here</div>
  </div>
  <div id="status" class="status-message"></div>
  <script src="${jsUri}"></script>
</body>
</html>`;
  }
}
