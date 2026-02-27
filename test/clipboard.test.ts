import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock: ../src/util/exec
// ---------------------------------------------------------------------------
vi.mock("../src/util/exec", () => ({
  exec: vi.fn(),
  execBuffer: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: ../src/util/toolPath  (avoid real `which` calls in tests)
// ---------------------------------------------------------------------------
vi.mock("../src/util/toolPath");

// ---------------------------------------------------------------------------
// Mock: fs  (used by PowerShellClipboardReader.readImage)
// ---------------------------------------------------------------------------
vi.mock("fs", () => {
  const actual: Record<string, unknown> = {};
  return {
    ...actual,
    default: {
      promises: {
        readFile: vi.fn(),
        unlink: vi.fn().mockResolvedValue(undefined),
      },
    },
    promises: {
      readFile: vi.fn(),
      unlink: vi.fn().mockResolvedValue(undefined),
    },
  };
});

import { exec, execBuffer } from "../src/util/exec";
import * as fs from "fs";

import { createClipboardReader } from "../src/clipboard/index";
import { MacosClipboardReader } from "../src/clipboard/macosClipboard";
import { MacosOsascriptClipboardReader } from "../src/clipboard/macosOsascriptClipboard";
import { LinuxClipboardReader } from "../src/clipboard/linuxClipboard";
import { WindowsClipboardReader } from "../src/clipboard/windowsClipboard";
import { WslClipboardReader } from "../src/clipboard/wslClipboard";
import { FallbackClipboardReader } from "../src/clipboard/fallback";
import type { PlatformInfo } from "../src/platform/detect";
import { resolveToolPathOrFallback } from "../src/util/toolPath";

// Convenience typed references to the mocked functions
const mockExec = vi.mocked(exec);
const mockExecBuffer = vi.mocked(execBuffer);
const mockReadFile = vi.mocked(fs.promises.readFile);
const mockUnlink = vi.mocked(fs.promises.unlink);
const mockResolveToolPathOrFallback = vi.mocked(resolveToolPathOrFallback);

// Re-establish toolPath mock after mockReset clears implementations
beforeEach(() => {
  mockResolveToolPathOrFallback.mockImplementation(async (name: string) => name);
});

// ---------------------------------------------------------------------------
// Helpers — platform info fixtures
// ---------------------------------------------------------------------------
function makePlatform(overrides: Partial<PlatformInfo> = {}): PlatformInfo {
  return {
    os: "linux",
    isWSL: false,
    wslVersion: null,
    hasWslg: false,
    displayServer: "x11",
    powershellPath: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Factory — createClipboardReader
// ---------------------------------------------------------------------------
describe("createClipboardReader", () => {
  it("returns FallbackClipboardReader with pngpaste + osascript for macOS", () => {
    const reader = createClipboardReader(makePlatform({ os: "macos" }));
    expect(reader).toBeInstanceOf(FallbackClipboardReader);
    expect(reader.requiredTool()).toContain("pngpaste");
    expect(reader.requiredTool()).toContain("osascript");
  });

  it("returns FallbackClipboardReader for Linux x11 (xclip + wl-paste fallback)", () => {
    const reader = createClipboardReader(
      makePlatform({ os: "linux", displayServer: "x11" }),
    );
    expect(reader).toBeInstanceOf(FallbackClipboardReader);
    expect(reader.requiredTool()).toContain("xclip");
    expect(reader.requiredTool()).toContain("wl-paste");
  });

  it("returns FallbackClipboardReader for Linux wayland (wl-paste + xclip fallback)", () => {
    const reader = createClipboardReader(
      makePlatform({ os: "linux", displayServer: "wayland" }),
    );
    expect(reader).toBeInstanceOf(FallbackClipboardReader);
    expect(reader.requiredTool()).toContain("wl-paste");
    expect(reader.requiredTool()).toContain("xclip");
  });

  it("returns WindowsClipboardReader for Windows (no fallback)", () => {
    const reader = createClipboardReader(makePlatform({ os: "windows" }));
    expect(reader).toBeInstanceOf(WindowsClipboardReader);
  });

  it("returns plain WslClipboardReader when isWSL is true without display server", () => {
    const reader = createClipboardReader(
      makePlatform({ os: "linux", isWSL: true, displayServer: "unknown", powershellPath: "/mnt/c/ps.exe" }),
    );
    expect(reader).toBeInstanceOf(WslClipboardReader);
  });

  it("returns FallbackClipboardReader for WSL with display server but no WSLg (PowerShell first)", () => {
    const reader = createClipboardReader(
      makePlatform({ os: "linux", isWSL: true, hasWslg: false, displayServer: "wayland", powershellPath: "/mnt/c/ps.exe" }),
    );
    expect(reader).toBeInstanceOf(FallbackClipboardReader);
    // PowerShell should be listed first (before wl-paste) when WSLg is absent
    const tool = reader.requiredTool();
    expect(tool).toContain("PowerShell (via WSL interop)");
    expect(tool).toContain("wl-paste");
  });

  it("returns FallbackClipboardReader for WSL with DISPLAY but no WSLg (PowerShell first)", () => {
    const reader = createClipboardReader(
      makePlatform({ os: "linux", isWSL: true, hasWslg: false, displayServer: "x11", powershellPath: "/mnt/c/ps.exe" }),
    );
    expect(reader).toBeInstanceOf(FallbackClipboardReader);
    const tool = reader.requiredTool();
    expect(tool).toContain("PowerShell (via WSL interop)");
    expect(tool).toContain("xclip");
  });

  it("prefers native Linux reader when WSLg is available (wl-paste first)", () => {
    const reader = createClipboardReader(
      makePlatform({ os: "linux", isWSL: true, hasWslg: true, displayServer: "wayland", powershellPath: "/mnt/c/ps.exe" }),
    );
    expect(reader).toBeInstanceOf(FallbackClipboardReader);
    const tool = reader.requiredTool();
    // With WSLg, wl-paste should be listed before PowerShell
    expect(tool.indexOf("wl-paste")).toBeLessThan(
      tool.indexOf("PowerShell"),
    );
  });

  it("prefers native Linux reader when WSLg is available (xclip first for x11)", () => {
    const reader = createClipboardReader(
      makePlatform({ os: "linux", isWSL: true, hasWslg: true, displayServer: "x11", powershellPath: "/mnt/c/ps.exe" }),
    );
    expect(reader).toBeInstanceOf(FallbackClipboardReader);
    const tool = reader.requiredTool();
    expect(tool.indexOf("xclip")).toBeLessThan(
      tool.indexOf("PowerShell"),
    );
  });

  it("returns plain WslClipboardReader for WSLg without display server", () => {
    // WSLg detected but no DISPLAY/WAYLAND_DISPLAY set (unusual but possible)
    const reader = createClipboardReader(
      makePlatform({ os: "linux", isWSL: true, hasWslg: true, displayServer: "unknown", powershellPath: "/mnt/c/ps.exe" }),
    );
    expect(reader).toBeInstanceOf(WslClipboardReader);
  });
});

// ---------------------------------------------------------------------------
// 2. MacosClipboardReader
// ---------------------------------------------------------------------------
describe("MacosClipboardReader", () => {
  let reader: MacosClipboardReader;

  beforeEach(() => {
    reader = new MacosClipboardReader();
  });

  it("requiredTool() returns 'pngpaste'", () => {
    expect(reader.requiredTool()).toBe("pngpaste");
  });

  // -- isToolAvailable ------------------------------------------------------
  describe("isToolAvailable", () => {
    it("returns true when pngpaste is found", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "/usr/local/bin/pngpaste", stderr: "" });
      const result = await reader.isToolAvailable();
      expect(result).toBe(true);
      expect(mockExec).toHaveBeenCalledWith("which", ["pngpaste"]);
    });

    it("returns false when pngpaste is not found", async () => {
      mockExec.mockRejectedValueOnce(new Error("not found"));
      const result = await reader.isToolAvailable();
      expect(result).toBe(false);
    });
  });

  // -- hasImage -------------------------------------------------------------
  describe("hasImage", () => {
    it("returns true when clipboard info contains PNGf class", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "«class PNGf», 42",
        stderr: "",
      });
      expect(await reader.hasImage()).toBe(true);
      expect(mockExec).toHaveBeenCalledWith("osascript", ["-e", "clipboard info"]);
    });

    it("returns true when clipboard info contains TIFF class", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "«class TIFF», 1024",
        stderr: "",
      });
      expect(await reader.hasImage()).toBe(true);
    });

    it("returns true when clipboard info contains JPEG class", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "«class JPEG», 2048",
        stderr: "",
      });
      expect(await reader.hasImage()).toBe(true);
    });

    it("returns true when clipboard info contains BMP class", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "«class BMP », 4096",
        stderr: "",
      });
      expect(await reader.hasImage()).toBe(true);
    });

    it("returns false when clipboard has no image class", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "«class ut16», 18",
        stderr: "",
      });
      expect(await reader.hasImage()).toBe(false);
    });

    it("returns false when osascript throws", async () => {
      mockExec.mockRejectedValueOnce(new Error("command failed"));
      expect(await reader.hasImage()).toBe(false);
    });
  });

  // -- readImage ------------------------------------------------------------
  describe("readImage", () => {
    it("returns { data, format } from pngpaste on success", async () => {
      const fakeImage = Buffer.from("PNG-DATA");
      // First call: hasImage -> osascript
      mockExec.mockResolvedValueOnce({ stdout: "«class PNGf», 42", stderr: "" });
      // Second call: execBuffer -> pngpaste
      mockExecBuffer.mockResolvedValueOnce({ stdout: fakeImage, stderr: "" });

      const result = await reader.readImage();
      expect(result).toEqual({ data: fakeImage, format: "png" });
      expect(mockExecBuffer).toHaveBeenCalledWith("pngpaste", ["-"]);
    });

    it("throws when no image is in the clipboard", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "«class ut16», 18", stderr: "" });
      await expect(reader.readImage()).rejects.toThrow("No image found in clipboard");
    });

    it("throws when hasImage itself throws (osascript fails)", async () => {
      mockExec.mockRejectedValueOnce(new Error("fail"));
      await expect(reader.readImage()).rejects.toThrow("No image found in clipboard");
    });
  });
});

