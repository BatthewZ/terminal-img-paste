import * as fs from "fs";
import * as path from "path";
import { ClipboardReader, ClipboardFormat, ClipboardImageResult } from "./types";
import { exec } from "../util/exec";
import { encodePowerShellCommand } from "../util/powershell";
import { PlatformInfo } from "../platform/detect";
import { logger } from "../util/logger";

/** Map from lowercase file extension to ClipboardFormat. */
const EXT_FORMAT_MAP: Record<string, ClipboardFormat> = {
  ".png": "png",
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".bmp": "bmp",
  ".webp": "webp",
  ".tiff": "tiff",
  ".tif": "tiff",
  ".gif": "gif",
};

/** Convert a file:// URI to a filesystem path. */
function fileUriToPath(uri: string): string {
  const parsed = new URL(uri);
  // decodeURIComponent handles %20 etc. in the path
  return decodeURIComponent(parsed.pathname);
}

/**
 * Abstract base class for clipboard readers that check for copied file paths
 * pointing to image files. Subclasses implement `getFilePaths()` to retrieve
 * the list of file paths from the platform clipboard.
 */
export abstract class FilePathClipboardReader implements ClipboardReader {
  abstract requiredTool(): string;
  abstract isToolAvailable(): Promise<boolean>;

  /** Return file paths currently on the clipboard, or empty array if none. */
  protected abstract getFilePaths(): Promise<string[]>;

  /** Find the first image file path from a list of paths. */
  protected findFirstImageFile(paths: string[]): { filePath: string; format: ClipboardFormat } | null {
    for (const p of paths) {
      const ext = path.extname(p).toLowerCase();
      const format = EXT_FORMAT_MAP[ext];
      if (format) {
        return { filePath: p, format };
      }
    }
    return null;
  }

  async hasImage(): Promise<boolean> {
    try {
      const paths = await this.getFilePaths();
      return this.findFirstImageFile(paths) !== null;
    } catch {
      return false;
    }
  }

  async detectFormat(): Promise<ClipboardFormat> {
    const paths = await this.getFilePaths();
    const found = this.findFirstImageFile(paths);
    if (found) {
      return found.format;
    }
    throw new Error("No image file path found in clipboard");
  }

  async readImage(): Promise<ClipboardImageResult> {
    const paths = await this.getFilePaths();
    const found = this.findFirstImageFile(paths);
    if (!found) {
      throw new Error("No image file path found in clipboard");
    }
    const data = await fs.promises.readFile(found.filePath);
    return { data, format: found.format };
  }
}

// ---------------------------------------------------------------------------
// Linux: xclip / wl-paste with text/uri-list target
// ---------------------------------------------------------------------------

export class LinuxFilePathReader extends FilePathClipboardReader {
  private displayServer: PlatformInfo["displayServer"];

  constructor(displayServer: PlatformInfo["displayServer"]) {
    super();
    this.displayServer = displayServer;
  }

  private isWayland(): boolean {
    return this.displayServer === "wayland";
  }

  requiredTool(): string {
    return this.isWayland()
      ? "wl-clipboard (wl-paste) [file paths]"
      : "xclip [file paths]";
  }

  async isToolAvailable(): Promise<boolean> {
    try {
      const tool = this.isWayland() ? "wl-paste" : "xclip";
      await exec("which", [tool]);
      return true;
    } catch {
      return false;
    }
  }

  protected async getFilePaths(): Promise<string[]> {
    const { stdout } = this.isWayland()
      ? await exec("wl-paste", ["--type", "text/uri-list"])
      : await exec("xclip", ["-selection", "clipboard", "-t", "text/uri-list", "-o"]);

    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("file://"))
      .map(fileUriToPath);
  }
}

// ---------------------------------------------------------------------------
// Windows: PowerShell GetFileDropList()
// ---------------------------------------------------------------------------

const PS_GET_FILE_DROP_LIST =
  "Add-Type -AssemblyName System.Windows.Forms; $files = [System.Windows.Forms.Clipboard]::GetFileDropList(); foreach ($f in $files) { Write-Output $f }";

export class WindowsFilePathReader extends FilePathClipboardReader {
  requiredTool(): string {
    return "PowerShell (built-in) [file paths]";
  }

  async isToolAvailable(): Promise<boolean> {
    try {
      await exec("powershell.exe", ["-Command", "echo ok"]);
      return true;
    } catch {
      return false;
    }
  }

  protected async getFilePaths(): Promise<string[]> {
    const { stdout } = await exec("powershell.exe", [
      "-EncodedCommand",
      encodePowerShellCommand(PS_GET_FILE_DROP_LIST),
    ]);
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }
}

// ---------------------------------------------------------------------------
// WSL: PowerShell GetFileDropList() + wslpath conversion
// ---------------------------------------------------------------------------

export class WslFilePathReader extends FilePathClipboardReader {
  private readonly psPath: string;

  constructor(platform: PlatformInfo) {
    super();
    this.psPath = platform.powershellPath ?? "powershell.exe";
  }

  requiredTool(): string {
    return "PowerShell (via WSL interop) [file paths]";
  }

  async isToolAvailable(): Promise<boolean> {
    try {
      await exec(this.psPath, ["-Command", "echo ok"]);
      return true;
    } catch {
      return false;
    }
  }

  protected async getFilePaths(): Promise<string[]> {
    const { stdout } = await exec(this.psPath, [
      "-EncodedCommand",
      encodePowerShellCommand(PS_GET_FILE_DROP_LIST),
    ]);

    const windowsPaths = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // Convert Windows paths to WSL paths
    const wslPaths: string[] = [];
    for (const winPath of windowsPaths) {
      try {
        const { stdout: wslPath } = await exec("wslpath", ["-u", winPath]);
        wslPaths.push(wslPath.trim());
      } catch (err) {
        logger.warn(`wslpath conversion failed for "${winPath}":`, err);
      }
    }
    return wslPaths;
  }
}

// ---------------------------------------------------------------------------
// macOS: osascript with «class furl»
// ---------------------------------------------------------------------------

export class MacosFilePathReader extends FilePathClipboardReader {
  requiredTool(): string {
    return "osascript (built-in) [file paths]";
  }

  async isToolAvailable(): Promise<boolean> {
    return process.platform === "darwin";
  }

  protected async getFilePaths(): Promise<string[]> {
    // Get file URLs from the clipboard using the furl class
    const { stdout } = await exec("osascript", [
      "-e",
      "try",
      "-e",
      "  set fileList to (the clipboard as «class furl»)",
      "-e",
      "  return POSIX path of fileList",
      "-e",
      "on error",
      "-e",
      "  return \"\"",
      "-e",
      "end try",
    ]);

    const trimmed = stdout.trim();
    if (!trimmed) {
      return [];
    }
    return [trimmed];
  }
}
