import { PowerShellClipboardReader } from "./powershellClipboard";
import { PlatformInfo } from "../platform/detect";
import { exec } from "../util/exec";

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
}
