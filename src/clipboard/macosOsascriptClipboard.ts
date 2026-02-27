import { ClipboardReader, ClipboardFormat } from "./types";
import { exec, execBuffer } from "../util/exec";
import { parseClipboardFormats } from "./macosClipboard";

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

  private async getClipboardInfo(): Promise<string> {
    const { stdout } = await exec("osascript", ["-e", "clipboard info"]);
    return stdout;
  }

  async hasImage(): Promise<boolean> {
    try {
      const info = await this.getClipboardInfo();
      return parseClipboardFormats(info).length > 0;
    } catch {
      return false;
    }
  }

  async detectFormat(): Promise<ClipboardFormat> {
    const has = await this.hasImage();
    if (!has) {
      throw new Error("No image found in clipboard");
    }
    return "png";
  }

  async readImage(): Promise<Buffer> {
    const has = await this.hasImage();
    if (!has) {
      throw new Error("No image found in clipboard");
    }
    const { stdout } = await execBuffer("osascript", [
      "-e",
      "set pngData to (the clipboard as «class PNGf»)",
      "-e",
      "return pngData",
    ]);
    return stdout;
  }
}
