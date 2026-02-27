import { PlatformInfo } from "../platform/detect";
import { ClipboardReader } from "./types";
import { MacosClipboardReader } from "./macosClipboard";
import { MacosOsascriptClipboardReader } from "./macosOsascriptClipboard";
import { LinuxClipboardReader } from "./linuxClipboard";
import { WindowsClipboardReader } from "./windowsClipboard";
import { WslClipboardReader } from "./wslClipboard";
import { FallbackClipboardReader } from "./fallback";

export { ClipboardReader } from "./types";

export function createClipboardReader(platform: PlatformInfo): ClipboardReader {
  if (platform.isWSL) {
    const readers: ClipboardReader[] = [new WslClipboardReader(platform)];

    if (platform.displayServer === "x11" || platform.displayServer === "wayland") {
      readers.push(new LinuxClipboardReader(platform.displayServer));
    }

    return readers.length === 1
      ? readers[0]
      : new FallbackClipboardReader(readers);
  }

  switch (platform.os) {
    case "macos":
      return new FallbackClipboardReader([
        new MacosClipboardReader(),
        new MacosOsascriptClipboardReader(),
      ]);
    case "windows":
      return new WindowsClipboardReader();
    case "linux": {
      const primary = new LinuxClipboardReader(platform.displayServer);
      const fallbackDS =
        platform.displayServer === "wayland" ? "x11" : "wayland";
      const fallback = new LinuxClipboardReader(fallbackDS);
      return new FallbackClipboardReader([primary, fallback]);
    }
  }
}
