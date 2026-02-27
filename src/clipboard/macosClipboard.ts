import { ClipboardReader, ClipboardFormat, ClipboardImageResult } from "./types";
import { exec, execBuffer } from "../util/exec";

/** Fetch raw clipboard info string from osascript (shared by macOS readers). */
export async function getClipboardInfo(): Promise<string> {
  const { stdout } = await exec("osascript", ["-e", "clipboard info"]);
  return stdout;
}

/** Parse macOS `clipboard info` output and return detected formats in preference order. */
export function parseClipboardFormats(info: string): ClipboardFormat[] {
  const formats: ClipboardFormat[] = [];
  if (info.includes("«class PNGf»")) {
    formats.push("png");
  }
  if (info.includes("«class JPEG»") || info.includes("«class JPEf»")) {
    formats.push("jpeg");
  }
  if (info.includes("«class TIFF»")) {
    formats.push("tiff");
  }
  if (info.includes("«class BMP »") || info.includes("«class BMPf»")) {
    formats.push("bmp");
  }
  return formats;
}

export class MacosClipboardReader implements ClipboardReader {
  requiredTool(): string {
    return "pngpaste";
  }

  async isToolAvailable(): Promise<boolean> {
    try {
      await exec("which", ["pngpaste"]);
      return true;
    } catch {
      return false;
    }
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
    const imageAvailable = await this.hasImage();
    if (!imageAvailable) {
      throw new Error("No image found in clipboard");
    }
    const { stdout } = await execBuffer("pngpaste", ["-"]);
    return { data: stdout, format: "png" };
  }
}
