import { PowerShellClipboardReader } from "./powershellClipboard";
import { resolveToolPathOrFallback } from "../util/toolPath";

export class WindowsClipboardReader extends PowerShellClipboardReader {
  private resolvedPsPath: string | undefined;

  protected get powershellExe(): string {
    // Return cached resolved path or fallback to bare name.
    // Lazy resolution happens in readImage/hasImage via resolvePs().
    return this.resolvedPsPath ?? "powershell.exe";
  }

  async resolvePs(): Promise<void> {
    if (this.resolvedPsPath === undefined) {
      this.resolvedPsPath = await resolveToolPathOrFallback("powershell.exe");
    }
  }

  requiredTool(): string {
    return "PowerShell (built-in)";
  }

  async isToolAvailable(): Promise<boolean> {
    await this.resolvePs();
    return super.isToolAvailable();
  }

  protected async resolveTempPath(windowsPath: string): Promise<string> {
    return windowsPath;
  }
}
