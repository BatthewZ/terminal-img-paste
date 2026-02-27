import * as vscode from 'vscode';
import * as path from 'path';
import type { ClipboardReader } from './clipboard/types';
import type { ImageStore } from './storage/imageStore';
import type { PlatformInfo } from './platform/detect';
import { convertImage, SaveFormat } from './image/convert';
import { insertPathToTerminal } from './terminal/insertPath';
export interface PasteResult {
  /** Absolute path to the saved image file */
  path: string;
  /** Detected or converted format */
  format: string;
}

export interface TerminalImgPasteApi {
  /**
   * Read the clipboard image, save it to the image folder, and return the path.
   * Does NOT insert the path into a terminal — the caller decides what to do with it.
   * Returns undefined if no image is on the clipboard.
   */
  pasteFromClipboard(): Promise<PasteResult | undefined>;

  /**
   * Send a file path to the active terminal.
   * Uses shell-aware quoting based on the active terminal's shell type.
   */
  sendPathToTerminal(filePath: string): void;

  /**
   * Get the absolute path to the image storage folder for the current workspace.
   * Returns undefined if no workspace is open.
   */
  getImageFolder(): string | undefined;

  /**
   * Event fired after every successful image paste (clipboard → file).
   * Consumers can subscribe to react to paste events.
   */
  onImagePasted: vscode.Event<PasteResult>;
}

export function createApi(
  platform: PlatformInfo,
  reader: ClipboardReader,
  imageStore: ImageStore,
  emitter: vscode.EventEmitter<PasteResult>,
): TerminalImgPasteApi {
  return {
    async pasteFromClipboard(): Promise<PasteResult | undefined> {
      const hasImage = await reader.hasImage();
      if (!hasImage) {
        return undefined;
      }

      const { data, format } = await reader.readImage();

      const config = vscode.workspace.getConfiguration('terminalImgPaste');
      const saveFormat = config.get<SaveFormat>('saveFormat', 'auto');
      const converted = await convertImage(data, format, saveFormat, platform);

      const filePath = await imageStore.save(converted.data, converted.format);

      const result: PasteResult = { path: filePath, format: converted.format };
      emitter.fire(result);
      return result;
    },

    sendPathToTerminal(filePath: string): void {
      insertPathToTerminal(filePath);
    },

    getImageFolder(): string | undefined {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        return undefined;
      }
      const config = vscode.workspace.getConfiguration('terminalImgPaste');
      const folderName = config.get<string>('folderName', '.tip-images');
      return path.resolve(folders[0].uri.fsPath, folderName);
    },

    onImagePasted: emitter.event,
  };
}
