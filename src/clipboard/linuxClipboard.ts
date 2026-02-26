import { ClipboardReader } from "./types";
import { PlatformInfo } from "../platform/detect";
import { exec, execBuffer } from "../util/exec";

export class LinuxClipboardReader implements ClipboardReader {
  private displayServer: PlatformInfo["displayServer"];

  constructor(displayServer: PlatformInfo["displayServer"]) {
    this.displayServer = displayServer;
  }

  private isWayland(): boolean {
    return this.displayServer === "wayland";
  }

  requiredTool(): string {
    if (this.isWayland()) {
      return "wl-clipboard (wl-paste)";
    }
    return "xclip";
  }

  async isToolAvailable(): Promise<boolean> {
    try {
      if (this.isWayland()) {
        await exec("which", ["wl-paste"]);
      } else {
        await exec("which", ["xclip"]);
      }
      return true;
    } catch {
      return false;
    }
  }

  async hasImage(): Promise<boolean> {
    try {
      if (this.isWayland()) {
        const { stdout } = await exec("wl-paste", ["--list-types"]);
        return stdout.includes("image/png");
      } else {
        const { stdout } = await exec("xclip", [
          "-selection",
          "clipboard",
          "-t",
          "TARGETS",
          "-o",
        ]);
        return stdout.includes("image/png");
      }
    } catch {
      return false;
    }
  }

  async readImage(): Promise<Buffer> {
    const imageAvailable = await this.hasImage();
    if (!imageAvailable) {
      throw new Error("No image found in clipboard");
    }

    if (this.isWayland()) {
      const { stdout } = await execBuffer("wl-paste", [
        "--type",
        "image/png",
      ]);
      return stdout;
    } else {
      const { stdout } = await execBuffer("xclip", [
        "-selection",
        "clipboard",
        "-t",
        "image/png",
        "-o",
      ]);
      return stdout;
    }
  }
}
