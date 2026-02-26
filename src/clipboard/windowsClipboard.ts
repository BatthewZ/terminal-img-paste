import { PowerShellClipboardReader } from "./powershellClipboard";

export class WindowsClipboardReader extends PowerShellClipboardReader {
  protected get powershellExe(): string {
    return "powershell.exe";
  }

  requiredTool(): string {
    return "PowerShell (built-in)";
  }

  protected async resolveTempPath(windowsPath: string): Promise<string> {
    return windowsPath;
  }
}
