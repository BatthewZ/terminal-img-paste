export type ClipboardFormat =
  | "png"
  | "jpeg"
  | "tiff"
  | "bmp"
  | "webp"
  | "gif"
  | "unknown";

export interface ClipboardImageResult {
  data: Buffer;
  format: ClipboardFormat;
}

export interface ClipboardReader {
  /** Human-readable name of the required CLI tool (e.g. "pngpaste", "xclip") */
  requiredTool(): string;

  /** Check whether the required CLI tool is installed and accessible */
  isToolAvailable(): Promise<boolean>;

  /** Check whether the clipboard currently contains image data */
  hasImage(): Promise<boolean>;

  /** Read image data from the clipboard and return it with format info.
   *  Throws if no image is available. */
  readImage(): Promise<ClipboardImageResult>;

  /** Detect the format of the image currently on the clipboard.
   *  Throws if no image is available. */
  detectFormat(): Promise<ClipboardFormat>;
}
