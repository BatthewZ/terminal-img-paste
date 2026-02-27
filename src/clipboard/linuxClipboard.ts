import { ClipboardReader, ClipboardFormat, ClipboardImageResult } from "./types";
import { PlatformInfo } from "../platform/detect";
import { exec, execBuffer } from "../util/exec";
import { resolveToolPathOrFallback } from "../util/toolPath";

/** MIME type to ClipboardFormat mapping, in preference order. */
const MIME_FORMAT_MAP: Array<[string, ClipboardFormat]> = [
  ["image/png", "png"],
  ["image/jpeg", "jpeg"],
  ["image/webp", "webp"],
  ["image/tiff", "tiff"],
  ["image/bmp", "bmp"],
  ["image/x-bmp", "bmp"],
];

/** Parse a list of MIME types and return the best matching ClipboardFormat. */
function detectFormatFromMimeTypes(
  mimeList: string,
): ClipboardFormat | null {
  for (const [mime, format] of MIME_FORMAT_MAP) {
    if (mimeList.includes(mime)) {
      return format;
    }
  }
  // Check for any unrecognized image/* type
  if (/^image\//m.test(mimeList)) {
    return "unknown";
  }
  return null;
}

/** Find the best MIME type and its format from a clipboard type list. */
function detectMimeAndFormat(
  mimeList: string,
): { mime: string; format: ClipboardFormat } | null {
  for (const [mime, format] of MIME_FORMAT_MAP) {
    if (mimeList.includes(mime)) {
      return { mime, format };
    }
  }
  if (/^image\//m.test(mimeList)) {
    return { mime: "image/png", format: "unknown" };
  }
  return null;
}

export class LinuxClipboardReader implements ClipboardReader {
  private displayServer: PlatformInfo["displayServer"];
  private resolvedToolPath: string | undefined;

  constructor(displayServer: PlatformInfo["displayServer"]) {
    this.displayServer = displayServer;
  }

  private isWayland(): boolean {
    return this.displayServer === "wayland";
  }

  private toolName(): string {
    return this.isWayland() ? "wl-paste" : "xclip";
  }

  private async getToolPath(): Promise<string> {
    if (this.resolvedToolPath === undefined) {
      this.resolvedToolPath = await resolveToolPathOrFallback(this.toolName());
    }
    return this.resolvedToolPath;
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

  /** Get the list of available clipboard types/targets. */
  private async getClipboardTypes(): Promise<string> {
    const tool = await this.getToolPath();
    if (this.isWayland()) {
      const { stdout } = await exec(tool, ["--list-types"]);
      return stdout;
    } else {
      const { stdout } = await exec(tool, [
        "-selection",
        "clipboard",
        "-t",
        "TARGETS",
        "-o",
      ]);
      return stdout;
    }
  }

  async hasImage(): Promise<boolean> {
    try {
      const types = await this.getClipboardTypes();
      return /^image\//m.test(types);
    } catch {
      return false;
    }
  }

  async detectFormat(): Promise<ClipboardFormat> {
    const types = await this.getClipboardTypes();
    const format = detectFormatFromMimeTypes(types);
    if (format !== null) {
      return format;
    }
    throw new Error("No image found in clipboard");
  }

  async readImage(): Promise<ClipboardImageResult> {
    const types = await this.getClipboardTypes();
    const detected = detectMimeAndFormat(types);
    if (!detected) {
      throw new Error("No image found in clipboard");
    }
    const { mime, format } = detected;
    const resolvedFormat = format === "unknown" ? "png" : format;

    const tool = await this.getToolPath();
    const { stdout } = this.isWayland()
      ? await execBuffer(tool, ["--type", mime])
      : await execBuffer(tool, [
          "-selection",
          "clipboard",
          "-t",
          mime,
          "-o",
        ]);
    return { data: stdout, format: resolvedFormat };
  }
}
