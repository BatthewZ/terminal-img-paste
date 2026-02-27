import * as fs from "fs";
import { execFileSync } from "child_process";

export interface PlatformInfo {
  os: "macos" | "linux" | "windows";
  isWSL: boolean;
  wslVersion: 1 | 2 | null;
  hasWslg: boolean;
  displayServer: "x11" | "wayland" | "unknown";
  powershellPath: string | null;
}

let cached: PlatformInfo | null = null;

function detectOS(): PlatformInfo["os"] {
  switch (process.platform) {
    case "darwin":
      return "macos";
    case "win32":
      return "windows";
    default:
      return "linux";
  }
}

function readProcVersion(): string | null {
  try {
    return fs.readFileSync("/proc/version", "utf-8");
  } catch {
    return null;
  }
}

function detectWSL(procVersion: string | null): boolean {
  if (!procVersion) {
    return false;
  }
  return /microsoft/i.test(procVersion);
}

function detectWslVersion(procVersion: string | null): 1 | 2 | null {
  if (!procVersion || !detectWSL(procVersion)) {
    return null;
  }
  // WSL2 kernels contain "microsoft-standard-WSL2"
  if (/microsoft-standard-WSL2/i.test(procVersion)) {
    return 2;
  }
  // WSL1 kernels contain "Microsoft" but not "microsoft-standard-WSL2"
  return 1;
}

function detectWslg(): boolean {
  return fs.existsSync("/mnt/wslg/");
}

function detectDisplayServer(
  os: PlatformInfo["os"],
  isWSL: boolean
): PlatformInfo["displayServer"] {
  if (os !== "linux") {
    return "unknown";
  }

  // For WSL, check for WSLg (which provides X11/Wayland via /mnt/wslg/)
  if (isWSL) {
    if (process.env.WAYLAND_DISPLAY) {
      return "wayland";
    }
    if (process.env.DISPLAY) {
      return "x11";
    }
    return "unknown";
  }

  const sessionType = process.env.XDG_SESSION_TYPE;

  if (sessionType === "wayland") {
    return "wayland";
  }
  if (sessionType === "x11") {
    return "x11";
  }

  // Fallback: WAYLAND_DISPLAY is set by Wayland compositors even when
  // XDG_SESSION_TYPE is absent (containers, some desktop environments, etc.)
  if (process.env.WAYLAND_DISPLAY) {
    return "wayland";
  }

  return "unknown";
}

function whichSync(name: string): string | null {
  try {
    return execFileSync("command", ["-v", name], {
      encoding: "utf-8",
      timeout: 5000,
      shell: true,
    }).trim() || null;
  } catch {
    return null;
  }
}

function detectPowershellPath(
  os: PlatformInfo["os"],
  isWSL: boolean
): string | null {
  if (os === "windows") {
    return "powershell.exe";
  }

  if (isWSL) {
    // 1. Check well-known filesystem paths (fast, no subprocess)
    const candidates = [
      "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
      "/mnt/c/Program Files/PowerShell/7/pwsh.exe",
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    // 2. Try PATH-based discovery (handles non-standard mount points)
    const fromPath =
      whichSync("powershell.exe") ?? whichSync("pwsh.exe");
    if (fromPath) {
      return fromPath;
    }

    // 3. Last resort: rely on WSL interop PATH
    return "powershell.exe";
  }

  return null;
}

export function detectPlatform(): PlatformInfo {
  if (cached) {
    return cached;
  }

  const os = detectOS();
  const procVersion = os === "linux" ? readProcVersion() : null;
  const isWSL = os === "linux" ? detectWSL(procVersion) : false;
  const wslVersion = isWSL ? detectWslVersion(procVersion) : null;
  const hasWslg = isWSL ? detectWslg() : false;
  const displayServer = detectDisplayServer(os, isWSL);
  const powershellPath = detectPowershellPath(os, isWSL);

  cached = { os, isWSL, wslVersion, hasWslg, displayServer, powershellPath };
  return cached;
}
