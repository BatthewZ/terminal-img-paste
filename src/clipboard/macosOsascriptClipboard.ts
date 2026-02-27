import { ClipboardReader, ClipboardFormat, ClipboardImageResult } from "./types";
import { execBuffer } from "../util/exec";
import { getClipboardInfo, parseClipboardFormats } from "./macosClipboard";

/** Map from ClipboardFormat to the osascript class name used for clipboard coercion. */
const FORMAT_TO_OSASCRIPT_CLASS: Record<string, string> = {
  png: "PNGf",
  jpeg: "JPEG",
  tiff: "TIFF",
};

/**
 * macOS clipboard reader using only osascript.
 * Used as a fallback when pngpaste is not installed.
 */
export class MacosOsascriptClipboardReader implements ClipboardReader {
  requiredTool(): string {
    return "osascript (built-in)";
  }

  async isToolAvailable(): Promise<boolean> {
    return process.platform === "darwin";
  }

  async hasImage(): Promise<boolean> {
    try {
      const info = await getClipboardInfo();
      return parseClipboardFormats(info).length > 0;
    } catch {
      return false;
    }
  }

  async detectFormat(): Promise<ClipboardFormat> {
    const info = await getClipboardInfo();
    const formats = parseClipboardFormats(info);
    if (formats.length > 0) {
      return formats[0];
    }
    throw new Error("No image found in clipboard");
  }

  async readImage(): Promise<ClipboardImageResult> {
    const format = await this.detectFormat();
    const hasNativeClass = format in FORMAT_TO_OSASCRIPT_CLASS;
    const osClass = hasNativeClass ? FORMAT_TO_OSASCRIPT_CLASS[format] : "PNGf";
    const resolvedFormat = hasNativeClass ? format : "png";

    const { stdout } = await execBuffer("osascript", [
      "-e",
      `set imgData to (the clipboard as «class ${osClass}»)`,
      "-e",
      "return imgData",
    ]);
    return { data: stdout, format: resolvedFormat };
  }
}
