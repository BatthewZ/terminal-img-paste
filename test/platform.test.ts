import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PlatformInfo } from "../src/platform/detect";

// Mock 'fs' before importing the module under test
vi.mock("fs");

// Mock 'child_process' — used by whichSync for PowerShell PATH discovery
vi.mock("child_process", () => ({
  execFileSync: vi.fn(),
}));

// Helper: dynamically import detect module (fresh per test thanks to resetModules)
async function loadDetectPlatform() {
  const mod = await import("../src/platform/detect");
  return mod.detectPlatform;
}

describe("platform/detect", () => {
  const originalPlatform = process.platform;
  let originalXDGSessionType: string | undefined;
  let originalWaylandDisplay: string | undefined;
  let originalDisplay: string | undefined;

  beforeEach(() => {
    // Clear the module cache so the module-level `cached` variable is reset
    vi.resetModules();

    // Restore process.platform after each test
    Object.defineProperty(process, "platform", { value: originalPlatform });

    // Save and restore XDG_SESSION_TYPE, WAYLAND_DISPLAY, and DISPLAY
    originalXDGSessionType = process.env.XDG_SESSION_TYPE;
    originalWaylandDisplay = process.env.WAYLAND_DISPLAY;
    originalDisplay = process.env.DISPLAY;
  });

  afterEach(() => {
    // Restore env vars
    if (originalXDGSessionType === undefined) {
      delete process.env.XDG_SESSION_TYPE;
    } else {
      process.env.XDG_SESSION_TYPE = originalXDGSessionType;
    }
    if (originalWaylandDisplay === undefined) {
      delete process.env.WAYLAND_DISPLAY;
    } else {
      process.env.WAYLAND_DISPLAY = originalWaylandDisplay;
    }
    if (originalDisplay === undefined) {
      delete process.env.DISPLAY;
    } else {
      process.env.DISPLAY = originalDisplay;
    }
  });

  // Helper to set up standard mocks for a non-WSL test
  async function setupMocks(opts: {
    procVersion?: string;
    existsSync?: (p: unknown) => boolean;
    execFileSync?: (cmd: unknown, args: unknown, options: unknown) => string;
  } = {}) {
    const { readFileSync, existsSync } = await import("fs");
    const { execFileSync } = await import("child_process");
    vi.mocked(readFileSync).mockReturnValue(opts.procVersion ?? "");
    vi.mocked(existsSync).mockImplementation(
      opts.existsSync ?? (() => false),
    );
    vi.mocked(execFileSync).mockImplementation(
      opts.execFileSync ?? (() => { throw new Error("not found"); }),
    );
    return { readFileSync: vi.mocked(readFileSync), existsSync: vi.mocked(existsSync), execFileSync: vi.mocked(execFileSync) };
  }

  // -----------------------------------------------------------------------
  // OS detection
  // -----------------------------------------------------------------------
  describe("detectOS", () => {
    it("returns 'macos' on darwin", async () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      await setupMocks();
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().os).toBe("macos");
    });

    it("returns 'windows' on win32", async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      await setupMocks();
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().os).toBe("windows");
    });

    it("returns 'linux' on linux", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      await setupMocks({ procVersion: "Linux version 6.6.0" });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().os).toBe("linux");
    });

    it("returns 'linux' for unknown/other platforms (default case)", async () => {
      Object.defineProperty(process, "platform", { value: "freebsd" });
      delete process.env.XDG_SESSION_TYPE;
      await setupMocks();
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().os).toBe("linux");
    });
  });

  // -----------------------------------------------------------------------
  // WSL detection
  // -----------------------------------------------------------------------
  describe("detectWSL", () => {
    it("detects WSL when /proc/version contains 'microsoft'", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      await setupMocks({
        procVersion: "Linux version 5.15.153.1-microsoft-standard-WSL2 (gcc)",
      });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().isWSL).toBe(true);
    });

    it("detects WSL case-insensitively (Microsoft with capital M)", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      await setupMocks({ procVersion: "Linux version 4.4.0-Microsoft" });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().isWSL).toBe(true);
    });

    it("returns false when /proc/version has no microsoft string", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      await setupMocks({
        procVersion: "Linux version 6.6.0-generic (builder@ubuntu)",
      });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().isWSL).toBe(false);
    });

    it("returns false when /proc/version cannot be read", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      const { readFileSync } = await import("fs");
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error("ENOENT: no such file or directory");
      });
      const { existsSync } = await import("fs");
      vi.mocked(existsSync).mockReturnValue(false);
      const { execFileSync } = await import("child_process");
      vi.mocked(execFileSync).mockImplementation(() => { throw new Error("not found"); });

      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().isWSL).toBe(false);
    });

    it("skips WSL detection on non-linux platforms", async () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      const mocks = await setupMocks();
      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.isWSL).toBe(false);
      expect(mocks.readFileSync).not.toHaveBeenCalled();
    });

    it("skips WSL detection on windows", async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      const mocks = await setupMocks();
      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.isWSL).toBe(false);
      expect(mocks.readFileSync).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // WSL version detection
  // -----------------------------------------------------------------------
  describe("wslVersion", () => {
    it("returns 2 for WSL2 (microsoft-standard-WSL2 in /proc/version)", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      await setupMocks({
        procVersion: "Linux version 5.15.153.1-microsoft-standard-WSL2 (gcc)",
      });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().wslVersion).toBe(2);
    });

    it("returns 1 for WSL1 (Microsoft without WSL2 marker)", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      await setupMocks({
        procVersion: "Linux version 4.4.0-Microsoft",
      });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().wslVersion).toBe(1);
    });

    it("returns null on non-WSL linux", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      await setupMocks({
        procVersion: "Linux version 6.6.0-generic",
      });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().wslVersion).toBeNull();
    });

    it("returns null on macOS", async () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      await setupMocks();
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().wslVersion).toBeNull();
    });

    it("returns null on windows", async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      await setupMocks();
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().wslVersion).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // WSLg detection
  // -----------------------------------------------------------------------
  describe("hasWslg", () => {
    it("returns true when /mnt/wslg/ exists on WSL", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      await setupMocks({
        procVersion: "Linux version 5.15.153.1-microsoft-standard-WSL2 (gcc)",
        existsSync: (p) => p === "/mnt/wslg/",
      });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().hasWslg).toBe(true);
    });

    it("returns false when /mnt/wslg/ does not exist on WSL", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      await setupMocks({
        procVersion: "Linux version 5.15.153.1-microsoft-standard-WSL2 (gcc)",
      });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().hasWslg).toBe(false);
    });

    it("returns false on non-WSL linux", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      await setupMocks({
        procVersion: "Linux version 6.6.0-generic",
        existsSync: (p) => p === "/mnt/wslg/", // exists but not WSL
      });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().hasWslg).toBe(false);
    });

    it("returns false on macOS", async () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      await setupMocks();
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().hasWslg).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Display server detection
  // -----------------------------------------------------------------------
  describe("detectDisplayServer", () => {
    it("returns 'wayland' when XDG_SESSION_TYPE is wayland on native linux", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      process.env.XDG_SESSION_TYPE = "wayland";
      await setupMocks({ procVersion: "Linux version 6.6.0-generic" });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().displayServer).toBe("wayland");
    });

    it("returns 'x11' when XDG_SESSION_TYPE is x11 on native linux", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      process.env.XDG_SESSION_TYPE = "x11";
      await setupMocks({ procVersion: "Linux version 6.6.0-generic" });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().displayServer).toBe("x11");
    });

    it("returns 'unknown' when XDG_SESSION_TYPE and WAYLAND_DISPLAY are both unset on linux", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      delete process.env.WAYLAND_DISPLAY;
      await setupMocks({ procVersion: "Linux version 6.6.0-generic" });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().displayServer).toBe("unknown");
    });

    it("returns 'unknown' when XDG_SESSION_TYPE is something else", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      process.env.XDG_SESSION_TYPE = "tty";
      delete process.env.WAYLAND_DISPLAY;
      await setupMocks({ procVersion: "Linux version 6.6.0-generic" });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().displayServer).toBe("unknown");
    });

    it("returns 'unknown' on macOS regardless of XDG_SESSION_TYPE", async () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      process.env.XDG_SESSION_TYPE = "wayland";
      await setupMocks();
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().displayServer).toBe("unknown");
    });

    it("returns 'unknown' on windows regardless of XDG_SESSION_TYPE", async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      process.env.XDG_SESSION_TYPE = "x11";
      await setupMocks();
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().displayServer).toBe("unknown");
    });

    it("returns 'unknown' on WSL when no DISPLAY or WAYLAND_DISPLAY set (ignores XDG_SESSION_TYPE)", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      process.env.XDG_SESSION_TYPE = "x11";
      delete process.env.WAYLAND_DISPLAY;
      delete process.env.DISPLAY;
      await setupMocks({
        procVersion: "Linux version 5.15.153.1-microsoft-standard-WSL2",
      });
      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.isWSL).toBe(true);
      expect(info.displayServer).toBe("unknown");
    });

    it("returns 'wayland' when XDG_SESSION_TYPE is unset but WAYLAND_DISPLAY is set", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      process.env.WAYLAND_DISPLAY = "wayland-0";
      await setupMocks({ procVersion: "Linux version 6.6.0-generic" });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().displayServer).toBe("wayland");
    });

    it("prefers XDG_SESSION_TYPE=x11 over WAYLAND_DISPLAY", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      process.env.XDG_SESSION_TYPE = "x11";
      process.env.WAYLAND_DISPLAY = "wayland-0";
      await setupMocks({ procVersion: "Linux version 6.6.0-generic" });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().displayServer).toBe("x11");
    });

    it("detects wayland on WSL when WAYLAND_DISPLAY is set (WSLg)", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      delete process.env.DISPLAY;
      process.env.WAYLAND_DISPLAY = "wayland-0";
      await setupMocks({
        procVersion: "Linux version 5.15.153.1-microsoft-standard-WSL2",
      });
      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.isWSL).toBe(true);
      expect(info.displayServer).toBe("wayland");
    });

    it("detects x11 on WSL when DISPLAY is set (WSLg)", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      delete process.env.WAYLAND_DISPLAY;
      process.env.DISPLAY = ":0";
      await setupMocks({
        procVersion: "Linux version 5.15.153.1-microsoft-standard-WSL2",
      });
      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.isWSL).toBe(true);
      expect(info.displayServer).toBe("x11");
    });
  });

  // -----------------------------------------------------------------------
  // PowerShell path detection
  // -----------------------------------------------------------------------
  describe("detectPowershellPath", () => {
    it("returns 'powershell.exe' on windows", async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      await setupMocks();
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().powershellPath).toBe("powershell.exe");
    });

    it("returns the first candidate path that exists on WSL", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      await setupMocks({
        procVersion: "Linux version 5.15.153.1-microsoft-standard-WSL2",
        existsSync: (p) =>
          p === "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
      });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().powershellPath).toBe(
        "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
      );
    });

    it("returns second candidate if first does not exist on WSL", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      await setupMocks({
        procVersion: "Linux version 5.15.153.1-microsoft-standard-WSL2",
        existsSync: (p) =>
          p === "/mnt/c/Program Files/PowerShell/7/pwsh.exe",
      });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().powershellPath).toBe(
        "/mnt/c/Program Files/PowerShell/7/pwsh.exe",
      );
    });

    it("tries command -v when no candidate path exists on WSL", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      await setupMocks({
        procVersion: "Linux version 5.15.153.1-microsoft-standard-WSL2",
        execFileSync: (cmd, args) => {
          const argArr = args as string[];
          if (argArr?.[1] === "powershell.exe") {
            return "/mnt/d/Windows/System32/WindowsPowerShell/v1.0/powershell.exe\n";
          }
          throw new Error("not found");
        },
      });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().powershellPath).toBe(
        "/mnt/d/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
      );
    });

    it("tries pwsh.exe via command -v when powershell.exe not found", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      await setupMocks({
        procVersion: "Linux version 5.15.153.1-microsoft-standard-WSL2",
        execFileSync: (cmd, args) => {
          const argArr = args as string[];
          if (argArr?.[1] === "pwsh.exe") {
            return "/mnt/c/Program Files/PowerShell/7/pwsh.exe\n";
          }
          throw new Error("not found");
        },
      });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().powershellPath).toBe(
        "/mnt/c/Program Files/PowerShell/7/pwsh.exe",
      );
    });

    it("falls back to 'powershell.exe' on WSL when no candidate exists and command -v fails", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      await setupMocks({
        procVersion: "Linux version 5.15.153.1-microsoft-standard-WSL2",
      });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().powershellPath).toBe("powershell.exe");
    });

    it("returns null on macOS", async () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      await setupMocks();
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().powershellPath).toBeNull();
    });

    it("returns null on native linux (non-WSL)", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      await setupMocks({ procVersion: "Linux version 6.6.0-generic" });
      const detectPlatform = await loadDetectPlatform();
      expect(detectPlatform().powershellPath).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Caching behavior
  // -----------------------------------------------------------------------
  describe("caching", () => {
    it("returns the same cached object on subsequent calls", async () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      await setupMocks();
      const detectPlatform = await loadDetectPlatform();
      const first = detectPlatform();
      const second = detectPlatform();
      expect(first).toBe(second); // strict reference equality
    });

    it("does not re-read /proc/version on subsequent calls", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      const mocks = await setupMocks({ procVersion: "Linux version 6.6.0-generic" });
      const detectPlatform = await loadDetectPlatform();
      detectPlatform();
      detectPlatform();
      detectPlatform();
      expect(mocks.readFileSync).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // Full PlatformInfo shape
  // -----------------------------------------------------------------------
  describe("PlatformInfo shape", () => {
    it("returns a complete PlatformInfo object for macOS", async () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      await setupMocks();
      const detectPlatform = await loadDetectPlatform();
      const info: PlatformInfo = detectPlatform();
      expect(info).toEqual({
        os: "macos",
        isWSL: false,
        wslVersion: null,
        hasWslg: false,
        displayServer: "unknown",
        powershellPath: null,
      });
    });

    it("returns a complete PlatformInfo object for windows", async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      await setupMocks();
      const detectPlatform = await loadDetectPlatform();
      const info: PlatformInfo = detectPlatform();
      expect(info).toEqual({
        os: "windows",
        isWSL: false,
        wslVersion: null,
        hasWslg: false,
        displayServer: "unknown",
        powershellPath: "powershell.exe",
      });
    });

    it("returns a complete PlatformInfo object for native linux with wayland", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      process.env.XDG_SESSION_TYPE = "wayland";
      await setupMocks({ procVersion: "Linux version 6.6.0-generic" });
      const detectPlatform = await loadDetectPlatform();
      const info: PlatformInfo = detectPlatform();
      expect(info).toEqual({
        os: "linux",
        isWSL: false,
        wslVersion: null,
        hasWslg: false,
        displayServer: "wayland",
        powershellPath: null,
      });
    });

    it("returns a complete PlatformInfo object for native linux with WAYLAND_DISPLAY fallback", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      process.env.WAYLAND_DISPLAY = "wayland-0";
      await setupMocks({ procVersion: "Linux version 6.6.0-generic" });
      const detectPlatform = await loadDetectPlatform();
      const info: PlatformInfo = detectPlatform();
      expect(info).toEqual({
        os: "linux",
        isWSL: false,
        wslVersion: null,
        hasWslg: false,
        displayServer: "wayland",
        powershellPath: null,
      });
    });

    it("returns a complete PlatformInfo object for WSL2 without WSLg", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      delete process.env.WAYLAND_DISPLAY;
      delete process.env.DISPLAY;
      await setupMocks({
        procVersion: "Linux version 5.15.153.1-microsoft-standard-WSL2",
      });
      const detectPlatform = await loadDetectPlatform();
      const info: PlatformInfo = detectPlatform();
      expect(info).toEqual({
        os: "linux",
        isWSL: true,
        wslVersion: 2,
        hasWslg: false,
        displayServer: "unknown",
        powershellPath: "powershell.exe",
      });
    });

    it("returns a complete PlatformInfo object for WSL1", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      delete process.env.WAYLAND_DISPLAY;
      delete process.env.DISPLAY;
      await setupMocks({
        procVersion: "Linux version 4.4.0-Microsoft",
      });
      const detectPlatform = await loadDetectPlatform();
      const info: PlatformInfo = detectPlatform();
      expect(info).toEqual({
        os: "linux",
        isWSL: true,
        wslVersion: 1,
        hasWslg: false,
        displayServer: "unknown",
        powershellPath: "powershell.exe",
      });
    });

    it("returns a complete PlatformInfo object for WSL2 with WSLg", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      process.env.WAYLAND_DISPLAY = "wayland-0";
      delete process.env.DISPLAY;
      await setupMocks({
        procVersion: "Linux version 5.15.153.1-microsoft-standard-WSL2",
        existsSync: (p) => p === "/mnt/wslg/",
      });
      const detectPlatform = await loadDetectPlatform();
      const info: PlatformInfo = detectPlatform();
      expect(info).toEqual({
        os: "linux",
        isWSL: true,
        wslVersion: 2,
        hasWslg: true,
        displayServer: "wayland",
        powershellPath: "powershell.exe",
      });
    });
  });
});
