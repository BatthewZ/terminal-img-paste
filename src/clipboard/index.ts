import { PlatformInfo } from "../platform/detect";
import { ClipboardReader } from "./types";
import { MacosClipboardReader } from "./macosClipboard";
import { LinuxClipboardReader } from "./linuxClipboard";
import { WindowsClipboardReader } from "./windowsClipboard";
import { WslClipboardReader } from "./wslClipboard";

export { ClipboardReader } from "./types";

export function createClipboardReader(platform: PlatformInfo): ClipboardReader {
  if (platform.isWSL) {
    return new WslClipboardReader(platform);
  }
  switch (platform.os) {
    case "macos":
      return new MacosClipboardReader();
    case "windows":
      return new WindowsClipboardReader();
    case "linux":
      return new LinuxClipboardReader(platform.displayServer);
  }
}