// ---------------------------------------------------------------------------
// 3. LinuxClipboardReader
// ---------------------------------------------------------------------------
describe("LinuxClipboardReader", () => {
  // ===================== X11 =====================
  describe("X11 display server", () => {
    let reader: LinuxClipboardReader;

    beforeEach(() => {
      reader = new LinuxClipboardReader("x11");
    });

    it("requiredTool() returns 'xclip'", () => {
      expect(reader.requiredTool()).toBe("xclip");
    });

    // -- isToolAvailable ----------------------------------------------------
    describe("isToolAvailable", () => {
      it("returns true when xclip is found", async () => {
        mockExec.mockResolvedValueOnce({ stdout: "/usr/bin/xclip", stderr: "" });
        expect(await reader.isToolAvailable()).toBe(true);
        expect(mockExec).toHaveBeenCalledWith("which", ["xclip"]);
      });

      it("returns false when xclip is not found", async () => {
        mockExec.mockRejectedValueOnce(new Error("not found"));
        expect(await reader.isToolAvailable()).toBe(false);
      });
    });

    // -- hasImage -----------------------------------------------------------
    describe("hasImage", () => {
      it("returns true when TARGETS include image/png", async () => {
        mockExec.mockResolvedValueOnce({
          stdout: "TARGETS\nimage/png\nTIMESTAMP",
          stderr: "",
        });
        expect(await reader.hasImage()).toBe(true);
        expect(mockExec).toHaveBeenCalledWith("xclip", [
          "-selection",
          "clipboard",
          "-t",
          "TARGETS",
          "-o",
        ]);
      });

      it("returns true when TARGETS include image/jpeg but not image/png", async () => {
        mockExec.mockResolvedValueOnce({
          stdout: "TARGETS\nimage/jpeg\nTIMESTAMP",
          stderr: "",
        });
        expect(await reader.hasImage()).toBe(true);
      });

      it("returns false when TARGETS have no image types", async () => {
        mockExec.mockResolvedValueOnce({
          stdout: "TARGETS\nUTF8_STRING\nTIMESTAMP",
          stderr: "",
        });
        expect(await reader.hasImage()).toBe(false);
      });

      it("returns false when xclip throws", async () => {
        mockExec.mockRejectedValueOnce(new Error("no display"));
        expect(await reader.hasImage()).toBe(false);
      });
    });

    // -- readImage ----------------------------------------------------------
    describe("readImage", () => {
      it("returns { data, format } from xclip on success (PNG)", async () => {
        const fakeImage = Buffer.from("X11-IMG");
        // detectFormat -> xclip TARGETS
        mockExec.mockResolvedValueOnce({
          stdout: "image/png\nTIMESTAMP",
          stderr: "",
        });
        // execBuffer -> xclip read
        mockExecBuffer.mockResolvedValueOnce({ stdout: fakeImage, stderr: "" });

        const result = await reader.readImage();
        expect(result).toEqual({ data: fakeImage, format: "png" });
        expect(mockExecBuffer).toHaveBeenCalledWith("xclip", [
          "-selection",
          "clipboard",
          "-t",
          "image/png",
          "-o",
        ]);
      });

      it("extracts JPEG natively when clipboard has image/jpeg", async () => {
        const fakeImage = Buffer.from("JPEG-IMG");
        // detectFormat -> xclip TARGETS
        mockExec.mockResolvedValueOnce({
          stdout: "image/jpeg\nTIMESTAMP",
          stderr: "",
        });
        // execBuffer -> xclip read with JPEG MIME
        mockExecBuffer.mockResolvedValueOnce({ stdout: fakeImage, stderr: "" });

        const result = await reader.readImage();
        expect(result).toEqual({ data: fakeImage, format: "jpeg" });
        expect(mockExecBuffer).toHaveBeenCalledWith("xclip", [
          "-selection",
          "clipboard",
          "-t",
          "image/jpeg",
          "-o",
        ]);
      });

      it("extracts WebP natively when clipboard has image/webp", async () => {
        const fakeImage = Buffer.from("WEBP-IMG");
        // detectFormat -> xclip TARGETS
        mockExec.mockResolvedValueOnce({
          stdout: "image/webp\nTIMESTAMP",
          stderr: "",
        });
        // execBuffer -> xclip read with WebP MIME
        mockExecBuffer.mockResolvedValueOnce({ stdout: fakeImage, stderr: "" });

        const result = await reader.readImage();
        expect(result).toEqual({ data: fakeImage, format: "webp" });
        expect(mockExecBuffer).toHaveBeenCalledWith("xclip", [
          "-selection",
          "clipboard",
          "-t",
          "image/webp",
          "-o",
        ]);
      });

      it("falls back to PNG for unknown image format", async () => {
        const fakeImage = Buffer.from("UNKNOWN-IMG");
        // detectFormat -> xclip TARGETS (unrecognized image type)
        mockExec.mockResolvedValueOnce({
          stdout: "image/x-custom\nTIMESTAMP",
          stderr: "",
        });
        // execBuffer -> xclip read with image/png fallback
        mockExecBuffer.mockResolvedValueOnce({ stdout: fakeImage, stderr: "" });

        const result = await reader.readImage();
        expect(result).toEqual({ data: fakeImage, format: "png" });
        expect(mockExecBuffer).toHaveBeenCalledWith("xclip", [
          "-selection",
          "clipboard",
          "-t",
          "image/png",
          "-o",
        ]);
      });

      it("throws when no image is in the clipboard", async () => {
        mockExec.mockResolvedValueOnce({
          stdout: "UTF8_STRING\nTIMESTAMP",
          stderr: "",
        });
        await expect(reader.readImage()).rejects.toThrow(
          "No image found in clipboard",
        );
      });
    });
  });

  // ===================== Wayland =====================
  describe("Wayland display server", () => {
    let reader: LinuxClipboardReader;

    beforeEach(() => {
      reader = new LinuxClipboardReader("wayland");
    });

    it("requiredTool() returns 'wl-clipboard (wl-paste)'", () => {
      expect(reader.requiredTool()).toBe("wl-clipboard (wl-paste)");
    });

    // -- isToolAvailable ----------------------------------------------------
    describe("isToolAvailable", () => {
      it("returns true when wl-paste is found", async () => {
        mockExec.mockResolvedValueOnce({ stdout: "/usr/bin/wl-paste", stderr: "" });
        expect(await reader.isToolAvailable()).toBe(true);
        expect(mockExec).toHaveBeenCalledWith("which", ["wl-paste"]);
      });

      it("returns false when wl-paste is not found", async () => {
        mockExec.mockRejectedValueOnce(new Error("not found"));
        expect(await reader.isToolAvailable()).toBe(false);
      });
    });

    // -- hasImage -----------------------------------------------------------
    describe("hasImage", () => {
      it("returns true when list-types includes image/png", async () => {
        mockExec.mockResolvedValueOnce({
          stdout: "text/plain\nimage/png",
          stderr: "",
        });
        expect(await reader.hasImage()).toBe(true);
        expect(mockExec).toHaveBeenCalledWith("wl-paste", ["--list-types"]);
      });

      it("returns true when list-types includes image/jpeg but not image/png", async () => {
        mockExec.mockResolvedValueOnce({
          stdout: "text/plain\nimage/jpeg",
          stderr: "",
        });
        expect(await reader.hasImage()).toBe(true);
      });

      it("returns false when list-types has no image types", async () => {
        mockExec.mockResolvedValueOnce({
          stdout: "text/plain\ntext/html",
          stderr: "",
        });
        expect(await reader.hasImage()).toBe(false);
      });

      it("returns false when wl-paste throws", async () => {
        mockExec.mockRejectedValueOnce(new Error("no wayland display"));
        expect(await reader.hasImage()).toBe(false);
      });
    });

    // -- readImage ----------------------------------------------------------
    describe("readImage", () => {
      it("returns { data, format } from wl-paste on success (PNG)", async () => {
        const fakeImage = Buffer.from("WAYLAND-IMG");
        // detectFormat -> wl-paste --list-types
        mockExec.mockResolvedValueOnce({
          stdout: "image/png\ntext/plain",
          stderr: "",
        });
        // execBuffer -> wl-paste read
        mockExecBuffer.mockResolvedValueOnce({ stdout: fakeImage, stderr: "" });

        const result = await reader.readImage();
        expect(result).toEqual({ data: fakeImage, format: "png" });
        expect(mockExecBuffer).toHaveBeenCalledWith("wl-paste", [
          "--type",
          "image/png",
        ]);
      });

      it("extracts JPEG natively when clipboard has image/jpeg", async () => {
        const fakeImage = Buffer.from("WAYLAND-JPEG");
        // detectFormat -> wl-paste --list-types
        mockExec.mockResolvedValueOnce({
          stdout: "image/jpeg\ntext/plain",
          stderr: "",
        });
        mockExecBuffer.mockResolvedValueOnce({ stdout: fakeImage, stderr: "" });

        const result = await reader.readImage();
        expect(result).toEqual({ data: fakeImage, format: "jpeg" });
        expect(mockExecBuffer).toHaveBeenCalledWith("wl-paste", [
          "--type",
          "image/jpeg",
        ]);
      });

      it("throws when no image is in the clipboard", async () => {
        mockExec.mockResolvedValueOnce({
          stdout: "text/plain",
          stderr: "",
        });
        await expect(reader.readImage()).rejects.toThrow(
          "No image found in clipboard",
        );
      });
    });
  });

  // ===================== Unknown display server =====================
  describe("unknown display server", () => {
    it("falls back to xclip behaviour (non-wayland path)", () => {
      const reader = new LinuxClipboardReader("unknown");
      expect(reader.requiredTool()).toBe("xclip");
    });
  });
});

