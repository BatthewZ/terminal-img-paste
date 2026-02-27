import * as fs from "fs";
import { PowerShellClipboardReader, PS_READ_IMAGE } from "./powershellClipboard";
import { PlatformInfo } from "../platform/detect";
import { ClipboardImageResult } from "./types";
import { exec } from "../util/exec";
import { encodePowerShellCommand } from "../util/powershell";
import { logger } from "../util/logger";

export class WslClipboardReader extends PowerShellClipboardReader {
  private readonly psPath: string;

  constructor(platform: PlatformInfo) {
    super();
    this.psPath = platform.powershellPath ?? "powershell.exe";
  }

  protected get powershellExe(): string {
    return this.psPath;
  }

  requiredTool(): string {
    return "PowerShell (via WSL interop)";
  }

  protected async resolveTempPath(windowsPath: string): Promise<string> {
    try {
      const result = await exec("wslpath", ["-u", windowsPath]);
      return result.stdout.trim();
    } catch (err) {
      throw new Error(
        `wslpath conversion failed: could not convert "${windowsPath}" to a WSL path: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async readImage(): Promise<ClipboardImageResult> {
    const has = await this.hasImage();
    if (!has) {
      throw new Error("No image found in clipboard");
    }

    // Stage 1: Execute PowerShell to save clipboard image to temp file
    let windowsTempPath: string;
    try {
      const result = await exec(this.powershellExe, [
        "-EncodedCommand",
        encodePowerShellCommand(PS_READ_IMAGE),
      ]);
      windowsTempPath = result.stdout.trim();
    } catch (err) {
      throw new Error(
        `PowerShell execution failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    // Stage 2: Convert Windows temp path to WSL path
    const localPath = await this.resolveTempPath(windowsTempPath);

    // Stage 3: Read the temp file from WSL
    try {
      const data = await fs.promises.readFile(localPath);
      return { data, format: "png" };
    } catch (err) {
      throw new Error(
        `Temp file read failed: could not read "${localPath}": ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      fs.promises.unlink(localPath).catch((err) => {
        logger.warn(`Failed to clean up temp file: ${localPath}`, err);
      });
    }
  }
}
