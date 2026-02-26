import * as fs from "fs";
import { ClipboardReader } from "./types";
import { exec } from "../util/exec";

const PS_HAS_IMAGE =
  "Add-Type -AssemblyName System.Windows.Forms; if ([System.Windows.Forms.Clipboard]::ContainsImage()) { echo 'yes' } else { echo 'no' }";

const PS_READ_IMAGE =
  "Add-Type -AssemblyName System.Windows.Forms; $img = [System.Windows.Forms.Clipboard]::GetImage(); if ($img -eq $null) { exit 1 }; $tmp = [System.IO.Path]::GetTempFileName(); $img.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png); Write-Output $tmp";

/**
 * Shared base for clipboard readers that use PowerShell to access the
 * Windows clipboard (native Windows and WSL).
 */
export abstract class PowerShellClipboardReader implements ClipboardReader {
  protected abstract get powershellExe(): string;

  abstract requiredTool(): string;

  /** Convert a Windows-style temp path to a path readable by the current OS.
   *  On native Windows this is an identity operation; on WSL it runs wslpath. */
  protected abstract resolveTempPath(windowsPath: string): Promise<string>;

  async isToolAvailable(): Promise<boolean> {
    try {
      await exec(this.powershellExe, ["-Command", "echo ok"]);
      return true;
    } catch {
      return false;
    }
  }

  async hasImage(): Promise<boolean> {
    try {
      const result = await exec(this.powershellExe, [
        "-Command",
        PS_HAS_IMAGE,
      ]);
      return result.stdout.trim() === "yes";
    } catch {
      return false;
    }
  }

  async readImage(): Promise<Buffer> {
    const has = await this.hasImage();
    if (!has) {
      throw new Error("No image found in clipboard");
    }

    const result = await exec(this.powershellExe, [
      "-Command",
      PS_READ_IMAGE,
    ]);

    const localPath = await this.resolveTempPath(result.stdout.trim());
    try {
      return await fs.promises.readFile(localPath);
    } finally {
      fs.promises.unlink(localPath).catch(() => {});
    }
  }
}