// ---------------------------------------------------------------------------
// 4. WindowsClipboardReader
// ---------------------------------------------------------------------------
describe("WindowsClipboardReader", () => {
  let reader: WindowsClipboardReader;

  beforeEach(() => {
    reader = new WindowsClipboardReader();
  });

  it("requiredTool() returns 'PowerShell (built-in)'", () => {
    expect(reader.requiredTool()).toBe("PowerShell (built-in)");
  });

  // -- isToolAvailable ------------------------------------------------------
  describe("isToolAvailable", () => {
    it("returns true when powershell.exe responds to echo", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "ok\n", stderr: "" });
      expect(await reader.isToolAvailable()).toBe(true);
      expect(mockExec).toHaveBeenCalledWith("powershell.exe", [
        "-Command",
        "echo ok",
      ]);
    });

    it("returns false when powershell.exe is not available", async () => {
      mockExec.mockRejectedValueOnce(new Error("ENOENT"));
      expect(await reader.isToolAvailable()).toBe(false);
    });
  });

  // -- hasImage -------------------------------------------------------------
  describe("hasImage", () => {
    it("returns true when PowerShell reports 'yes'", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "yes\r\n", stderr: "" });
      expect(await reader.hasImage()).toBe(true);
      expect(mockExec).toHaveBeenCalledWith("powershell.exe", [
        "-EncodedCommand",
        expect.any(String),
      ]);
    });

    it("returns false when PowerShell reports 'no'", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "no\r\n", stderr: "" });
      expect(await reader.hasImage()).toBe(false);
    });

    it("returns false when PowerShell throws", async () => {
      mockExec.mockRejectedValueOnce(new Error("fail"));
      expect(await reader.hasImage()).toBe(false);
    });
  });

  // -- readImage ------------------------------------------------------------
  describe("readImage", () => {
    it("reads the image via a temp file and cleans up", async () => {
      const fakeImage = Buffer.from("WIN-IMG");
      // readImage -> PS_READ_IMAGE (returns temp path)
      mockExec.mockResolvedValueOnce({
        stdout: "C:\\Users\\test\\AppData\\Local\\Temp\\tmp1234.tmp\r\n",
        stderr: "",
      });
      // fs.promises.readFile
      mockReadFile.mockResolvedValueOnce(fakeImage);
      // fs.promises.unlink (cleanup)
      mockUnlink.mockResolvedValueOnce(undefined);

      const result = await reader.readImage();
      expect(result).toEqual({ data: fakeImage, format: "png" });
      // Windows reader: resolveTempPath is identity, so path is the trimmed stdout
      expect(mockReadFile).toHaveBeenCalledWith(
        "C:\\Users\\test\\AppData\\Local\\Temp\\tmp1234.tmp",
      );
      // Cleanup should have been attempted
      expect(mockUnlink).toHaveBeenCalledWith(
        "C:\\Users\\test\\AppData\\Local\\Temp\\tmp1234.tmp",
      );
    });

    it("throws when PowerShell script fails (no image or error)", async () => {
      mockExec.mockRejectedValueOnce(new Error("Command failed (exit code 1)"));
      await expect(reader.readImage()).rejects.toThrow(
        "PowerShell execution failed",
      );
    });

    it("still cleans up the temp file when readFile throws", async () => {
      // PS_READ_IMAGE
      mockExec.mockResolvedValueOnce({
        stdout: "C:\\Temp\\file.tmp\r\n",
        stderr: "",
      });
      // readFile throws
      mockReadFile.mockRejectedValueOnce(new Error("ENOENT"));
      mockUnlink.mockResolvedValueOnce(undefined);

      await expect(reader.readImage()).rejects.toThrow("ENOENT");
      // Unlink should still be called (the finally block)
      expect(mockUnlink).toHaveBeenCalledWith("C:\\Temp\\file.tmp");
    });

    it("does not throw when unlink cleanup fails", async () => {
      const fakeImage = Buffer.from("WIN-IMG-2");
      mockExec.mockResolvedValueOnce({
        stdout: "C:\\Temp\\file.tmp\r\n",
        stderr: "",
      });
      mockReadFile.mockResolvedValueOnce(fakeImage);
      mockUnlink.mockRejectedValueOnce(new Error("permission denied"));

      // Should resolve normally despite unlink failure
      const result = await reader.readImage();
      expect(result).toEqual({ data: fakeImage, format: "png" });
    });
  });
});

