export interface ClipboardReader {
  /** Human-readable name of the required CLI tool (e.g. "pngpaste", "xclip") */
  requiredTool(): string;

  /** Check whether the required CLI tool is installed and accessible */
  isToolAvailable(): Promise<boolean>;

  /** Check whether the clipboard currently contains image data */
  hasImage(): Promise<boolean>;

  /** Read image data from the clipboard and return it as a PNG Buffer.
   *  Throws if no image is available. */
  readImage(): Promise<Buffer>;
}
