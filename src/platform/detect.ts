import * as fs from "fs";

export interface PlatformInfo {
  os: "macos" | "linux" | "windows";
  isWSL: boolean;
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

function detectWSL(): boolean {
  try {
    const procVersion = fs.readFileSync("/proc/version", "utf-8");
    return /microsoft/i.test(procVersion);
  } catch {
    return false;
  }
}

function detectDisplayServer(
  os: PlatformInfo["os"],
  isWSL: boolean
): PlatformInfo["displayServer"] {
  if (os !== "linux" || isWSL) {
    return "unknown";
  }

  const sessionType = process.env.XDG_SESSION_TYPE;

  if (sessionType === "wayland") {
    return "wayland";
  }
  if (sessionType === "x11") {
    return "x11";
  }

  return "unknown";
}

function detectPowershellPath(
  os: PlatformInfo["os"],
  isWSL: boolean
): string | null {
  if (os === "windows") {
    return "powershell.exe";
  }

  if (isWSL) {
    const candidates = [
      "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
      "/mnt/c/Program Files/PowerShell/7/pwsh.exe",
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    // Fall back to powershell.exe which may be in PATH via interop
    return "powershell.exe";
  }

  return null;
}

export function detectPlatform(): PlatformInfo {
  if (cached) {
    return cached;
  }

  const os = detectOS();
  const isWSL = os === "linux" ? detectWSL() : false;
  const displayServer = detectDisplayServer(os, isWSL);
  const powershellPath = detectPowershellPath(os, isWSL);

  cached = { os, isWSL, displayServer, powershellPath };
  return cached;
}