// ---------------------------------------------------------------------------
// 5. WslClipboardReader
// ---------------------------------------------------------------------------
describe("WslClipboardReader", () => {
  const defaultPlatform = makePlatform({
    os: "linux",
    isWSL: true,
    powershellPath: "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
  });

  let reader: WslClipboardReader;

  beforeEach(() => {
    reader = new WslClipboardReader(defaultPlatform);
  });

  it("requiredTool() returns 'PowerShell (via WSL interop)'", () => {
    expect(reader.requiredTool()).toBe("PowerShell (via WSL interop)");
  });

  it("uses platform.powershellPath for the PowerShell executable", async () => {
    mockExec.mockResolvedValueOnce({ stdout: "ok\n", stderr: "" });
    await reader.isToolAvailable();
    expect(mockExec).toHaveBeenCalledWith(
      "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
      ["-Command", "echo ok"],
    );
  });

  it("falls back to 'powershell.exe' when powershellPath is null", async () => {
    const fallbackReader = new WslClipboardReader(
      makePlatform({ os: "linux", isWSL: true, powershellPath: null }),
    );
    mockExec.mockResolvedValueOnce({ stdout: "ok\n", stderr: "" });
    await fallbackReader.isToolAvailable();
    expect(mockExec).toHaveBeenCalledWith("powershell.exe", [
      "-Command",
      "echo ok",
    ]);
  });

  // -- isToolAvailable ------------------------------------------------------
  describe("isToolAvailable", () => {
    it("returns true when powershell responds", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "ok\n", stderr: "" });
      expect(await reader.isToolAvailable()).toBe(true);
    });

    it("returns false when powershell is unreachable", async () => {
      mockExec.mockRejectedValueOnce(new Error("ENOENT"));
      expect(await reader.isToolAvailable()).toBe(false);
    });
  });

  // -- hasImage -------------------------------------------------------------
  describe("hasImage", () => {
    it("returns true when PS reports 'yes'", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "yes\r\n", stderr: "" });
      expect(await reader.hasImage()).toBe(true);
    });

    it("returns false when PS reports 'no'", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "no\r\n", stderr: "" });
      expect(await reader.hasImage()).toBe(false);
    });
  });

  // -- readImage / resolveTempPath ------------------------------------------
  describe("readImage", () => {
    it("converts windows temp path via wslpath and reads the file", async () => {
      const fakeImage = Buffer.from("WSL-IMG");
      const winPath = "C:\\Users\\test\\AppData\\Local\\Temp\\tmp9999.tmp";
      const linuxPath = "/mnt/c/Users/test/AppData/Local/Temp/tmp9999.tmp";

      // readImage -> PS_READ_IMAGE
      mockExec.mockResolvedValueOnce({ stdout: `${winPath}\r\n`, stderr: "" });
      // resolveTempPath -> wslpath
      mockExec.mockResolvedValueOnce({ stdout: `${linuxPath}\n`, stderr: "" });
      // fs.promises.readFile
      mockReadFile.mockResolvedValueOnce(fakeImage);
      mockUnlink.mockResolvedValueOnce(undefined);

      const result = await reader.readImage();
      expect(result).toEqual({ data: fakeImage, format: "png" });

      // Verify wslpath was called with the Windows path
      expect(mockExec).toHaveBeenCalledWith("wslpath", ["-u", winPath]);
      // Verify file was read from the converted linux path
      expect(mockReadFile).toHaveBeenCalledWith(linuxPath);
      // Cleanup with linux path
      expect(mockUnlink).toHaveBeenCalledWith(linuxPath);
    });

    it("throws when PowerShell script fails (no image or error)", async () => {
      mockExec.mockRejectedValueOnce(new Error("Command failed (exit code 1)"));
      await expect(reader.readImage()).rejects.toThrow(
        "PowerShell execution failed",
      );
    });

    it("still cleans up temp file when readFile throws", async () => {
      const winPath = "C:\\Temp\\fail.tmp";
      const linuxPath = "/mnt/c/Temp/fail.tmp";

      mockExec.mockResolvedValueOnce({ stdout: `${winPath}\r\n`, stderr: "" });
      mockExec.mockResolvedValueOnce({ stdout: `${linuxPath}\n`, stderr: "" });
      mockReadFile.mockRejectedValueOnce(new Error("ENOENT"));
      mockUnlink.mockResolvedValueOnce(undefined);

      await expect(reader.readImage()).rejects.toThrow("ENOENT");
      expect(mockUnlink).toHaveBeenCalledWith(linuxPath);
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Error paths — readImage propagation
// ---------------------------------------------------------------------------
describe("readImage error paths", () => {
  describe("MacosClipboardReader", () => {
    let reader: MacosClipboardReader;

    beforeEach(() => {
      reader = new MacosClipboardReader();
    });

    it("throws when execBuffer rejects (pngpaste crash)", async () => {
      // hasImage -> true
      mockExec.mockResolvedValueOnce({ stdout: "«class PNGf», 42", stderr: "" });
      // execBuffer -> pngpaste crashes
      mockExecBuffer.mockRejectedValueOnce(new Error("pngpaste segfault"));
      await expect(reader.readImage()).rejects.toThrow("pngpaste segfault");
    });
  });

  describe("LinuxClipboardReader (X11)", () => {
    let reader: LinuxClipboardReader;

    beforeEach(() => {
      reader = new LinuxClipboardReader("x11");
    });

    it("throws when execBuffer rejects (xclip crash)", async () => {
      // detectFormat -> TARGETS
      mockExec.mockResolvedValueOnce({ stdout: "image/png\nTIMESTAMP", stderr: "" });
      // execBuffer -> xclip crashes
      mockExecBuffer.mockRejectedValueOnce(new Error("xclip: cannot connect to X server"));
      await expect(reader.readImage()).rejects.toThrow("xclip: cannot connect to X server");
    });
  });

  describe("LinuxClipboardReader (Wayland)", () => {
    let reader: LinuxClipboardReader;

    beforeEach(() => {
      reader = new LinuxClipboardReader("wayland");
    });

    it("throws when execBuffer rejects (wl-paste crash)", async () => {
      // detectFormat -> list-types
      mockExec.mockResolvedValueOnce({ stdout: "image/png\ntext/plain", stderr: "" });
      mockExecBuffer.mockRejectedValueOnce(new Error("wl-paste: no wayland display"));
      await expect(reader.readImage()).rejects.toThrow("wl-paste: no wayland display");
    });
  });

  describe("WslClipboardReader", () => {
    let reader: WslClipboardReader;

    beforeEach(() => {
      reader = new WslClipboardReader(
        makePlatform({ os: "linux", isWSL: true, powershellPath: "/mnt/c/ps.exe" }),
      );
    });

    it("throws with wslpath context when wslpath fails", async () => {
      const winPath = "C:\\Temp\\img.tmp";
      // PS_READ_IMAGE -> returns temp path
      mockExec.mockResolvedValueOnce({ stdout: `${winPath}\r\n`, stderr: "" });
      // wslpath -> fails
      mockExec.mockRejectedValueOnce(new Error("wslpath: command not found"));
      await expect(reader.readImage()).rejects.toThrow("wslpath conversion failed");
    });

    it("throws with PowerShell context when PS execution fails", async () => {
      // PS_READ_IMAGE -> fails
      mockExec.mockRejectedValueOnce(new Error("powershell.exe not found"));
      await expect(reader.readImage()).rejects.toThrow("PowerShell execution failed");
    });

    it("throws with temp file context when readFile fails", async () => {
      // PS_READ_IMAGE -> returns temp path
      mockExec.mockResolvedValueOnce({ stdout: "C:\\Temp\\img.tmp\r\n", stderr: "" });
      // wslpath -> success
      mockExec.mockResolvedValueOnce({ stdout: "/tmp/img.tmp\n", stderr: "" });
      // readFile -> fails
      mockReadFile.mockRejectedValueOnce(new Error("ENOENT: no such file or directory"));
      mockUnlink.mockResolvedValueOnce(undefined);
      await expect(reader.readImage()).rejects.toThrow("Temp file read failed");
    });

    it("throws when PowerShell returns empty stdout (no temp path)", async () => {
      // PS_READ_IMAGE -> empty stdout
      mockExec.mockResolvedValueOnce({ stdout: "\r\n", stderr: "" });
      // wslpath called with empty string
      mockExec.mockResolvedValueOnce({ stdout: "\n", stderr: "" });
      // readFile with empty path fails
      mockReadFile.mockRejectedValueOnce(new Error("ENOENT: no such file or directory, open ''"));
      mockUnlink.mockResolvedValueOnce(undefined);
      await expect(reader.readImage()).rejects.toThrow("Temp file read failed");
    });
  });

  describe("WindowsClipboardReader", () => {
    let reader: WindowsClipboardReader;

    beforeEach(() => {
      reader = new WindowsClipboardReader();
    });

    it("throws when PowerShell returns empty stdout (no temp path)", async () => {
      // PS_READ_IMAGE -> empty stdout
      mockExec.mockResolvedValueOnce({ stdout: "\r\n", stderr: "" });
      // readFile with empty path fails
      mockReadFile.mockRejectedValueOnce(new Error("ENOENT: no such file or directory, open ''"));
      mockUnlink.mockResolvedValueOnce(undefined);
      await expect(reader.readImage()).rejects.toThrow("ENOENT");
    });
  });
});

// ---------------------------------------------------------------------------
// 7. PowerShellClipboardReader (shared behaviour via WindowsClipboardReader)
// ---------------------------------------------------------------------------
describe("PowerShellClipboardReader (shared base behaviour)", () => {
  // We test shared behaviour through WindowsClipboardReader since the base
  // class is abstract and Windows is the simplest concrete implementation.

  let reader: WindowsClipboardReader;

  beforeEach(() => {
    reader = new WindowsClipboardReader();
  });

  describe("hasImage uses the PS_HAS_IMAGE script via -EncodedCommand", () => {
    it("sends the correct PowerShell encoded command", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "no\n", stderr: "" });
      await reader.hasImage();
      const call = mockExec.mock.calls[0];
      expect(call[0]).toBe("powershell.exe");
      expect(call[1][0]).toBe("-EncodedCommand");
      // The encoded command is a base64 string (UTF-16LE)
      const decoded = Buffer.from(call[1][1], "base64").toString("utf16le");
      expect(decoded).toContain("System.Windows.Forms.Clipboard");
      expect(decoded).toContain("ContainsImage");
    });
  });

  describe("readImage uses the PS_READ_IMAGE script via -EncodedCommand", () => {
    it("sends the correct PowerShell encoded command for reading", async () => {
      const fakeImage = Buffer.from("BASE-IMG");
      mockExec.mockResolvedValueOnce({
        stdout: "C:\\Temp\\img.tmp\r\n",
        stderr: "",
      });
      mockReadFile.mockResolvedValueOnce(fakeImage);
      mockUnlink.mockResolvedValueOnce(undefined);

      await reader.readImage();

      // First exec call is the PS_READ_IMAGE command (no more hasImage pre-check)
      const readCall = mockExec.mock.calls[0];
      expect(readCall[0]).toBe("powershell.exe");
      expect(readCall[1][0]).toBe("-EncodedCommand");
      const decoded = Buffer.from(readCall[1][1], "base64").toString("utf16le");
      expect(decoded).toContain("GetImage");
      expect(decoded).toContain("GetTempFileName");
      expect(decoded).toContain("ImageFormat");
    });
  });

  describe("isToolAvailable uses echo ok probe", () => {
    it("sends 'echo ok' via PowerShell", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "ok\n", stderr: "" });
      await reader.isToolAvailable();
      expect(mockExec).toHaveBeenCalledWith("powershell.exe", [
        "-Command",
        "echo ok",
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// 8. detectFormat() — MacosClipboardReader
// ---------------------------------------------------------------------------
describe("MacosClipboardReader detectFormat", () => {
  let reader: MacosClipboardReader;

  beforeEach(() => {
    reader = new MacosClipboardReader();
  });

  it("returns 'png' when clipboard info contains «class PNGf»", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "«class PNGf», 42\n«class TIFF», 1024",
      stderr: "",
    });
    expect(await reader.detectFormat()).toBe("png");
  });

  it("returns 'tiff' when clipboard info contains only «class TIFF»", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "«class TIFF», 1024\n«class ut16», 18",
      stderr: "",
    });
    expect(await reader.detectFormat()).toBe("tiff");
  });

  it("returns 'jpeg' when clipboard info contains «class JPEG»", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "«class JPEG», 2048",
      stderr: "",
    });
    expect(await reader.detectFormat()).toBe("jpeg");
  });

  it("returns 'jpeg' when clipboard info contains «class JPEf»", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "«class JPEf», 2048",
      stderr: "",
    });
    expect(await reader.detectFormat()).toBe("jpeg");
  });

  it("returns 'bmp' when clipboard info contains «class BMP »", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "«class BMP », 4096",
      stderr: "",
    });
    expect(await reader.detectFormat()).toBe("bmp");
  });

  it("prefers 'png' when clipboard has both «class PNGf» and «class TIFF»", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "«class TIFF», 1024\n«class PNGf», 42",
      stderr: "",
    });
    expect(await reader.detectFormat()).toBe("png");
  });

  it("prefers 'png' over 'jpeg' when both present", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "«class JPEG», 2048\n«class PNGf», 42",
      stderr: "",
    });
    expect(await reader.detectFormat()).toBe("png");
  });

  it("throws when no image data in clipboard", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "«class ut16», 18",
      stderr: "",
    });
    await expect(reader.detectFormat()).rejects.toThrow(
      "No image found in clipboard",
    );
  });

  it("throws when osascript fails", async () => {
    mockExec.mockRejectedValueOnce(new Error("osascript failed"));
    await expect(reader.detectFormat()).rejects.toThrow("osascript failed");
  });
});

