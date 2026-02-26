import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock: ../src/util/exec
// ---------------------------------------------------------------------------
vi.mock("../src/util/exec", () => ({
  exec: vi.fn(),
  execBuffer: vi.fn(),
}));

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
import { LinuxClipboardReader } from "../src/clipboard/linuxClipboard";
import { WindowsClipboardReader } from "../src/clipboard/windowsClipboard";
import { WslClipboardReader } from "../src/clipboard/wslClipboard";
import type { PlatformInfo } from "../src/platform/detect";

// Convenience typed references to the mocked functions
const mockExec = vi.mocked(exec);
const mockExecBuffer = vi.mocked(execBuffer);
const mockReadFile = vi.mocked(fs.promises.readFile);
const mockUnlink = vi.mocked(fs.promises.unlink);

// ---------------------------------------------------------------------------
// Helpers — platform info fixtures
// ---------------------------------------------------------------------------
function makePlatform(overrides: Partial<PlatformInfo> = {}): PlatformInfo {
  return {
    os: "linux",
    isWSL: false,
    displayServer: "x11",
    powershellPath: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Factory — createClipboardReader
// ---------------------------------------------------------------------------
describe("createClipboardReader", () => {
  it("returns MacosClipboardReader for macOS", () => {
    const reader = createClipboardReader(makePlatform({ os: "macos" }));
    expect(reader).toBeInstanceOf(MacosClipboardReader);
  });

  it("returns LinuxClipboardReader for Linux", () => {
    const reader = createClipboardReader(
      makePlatform({ os: "linux", displayServer: "x11" }),
    );
    expect(reader).toBeInstanceOf(LinuxClipboardReader);
  });

  it("returns LinuxClipboardReader with wayland display server", () => {
    const reader = createClipboardReader(
      makePlatform({ os: "linux", displayServer: "wayland" }),
    );
    expect(reader).toBeInstanceOf(LinuxClipboardReader);
  });

  it("returns WindowsClipboardReader for Windows", () => {
    const reader = createClipboardReader(makePlatform({ os: "windows" }));
    expect(reader).toBeInstanceOf(WindowsClipboardReader);
  });

  it("returns WslClipboardReader when isWSL is true (takes priority over os)", () => {
    const reader = createClipboardReader(
      makePlatform({ os: "linux", isWSL: true, powershellPath: "/mnt/c/ps.exe" }),
    );
    expect(reader).toBeInstanceOf(WslClipboardReader);
  });

  it("returns WslClipboardReader even when os is linux", () => {
    const reader = createClipboardReader(
      makePlatform({ os: "linux", isWSL: true }),
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
    it("returns a Buffer from pngpaste on success", async () => {
      const fakeImage = Buffer.from("PNG-DATA");
      // First call: hasImage -> osascript
      mockExec.mockResolvedValueOnce({ stdout: "«class PNGf», 42", stderr: "" });
      // Second call: execBuffer -> pngpaste
      mockExecBuffer.mockResolvedValueOnce({ stdout: fakeImage, stderr: "" });

      const result = await reader.readImage();
      expect(result).toEqual(fakeImage);
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

      it("returns false when TARGETS do not include image/png", async () => {
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
      it("returns a Buffer from xclip on success", async () => {
        const fakeImage = Buffer.from("X11-IMG");
        // hasImage -> xclip TARGETS
        mockExec.mockResolvedValueOnce({
          stdout: "image/png\nTIMESTAMP",
          stderr: "",
        });
        // execBuffer -> xclip read
        mockExecBuffer.mockResolvedValueOnce({ stdout: fakeImage, stderr: "" });

        const result = await reader.readImage();
        expect(result).toEqual(fakeImage);
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

      it("returns false when list-types does not include image/png", async () => {
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
      it("returns a Buffer from wl-paste on success", async () => {
        const fakeImage = Buffer.from("WAYLAND-IMG");
        // hasImage -> wl-paste --list-types
        mockExec.mockResolvedValueOnce({
          stdout: "image/png\ntext/plain",
          stderr: "",
        });
        // execBuffer -> wl-paste read
        mockExecBuffer.mockResolvedValueOnce({ stdout: fakeImage, stderr: "" });

        const result = await reader.readImage();
        expect(result).toEqual(fakeImage);
        expect(mockExecBuffer).toHaveBeenCalledWith("wl-paste", [
          "--type",
          "image/png",
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
        "-Command",
        expect.stringContaining("ContainsImage"),
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
      // hasImage -> PS_HAS_IMAGE
      mockExec.mockResolvedValueOnce({ stdout: "yes\r\n", stderr: "" });
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
      expect(result).toEqual(fakeImage);
      // Windows reader: resolveTempPath is identity, so path is the trimmed stdout
      expect(mockReadFile).toHaveBeenCalledWith(
        "C:\\Users\\test\\AppData\\Local\\Temp\\tmp1234.tmp",
      );
      // Cleanup should have been attempted
      expect(mockUnlink).toHaveBeenCalledWith(
        "C:\\Users\\test\\AppData\\Local\\Temp\\tmp1234.tmp",
      );
    });

    it("throws when no image is in the clipboard", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "no\r\n", stderr: "" });
      await expect(reader.readImage()).rejects.toThrow(
        "No image found in clipboard",
      );
    });

    it("still cleans up the temp file when readFile throws", async () => {
      // hasImage
      mockExec.mockResolvedValueOnce({ stdout: "yes\r\n", stderr: "" });
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
      mockExec.mockResolvedValueOnce({ stdout: "yes\r\n", stderr: "" });
      mockExec.mockResolvedValueOnce({
        stdout: "C:\\Temp\\file.tmp\r\n",
        stderr: "",
      });
      mockReadFile.mockResolvedValueOnce(fakeImage);
      mockUnlink.mockRejectedValueOnce(new Error("permission denied"));

      // Should resolve normally despite unlink failure
      const result = await reader.readImage();
      expect(result).toEqual(fakeImage);
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

      // hasImage -> PS_HAS_IMAGE
      mockExec.mockResolvedValueOnce({ stdout: "yes\r\n", stderr: "" });
      // readImage -> PS_READ_IMAGE
      mockExec.mockResolvedValueOnce({ stdout: `${winPath}\r\n`, stderr: "" });
      // resolveTempPath -> wslpath
      mockExec.mockResolvedValueOnce({ stdout: `${linuxPath}\n`, stderr: "" });
      // fs.promises.readFile
      mockReadFile.mockResolvedValueOnce(fakeImage);
      mockUnlink.mockResolvedValueOnce(undefined);

      const result = await reader.readImage();
      expect(result).toEqual(fakeImage);

      // Verify wslpath was called with the Windows path
      expect(mockExec).toHaveBeenCalledWith("wslpath", ["-u", winPath]);
      // Verify file was read from the converted linux path
      expect(mockReadFile).toHaveBeenCalledWith(linuxPath);
      // Cleanup with linux path
      expect(mockUnlink).toHaveBeenCalledWith(linuxPath);
    });

    it("throws when clipboard has no image", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "no\r\n", stderr: "" });
      await expect(reader.readImage()).rejects.toThrow(
        "No image found in clipboard",
      );
    });

    it("still cleans up temp file when readFile throws", async () => {
      const winPath = "C:\\Temp\\fail.tmp";
      const linuxPath = "/mnt/c/Temp/fail.tmp";

      mockExec.mockResolvedValueOnce({ stdout: "yes\r\n", stderr: "" });
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
// 6. PowerShellClipboardReader (shared behaviour via WindowsClipboardReader)
// ---------------------------------------------------------------------------
describe("PowerShellClipboardReader (shared base behaviour)", () => {
  // We test shared behaviour through WindowsClipboardReader since the base
  // class is abstract and Windows is the simplest concrete implementation.

  let reader: WindowsClipboardReader;

  beforeEach(() => {
    reader = new WindowsClipboardReader();
  });

  describe("hasImage uses the PS_HAS_IMAGE script", () => {
    it("sends the correct PowerShell command", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "no\n", stderr: "" });
      await reader.hasImage();
      const call = mockExec.mock.calls[0];
      expect(call[0]).toBe("powershell.exe");
      expect(call[1][0]).toBe("-Command");
      expect(call[1][1]).toContain("System.Windows.Forms.Clipboard");
      expect(call[1][1]).toContain("ContainsImage");
    });
  });

  describe("readImage uses the PS_READ_IMAGE script", () => {
    it("sends the correct PowerShell command for reading", async () => {
      const fakeImage = Buffer.from("BASE-IMG");
      mockExec.mockResolvedValueOnce({ stdout: "yes\r\n", stderr: "" });
      mockExec.mockResolvedValueOnce({
        stdout: "C:\\Temp\\img.tmp\r\n",
        stderr: "",
      });
      mockReadFile.mockResolvedValueOnce(fakeImage);
      mockUnlink.mockResolvedValueOnce(undefined);

      await reader.readImage();

      // Second exec call is the PS_READ_IMAGE command
      const readCall = mockExec.mock.calls[1];
      expect(readCall[0]).toBe("powershell.exe");
      expect(readCall[1][0]).toBe("-Command");
      expect(readCall[1][1]).toContain("GetImage");
      expect(readCall[1][1]).toContain("GetTempFileName");
      expect(readCall[1][1]).toContain("ImageFormat");
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
