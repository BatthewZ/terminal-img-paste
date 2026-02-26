import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlatformInfo } from "../src/platform/detect";

// Mock 'fs' before importing the module under test
vi.mock("fs");

// Helper: dynamically import detect module (fresh per test thanks to resetModules)
async function loadDetectPlatform() {
  const mod = await import("../src/platform/detect");
  return mod.detectPlatform;
}

describe("platform/detect", () => {
  const originalPlatform = process.platform;
  let originalXDGSessionType: string | undefined;
  let originalWaylandDisplay: string | undefined;

  beforeEach(() => {
    // Clear the module cache so the module-level `cached` variable is reset
    vi.resetModules();

    // Restore process.platform after each test
    Object.defineProperty(process, "platform", { value: originalPlatform });

    // Save and restore XDG_SESSION_TYPE and WAYLAND_DISPLAY
    originalXDGSessionType = process.env.XDG_SESSION_TYPE;
    originalWaylandDisplay = process.env.WAYLAND_DISPLAY;
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
  });

  // -----------------------------------------------------------------------
  // OS detection
  // -----------------------------------------------------------------------
  describe("detectOS", () => {
    it("returns 'macos' on darwin", async () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue("");
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.os).toBe("macos");
    });

    it("returns 'windows' on win32", async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue("");
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.os).toBe("windows");
    });

    it("returns 'linux' on linux", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue("Linux version 6.6.0");
      vi.mocked(existsSync).mockReturnValue(false);
      delete process.env.XDG_SESSION_TYPE;

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.os).toBe("linux");
    });

    it("returns 'linux' for unknown/other platforms (default case)", async () => {
      Object.defineProperty(process, "platform", { value: "freebsd" });
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue("");
      vi.mocked(existsSync).mockReturnValue(false);
      delete process.env.XDG_SESSION_TYPE;

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.os).toBe("linux");
    });
  });

  // -----------------------------------------------------------------------
  // WSL detection
  // -----------------------------------------------------------------------
  describe("detectWSL", () => {
    it("detects WSL when /proc/version contains 'microsoft'", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue(
        "Linux version 5.15.153.1-microsoft-standard-WSL2 (gcc)",
      );
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.isWSL).toBe(true);
    });

    it("detects WSL case-insensitively (Microsoft with capital M)", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue(
        "Linux version 4.4.0-Microsoft",
      );
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.isWSL).toBe(true);
    });

    it("returns false when /proc/version has no microsoft string", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue(
        "Linux version 6.6.0-generic (builder@ubuntu)",
      );
      vi.mocked(existsSync).mockReturnValue(false);
      delete process.env.XDG_SESSION_TYPE;

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.isWSL).toBe(false);
    });

    it("returns false when /proc/version cannot be read", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error("ENOENT: no such file or directory");
      });
      vi.mocked(existsSync).mockReturnValue(false);
      delete process.env.XDG_SESSION_TYPE;

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.isWSL).toBe(false);
    });

    it("skips WSL detection on non-linux platforms", async () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      const { readFileSync, existsSync } = await import("fs");
      // readFileSync should never be called for WSL on macOS
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.isWSL).toBe(false);
      expect(readFileSync).not.toHaveBeenCalled();
    });

    it("skips WSL detection on windows", async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.isWSL).toBe(false);
      expect(readFileSync).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Display server detection
  // -----------------------------------------------------------------------
  describe("detectDisplayServer", () => {
    it("returns 'wayland' when XDG_SESSION_TYPE is wayland on native linux", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      process.env.XDG_SESSION_TYPE = "wayland";
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue("Linux version 6.6.0-generic");
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.displayServer).toBe("wayland");
    });

    it("returns 'x11' when XDG_SESSION_TYPE is x11 on native linux", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      process.env.XDG_SESSION_TYPE = "x11";
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue("Linux version 6.6.0-generic");
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.displayServer).toBe("x11");
    });

    it("returns 'unknown' when XDG_SESSION_TYPE and WAYLAND_DISPLAY are both unset on linux", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      delete process.env.WAYLAND_DISPLAY;
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue("Linux version 6.6.0-generic");
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.displayServer).toBe("unknown");
    });

    it("returns 'unknown' when XDG_SESSION_TYPE is something else", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      process.env.XDG_SESSION_TYPE = "tty";
      delete process.env.WAYLAND_DISPLAY;
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue("Linux version 6.6.0-generic");
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.displayServer).toBe("unknown");
    });

    it("returns 'unknown' on macOS regardless of XDG_SESSION_TYPE", async () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      process.env.XDG_SESSION_TYPE = "wayland";
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.displayServer).toBe("unknown");
    });

    it("returns 'unknown' on windows regardless of XDG_SESSION_TYPE", async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      process.env.XDG_SESSION_TYPE = "x11";
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.displayServer).toBe("unknown");
    });

    it("returns 'unknown' on WSL even if XDG_SESSION_TYPE is set", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      process.env.XDG_SESSION_TYPE = "x11";
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue(
        "Linux version 5.15.153.1-microsoft-standard-WSL2",
      );
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.isWSL).toBe(true);
      expect(info.displayServer).toBe("unknown");
    });

    it("returns 'wayland' when XDG_SESSION_TYPE is unset but WAYLAND_DISPLAY is set", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      process.env.WAYLAND_DISPLAY = "wayland-0";
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue("Linux version 6.6.0-generic");
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.displayServer).toBe("wayland");
    });

    it("prefers XDG_SESSION_TYPE=x11 over WAYLAND_DISPLAY", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      process.env.XDG_SESSION_TYPE = "x11";
      process.env.WAYLAND_DISPLAY = "wayland-0";
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue("Linux version 6.6.0-generic");
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.displayServer).toBe("x11");
    });

    it("ignores WAYLAND_DISPLAY on WSL", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      process.env.WAYLAND_DISPLAY = "wayland-0";
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue(
        "Linux version 5.15.153.1-microsoft-standard-WSL2",
      );
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.isWSL).toBe(true);
      expect(info.displayServer).toBe("unknown");
    });
  });

  // -----------------------------------------------------------------------
  // PowerShell path detection
  // -----------------------------------------------------------------------
  describe("detectPowershellPath", () => {
    it("returns 'powershell.exe' on windows", async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.powershellPath).toBe("powershell.exe");
    });

    it("returns the first candidate path that exists on WSL", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue(
        "Linux version 5.15.153.1-microsoft-standard-WSL2",
      );
      vi.mocked(existsSync).mockImplementation((p) => {
        return (
          p ===
          "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
        );
      });

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.powershellPath).toBe(
        "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
      );
    });

    it("returns second candidate if first does not exist on WSL", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue(
        "Linux version 5.15.153.1-microsoft-standard-WSL2",
      );
      vi.mocked(existsSync).mockImplementation((p) => {
        return p === "/mnt/c/Program Files/PowerShell/7/pwsh.exe";
      });

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.powershellPath).toBe(
        "/mnt/c/Program Files/PowerShell/7/pwsh.exe",
      );
    });

    it("falls back to 'powershell.exe' on WSL when no candidate exists", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue(
        "Linux version 5.15.153.1-microsoft-standard-WSL2",
      );
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.powershellPath).toBe("powershell.exe");
    });

    it("returns null on macOS", async () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.powershellPath).toBeNull();
    });

    it("returns null on native linux (non-WSL)", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue("Linux version 6.6.0-generic");
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info = detectPlatform();
      expect(info.powershellPath).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Caching behavior
  // -----------------------------------------------------------------------
  describe("caching", () => {
    it("returns the same cached object on subsequent calls", async () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const first = detectPlatform();
      const second = detectPlatform();
      expect(first).toBe(second); // strict reference equality
    });

    it("does not re-read /proc/version on subsequent calls", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue("Linux version 6.6.0-generic");
      vi.mocked(existsSync).mockReturnValue(false);
      delete process.env.XDG_SESSION_TYPE;

      const detectPlatform = await loadDetectPlatform();
      detectPlatform();
      detectPlatform();
      detectPlatform();
      // readFileSync should only be called once (for /proc/version on the first call)
      expect(readFileSync).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // Full PlatformInfo shape
  // -----------------------------------------------------------------------
  describe("PlatformInfo shape", () => {
    it("returns a complete PlatformInfo object for macOS", async () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info: PlatformInfo = detectPlatform();
      expect(info).toEqual({
        os: "macos",
        isWSL: false,
        displayServer: "unknown",
        powershellPath: null,
      });
    });

    it("returns a complete PlatformInfo object for windows", async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info: PlatformInfo = detectPlatform();
      expect(info).toEqual({
        os: "windows",
        isWSL: false,
        displayServer: "unknown",
        powershellPath: "powershell.exe",
      });
    });

    it("returns a complete PlatformInfo object for native linux with wayland", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      process.env.XDG_SESSION_TYPE = "wayland";
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue("Linux version 6.6.0-generic");
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info: PlatformInfo = detectPlatform();
      expect(info).toEqual({
        os: "linux",
        isWSL: false,
        displayServer: "wayland",
        powershellPath: null,
      });
    });

    it("returns a complete PlatformInfo object for native linux with WAYLAND_DISPLAY fallback", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      process.env.WAYLAND_DISPLAY = "wayland-0";
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue("Linux version 6.6.0-generic");
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info: PlatformInfo = detectPlatform();
      expect(info).toEqual({
        os: "linux",
        isWSL: false,
        displayServer: "wayland",
        powershellPath: null,
      });
    });

    it("returns a complete PlatformInfo object for WSL", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      delete process.env.XDG_SESSION_TYPE;
      delete process.env.WAYLAND_DISPLAY;
      const { readFileSync, existsSync } = await import("fs");
      vi.mocked(readFileSync).mockReturnValue(
        "Linux version 5.15.153.1-microsoft-standard-WSL2",
      );
      vi.mocked(existsSync).mockReturnValue(false);

      const detectPlatform = await loadDetectPlatform();
      const info: PlatformInfo = detectPlatform();
      expect(info).toEqual({
        os: "linux",
        isWSL: true,
        displayServer: "unknown",
        powershellPath: "powershell.exe",
      });
    });
  });
});