// ---------------------------------------------------------------------------
// 9. detectFormat() — LinuxClipboardReader (X11)
// ---------------------------------------------------------------------------
describe("LinuxClipboardReader detectFormat (X11)", () => {
  let reader: LinuxClipboardReader;

  beforeEach(() => {
    reader = new LinuxClipboardReader("x11");
  });

  it("returns 'png' when TARGETS includes image/png", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "TARGETS\nimage/png\nimage/jpeg\nTIMESTAMP",
      stderr: "",
    });
    expect(await reader.detectFormat()).toBe("png");
  });

  it("returns 'jpeg' when TARGETS includes image/jpeg but not image/png", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "TARGETS\nimage/jpeg\nTIMESTAMP",
      stderr: "",
    });
    expect(await reader.detectFormat()).toBe("jpeg");
  });

  it("returns 'webp' when TARGETS includes image/webp only", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "TARGETS\nimage/webp\nTIMESTAMP",
      stderr: "",
    });
    expect(await reader.detectFormat()).toBe("webp");
  });

  it("returns 'tiff' when TARGETS includes image/tiff", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "TARGETS\nimage/tiff\nTIMESTAMP",
      stderr: "",
    });
    expect(await reader.detectFormat()).toBe("tiff");
  });

  it("returns 'bmp' when TARGETS includes image/bmp", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "TARGETS\nimage/bmp\nTIMESTAMP",
      stderr: "",
    });
    expect(await reader.detectFormat()).toBe("bmp");
  });

  it("returns 'bmp' when TARGETS includes image/x-bmp", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "TARGETS\nimage/x-bmp\nTIMESTAMP",
      stderr: "",
    });
    expect(await reader.detectFormat()).toBe("bmp");
  });

  it("returns 'unknown' when TARGETS has image/x-custom only", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "TARGETS\nimage/x-custom\nTIMESTAMP",
      stderr: "",
    });
    expect(await reader.detectFormat()).toBe("unknown");
  });

  it("throws when TARGETS have no image types", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "TARGETS\nUTF8_STRING\nTIMESTAMP",
      stderr: "",
    });
    await expect(reader.detectFormat()).rejects.toThrow(
      "No image found in clipboard",
    );
  });

  it("throws when xclip fails", async () => {
    mockExec.mockRejectedValueOnce(new Error("no display"));
    await expect(reader.detectFormat()).rejects.toThrow("no display");
  });
});

