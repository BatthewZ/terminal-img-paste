import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ClipboardReader, ClipboardFormat, ClipboardImageResult } from "./types";
import { exec } from "../util/exec";
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
 *
 * osascript's `return` outputs binary data as hex-encoded text (e.g.
 * `«data PNGf89504E47...»`), NOT raw bytes. To get actual binary data we
 * have osascript write the clipboard contents to a temporary file with
 * AppleScript's `write` command, then read that file back from Node.
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

    // Use mkdtemp for an atomically-created temp directory to prevent
    // symlink race attacks on the temp file path.
    const tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "tip-osascript-"),
    );
    const tmpFile = path.join(tmpDir, "clipboard-img");

    try {
      await exec("osascript", [
        "-e",
        `set imgData to (the clipboard as «class ${osClass}»)`,
        "-e",
        `set filePath to POSIX file "${tmpFile}"`,
        "-e",
        "try",
        "-e",
        "  set fileRef to open for access filePath with write permission",
        "-e",
        "  set eof of fileRef to 0",
        "-e",
        "  write imgData to fileRef",
        "-e",
        "  close access fileRef",
        "-e",
        "on error errMsg",
        "-e",
        "  try",
        "-e",
        "    close access filePath",
        "-e",
        "  end try",
        "-e",
        "  error errMsg",
        "-e",
        "end try",
      ]);

      const data = await fs.promises.readFile(tmpFile);
      return { data, format: resolvedFormat };
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true }).catch(() => {});
    }
  }
}
