import { ClipboardReader } from "./types";
import { exec, execBuffer } from "../util/exec";

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
      const { stdout } = await exec("osascript", ["-e", "clipboard info"]);
      return stdout.includes("«class PNGf»") || stdout.includes("«class TIFF»");
    } catch {
      return false;
    }
  }

  async readImage(): Promise<Buffer> {
    const imageAvailable = await this.hasImage();
    if (!imageAvailable) {
      throw new Error("No image found in clipboard");
    }
    const { stdout } = await execBuffer("pngpaste", ["-"]);
    return stdout;
  }
}