// ---------------------------------------------------------------------------
// 10. detectFormat() — LinuxClipboardReader (Wayland)
// ---------------------------------------------------------------------------
describe("LinuxClipboardReader detectFormat (Wayland)", () => {
  let reader: LinuxClipboardReader;

  beforeEach(() => {
    reader = new LinuxClipboardReader("wayland");
  });

  it("returns 'png' for image/png", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "image/png\ntext/plain",
      stderr: "",
    });
    expect(await reader.detectFormat()).toBe("png");
  });

  it("returns 'jpeg' for image/jpeg without image/png", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "image/jpeg\ntext/plain",
      stderr: "",
    });
    expect(await reader.detectFormat()).toBe("jpeg");
  });

  it("returns 'unknown' for unrecognized image MIME type", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "image/x-unknown\ntext/plain",
      stderr: "",
    });
    expect(await reader.detectFormat()).toBe("unknown");
  });

  it("throws when no image types present", async () => {
    mockExec.mockResolvedValueOnce({
      stdout: "text/plain\ntext/html",
      stderr: "",
    });
    await expect(reader.detectFormat()).rejects.toThrow(
      "No image found in clipboard",
    );
  });
});

// ---------------------------------------------------------------------------
// 11. detectFormat() — PowerShell readers (Windows + WSL)
// ---------------------------------------------------------------------------
describe("PowerShellClipboardReader detectFormat", () => {
  describe("WindowsClipboardReader", () => {
    let reader: WindowsClipboardReader;

    beforeEach(() => {
      reader = new WindowsClipboardReader();
    });

    it("returns 'png' when image is present", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "yes\r\n", stderr: "" });
      expect(await reader.detectFormat()).toBe("png");
    });

    it("throws when no image in clipboard", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "no\r\n", stderr: "" });
      await expect(reader.detectFormat()).rejects.toThrow(
        "No image found in clipboard",
      );
    });
  });

  describe("WslClipboardReader", () => {
    let reader: WslClipboardReader;

    beforeEach(() => {
      reader = new WslClipboardReader(
        makePlatform({ os: "linux", isWSL: true, powershellPath: "/mnt/c/ps.exe" }),
      );
    });

    it("returns 'png' when image is present (inherits from base)", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "yes\r\n", stderr: "" });
      expect(await reader.detectFormat()).toBe("png");
    });

    it("throws when no image in clipboard (inherits from base)", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "no\r\n", stderr: "" });
      await expect(reader.detectFormat()).rejects.toThrow(
        "No image found in clipboard",
      );
    });
  });
});

