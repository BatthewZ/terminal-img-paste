import { ClipboardReader, ClipboardFormat, ClipboardImageResult } from "./types";
import { PlatformInfo } from "../platform/detect";
import { exec, execBuffer } from "../util/exec";

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

  /** Get the list of available clipboard types/targets. */
  private async getClipboardTypes(): Promise<string> {
    if (this.isWayland()) {
      const { stdout } = await exec("wl-paste", ["--list-types"]);
      return stdout;
    } else {
      const { stdout } = await exec("xclip", [
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

  /** Map a ClipboardFormat to its MIME type string, using MIME_FORMAT_MAP as source of truth. */
  private formatToMime(format: ClipboardFormat): string {
    const entry = MIME_FORMAT_MAP.find(([, f]) => f === format);
    return entry ? entry[0] : "image/png";
  }

  async readImage(): Promise<ClipboardImageResult> {
    const format = await this.detectFormat();
    const mime = this.formatToMime(format);
    const resolvedFormat = format === "unknown" ? "png" : format;

    const { stdout } = this.isWayland()
      ? await execBuffer("wl-paste", ["--type", mime])
      : await execBuffer("xclip", [
          "-selection",
          "clipboard",
          "-t",
          mime,
          "-o",
        ]);
    return { data: stdout, format: resolvedFormat };
  }
}
