import { PlatformInfo } from "../platform/detect";
import { ClipboardReader } from "./types";
import { MacosClipboardReader } from "./macosClipboard";
import { MacosOsascriptClipboardReader } from "./macosOsascriptClipboard";
import { LinuxClipboardReader } from "./linuxClipboard";
import { WindowsClipboardReader } from "./windowsClipboard";
import { WslClipboardReader } from "./wslClipboard";
import { FallbackClipboardReader } from "./fallback";
import {
  LinuxFilePathReader,
  WindowsFilePathReader,
  WslFilePathReader,
  MacosFilePathReader,
} from "./filePathClipboard";

export { ClipboardReader } from "./types";

export function createClipboardReader(platform: PlatformInfo): ClipboardReader {
  if (platform.isWSL) {
    const hasDisplayServer =
      platform.displayServer === "x11" || platform.displayServer === "wayland";

    // When WSLg is available, prefer native Linux clipboard tools (faster, more
    // reliable) over PowerShell interop, falling back to PowerShell.
    // Without WSLg, PowerShell interop is the primary (and possibly only) reader.
    if (platform.hasWslg && hasDisplayServer) {
      return new FallbackClipboardReader([
        new LinuxClipboardReader(platform.displayServer),
        new WslClipboardReader(platform),
        new LinuxFilePathReader(platform.displayServer),
        new WslFilePathReader(platform),
      ]);
    }

    const readers: ClipboardReader[] = [new WslClipboardReader(platform)];
    if (hasDisplayServer) {
      readers.push(new LinuxClipboardReader(platform.displayServer));
    }
    // File-path readers always go last in the chain
    readers.push(new WslFilePathReader(platform));
    if (hasDisplayServer) {
      readers.push(new LinuxFilePathReader(platform.displayServer));
    }

    return new FallbackClipboardReader(readers);
  }

  switch (platform.os) {
    case "macos":
      return new FallbackClipboardReader([
        new MacosClipboardReader(),
        new MacosOsascriptClipboardReader(),
        new MacosFilePathReader(),
      ]);
    case "windows":
      return new FallbackClipboardReader([
        new WindowsClipboardReader(),
        new WindowsFilePathReader(),
      ]);
    case "linux": {
      const primary = new LinuxClipboardReader(platform.displayServer);
      const fallbackDS =
        platform.displayServer === "wayland" ? "x11" : "wayland";
      const fallback = new LinuxClipboardReader(fallbackDS);
      return new FallbackClipboardReader([
        primary,
        fallback,
        new LinuxFilePathReader(platform.displayServer),
      ]);
    }
  }
}