// ---------------------------------------------------------------------------
// 12. MacosOsascriptClipboardReader
// ---------------------------------------------------------------------------
describe("MacosOsascriptClipboardReader", () => {
  let reader: MacosOsascriptClipboardReader;

  beforeEach(() => {
    reader = new MacosOsascriptClipboardReader();
  });

  it("requiredTool() returns 'osascript (built-in)'", () => {
    expect(reader.requiredTool()).toBe("osascript (built-in)");
  });

  describe("isToolAvailable", () => {
    it("returns true on darwin", async () => {
      const original = process.platform;
      Object.defineProperty(process, "platform", { value: "darwin" });
      try {
        expect(await reader.isToolAvailable()).toBe(true);
      } finally {
        Object.defineProperty(process, "platform", { value: original });
      }
    });

    it("returns false on non-darwin", async () => {
      const original = process.platform;
      Object.defineProperty(process, "platform", { value: "linux" });
      try {
        expect(await reader.isToolAvailable()).toBe(false);
      } finally {
        Object.defineProperty(process, "platform", { value: original });
      }
    });
  });

  describe("hasImage", () => {
    it("returns true when clipboard info contains PNGf class", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "«class PNGf», 42",
        stderr: "",
      });
      expect(await reader.hasImage()).toBe(true);
    });

    it("returns true when clipboard info contains TIFF class", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "«class TIFF», 1024",
        stderr: "",
      });
      expect(await reader.hasImage()).toBe(true);
    });

    it("returns false when no image class present", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "«class ut16», 18",
        stderr: "",
      });
      expect(await reader.hasImage()).toBe(false);
    });

    it("returns false when osascript throws", async () => {
      mockExec.mockRejectedValueOnce(new Error("command failed"));
      expect(await reader.hasImage()).toBe(false);
    });
  });

  describe("detectFormat", () => {
    it("returns 'png' when clipboard has PNGf", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "«class PNGf», 42",
        stderr: "",
      });
      expect(await reader.detectFormat()).toBe("png");
    });

    it("returns 'jpeg' when clipboard has JPEG", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "«class JPEG», 2048",
        stderr: "",
      });
      expect(await reader.detectFormat()).toBe("jpeg");
    });

    it("returns 'tiff' when clipboard has TIFF only", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "«class TIFF», 1024",
        stderr: "",
      });
      expect(await reader.detectFormat()).toBe("tiff");
    });

    it("throws when no image present", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "«class ut16», 18",
        stderr: "",
      });
      await expect(reader.detectFormat()).rejects.toThrow(
        "No image found in clipboard",
      );
    });
  });

  describe("readImage", () => {
    it("returns { data, format } from osascript for PNG", async () => {
      const fakeImage = Buffer.from("OSASCRIPT-PNG");
      // detectFormat -> clipboard info
      mockExec.mockResolvedValueOnce({ stdout: "«class PNGf», 42", stderr: "" });
      // execBuffer -> osascript
      mockExecBuffer.mockResolvedValueOnce({ stdout: fakeImage, stderr: "" });

      const result = await reader.readImage();
      expect(result).toEqual({ data: fakeImage, format: "png" });
      expect(mockExecBuffer).toHaveBeenCalledWith("osascript", [
        "-e",
        "set imgData to (the clipboard as «class PNGf»)",
        "-e",
        "return imgData",
      ]);
    });

    it("extracts JPEG natively via osascript", async () => {
      const fakeImage = Buffer.from("OSASCRIPT-JPEG");
      // detectFormat -> clipboard info with JPEG
      mockExec.mockResolvedValueOnce({ stdout: "«class JPEG», 2048", stderr: "" });
      // execBuffer -> osascript with JPEG class
      mockExecBuffer.mockResolvedValueOnce({ stdout: fakeImage, stderr: "" });

      const result = await reader.readImage();
      expect(result).toEqual({ data: fakeImage, format: "jpeg" });
      expect(mockExecBuffer).toHaveBeenCalledWith("osascript", [
        "-e",
        "set imgData to (the clipboard as «class JPEG»)",
        "-e",
        "return imgData",
      ]);
    });

    it("extracts TIFF natively via osascript", async () => {
      const fakeImage = Buffer.from("OSASCRIPT-TIFF");
      // detectFormat -> clipboard info with TIFF
      mockExec.mockResolvedValueOnce({ stdout: "«class TIFF», 1024", stderr: "" });
      // execBuffer -> osascript with TIFF class
      mockExecBuffer.mockResolvedValueOnce({ stdout: fakeImage, stderr: "" });

      const result = await reader.readImage();
      expect(result).toEqual({ data: fakeImage, format: "tiff" });
      expect(mockExecBuffer).toHaveBeenCalledWith("osascript", [
        "-e",
        "set imgData to (the clipboard as «class TIFF»)",
        "-e",
        "return imgData",
      ]);
    });

    it("falls back to PNG for BMP (unsupported by osascript class map)", async () => {
      const fakeImage = Buffer.from("OSASCRIPT-BMP-AS-PNG");
      // detectFormat -> clipboard info with BMP
      mockExec.mockResolvedValueOnce({ stdout: "«class BMP », 4096", stderr: "" });
      // execBuffer -> osascript falls back to PNGf
      mockExecBuffer.mockResolvedValueOnce({ stdout: fakeImage, stderr: "" });

      const result = await reader.readImage();
      expect(result).toEqual({ data: fakeImage, format: "png" });
      expect(mockExecBuffer).toHaveBeenCalledWith("osascript", [
        "-e",
        "set imgData to (the clipboard as «class PNGf»)",
        "-e",
        "return imgData",
      ]);
    });

    it("throws when no image in clipboard", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "«class ut16», 18", stderr: "" });
      await expect(reader.readImage()).rejects.toThrow(
        "No image found in clipboard",
      );
    });
  });
});
