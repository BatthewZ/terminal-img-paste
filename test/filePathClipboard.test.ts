import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock: ../src/util/exec
// ---------------------------------------------------------------------------
vi.mock("../src/util/exec", () => ({
  exec: vi.fn(),
  execBuffer: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: fs (used by FilePathClipboardReader.readImage)
// ---------------------------------------------------------------------------
vi.mock("fs", () => ({
  default: {
    promises: {
      readFile: vi.fn(),
    },
  },
  promises: {
    readFile: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock: ../src/util/logger
// ---------------------------------------------------------------------------
vi.mock("../src/util/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { exec } from "../src/util/exec";
import * as fs from "fs";

import {
  LinuxFilePathReader,
  WindowsFilePathReader,
  WslFilePathReader,
  MacosFilePathReader,
} from "../src/clipboard/filePathClipboard";
import type { PlatformInfo } from "../src/platform/detect";

const mockExec = vi.mocked(exec);
const mockReadFile = vi.mocked(fs.promises.readFile);

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
// 1. LinuxFilePathReader (X11)
// ---------------------------------------------------------------------------
describe("LinuxFilePathReader (X11)", () => {
  let reader: LinuxFilePathReader;

  beforeEach(() => {
    reader = new LinuxFilePathReader("x11");
  });

  it("requiredTool() returns xclip-based name", () => {
    expect(reader.requiredTool()).toBe("xclip [file paths]");
  });

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

  describe("hasImage", () => {
    it("returns true when clipboard has file:// URI pointing to a PNG", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "file:///home/user/photo.png\n",
        stderr: "",
      });
      expect(await reader.hasImage()).toBe(true);
    });

    it("returns true for JPEG files", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "file:///home/user/photo.jpg\n",
        stderr: "",
      });
      expect(await reader.hasImage()).toBe(true);
    });

    it("returns true for GIF files", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "file:///home/user/anim.gif\n",
        stderr: "",
      });
      expect(await reader.hasImage()).toBe(true);
    });

    it("returns false when clipboard has non-image file URIs", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "file:///home/user/document.pdf\n",
        stderr: "",
      });
      expect(await reader.hasImage()).toBe(false);
    });

    it("returns false when clipboard is empty", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "", stderr: "" });
      expect(await reader.hasImage()).toBe(false);
    });

    it("returns false when xclip throws", async () => {
      mockExec.mockRejectedValueOnce(new Error("no uri-list target"));
      expect(await reader.hasImage()).toBe(false);
    });
  });

  describe("detectFormat", () => {
    it("detects PNG format", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "file:///home/user/photo.png\n",
        stderr: "",
      });
      expect(await reader.detectFormat()).toBe("png");
    });

    it("detects JPEG format from .jpeg extension", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "file:///home/user/photo.jpeg\n",
        stderr: "",
      });
      expect(await reader.detectFormat()).toBe("jpeg");
    });

    it("detects JPEG format from .jpg extension", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "file:///home/user/photo.jpg\n",
        stderr: "",
      });
      expect(await reader.detectFormat()).toBe("jpeg");
    });

    it("detects WebP format", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "file:///home/user/photo.webp\n",
        stderr: "",
      });
      expect(await reader.detectFormat()).toBe("webp");
    });

    it("detects TIFF format from .tif extension", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "file:///home/user/photo.tif\n",
        stderr: "",
      });
      expect(await reader.detectFormat()).toBe("tiff");
    });

    it("detects GIF format", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "file:///home/user/anim.gif\n",
        stderr: "",
      });
      expect(await reader.detectFormat()).toBe("gif");
    });

    it("throws when no image file in clipboard", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "file:///home/user/doc.txt\n",
        stderr: "",
      });
      await expect(reader.detectFormat()).rejects.toThrow("No image file path found");
    });
  });

  describe("readImage", () => {
    it("reads image file from disk for PNG URI", async () => {
      const fakeImage = Buffer.from("PNG-DATA");
      mockExec.mockResolvedValueOnce({
        stdout: "file:///home/user/photo.png\n",
        stderr: "",
      });
      mockReadFile.mockResolvedValueOnce(fakeImage);

      const result = await reader.readImage();
      expect(result).toEqual({ data: fakeImage, format: "png" });
      expect(mockReadFile).toHaveBeenCalledWith("/home/user/photo.png");
    });

    it("handles URL-encoded paths", async () => {
      const fakeImage = Buffer.from("PNG-DATA");
      mockExec.mockResolvedValueOnce({
        stdout: "file:///home/user/my%20photo.png\n",
        stderr: "",
      });
      mockReadFile.mockResolvedValueOnce(fakeImage);

      const result = await reader.readImage();
      expect(result).toEqual({ data: fakeImage, format: "png" });
      expect(mockReadFile).toHaveBeenCalledWith("/home/user/my photo.png");
    });

    it("picks the first image file when multiple URIs present", async () => {
      const fakeImage = Buffer.from("JPEG-DATA");
      mockExec.mockResolvedValueOnce({
        stdout: "file:///home/user/readme.txt\nfile:///home/user/photo.jpg\nfile:///home/user/other.png\n",
        stderr: "",
      });
      mockReadFile.mockResolvedValueOnce(fakeImage);

      const result = await reader.readImage();
      expect(result).toEqual({ data: fakeImage, format: "jpeg" });
      expect(mockReadFile).toHaveBeenCalledWith("/home/user/photo.jpg");
    });

    it("throws when no image file in clipboard", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "file:///home/user/doc.pdf\n",
        stderr: "",
      });
      await expect(reader.readImage()).rejects.toThrow("No image file path found");
    });

    it("uses xclip with correct arguments", async () => {
      const fakeImage = Buffer.from("PNG-DATA");
      mockExec.mockResolvedValueOnce({
        stdout: "file:///home/user/photo.png\n",
        stderr: "",
      });
      mockReadFile.mockResolvedValueOnce(fakeImage);

      await reader.readImage();
      expect(mockExec).toHaveBeenCalledWith("xclip", [
        "-selection", "clipboard", "-t", "text/uri-list", "-o",
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. LinuxFilePathReader (Wayland)
// ---------------------------------------------------------------------------
describe("LinuxFilePathReader (Wayland)", () => {
  let reader: LinuxFilePathReader;

  beforeEach(() => {
    reader = new LinuxFilePathReader("wayland");
  });

  it("requiredTool() returns wl-paste-based name", () => {
    expect(reader.requiredTool()).toBe("wl-clipboard (wl-paste) [file paths]");
  });

  describe("isToolAvailable", () => {
    it("returns true when wl-paste is found", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "/usr/bin/wl-paste", stderr: "" });
      expect(await reader.isToolAvailable()).toBe(true);
      expect(mockExec).toHaveBeenCalledWith("which", ["wl-paste"]);
    });
  });

  describe("readImage", () => {
    it("uses wl-paste with correct arguments", async () => {
      const fakeImage = Buffer.from("PNG-DATA");
      mockExec.mockResolvedValueOnce({
        stdout: "file:///home/user/photo.png\n",
        stderr: "",
      });
      mockReadFile.mockResolvedValueOnce(fakeImage);

      await reader.readImage();
      expect(mockExec).toHaveBeenCalledWith("wl-paste", [
        "--type", "text/uri-list",
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. WindowsFilePathReader
// ---------------------------------------------------------------------------
describe("WindowsFilePathReader", () => {
  let reader: WindowsFilePathReader;

  beforeEach(() => {
    reader = new WindowsFilePathReader();
  });

  it("requiredTool() returns PowerShell name with file paths tag", () => {
    expect(reader.requiredTool()).toBe("PowerShell (built-in) [file paths]");
  });

  describe("isToolAvailable", () => {
    it("returns true when powershell.exe responds", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "ok", stderr: "" });
      expect(await reader.isToolAvailable()).toBe(true);
    });

    it("returns false when powershell.exe is not found", async () => {
      mockExec.mockRejectedValueOnce(new Error("not found"));
      expect(await reader.isToolAvailable()).toBe(false);
    });
  });

  describe("hasImage", () => {
    it("returns true when clipboard contains an image file path", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "C:\\Users\\test\\photo.png\r\n",
        stderr: "",
      });
      expect(await reader.hasImage()).toBe(true);
    });

    it("returns false for non-image files", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "C:\\Users\\test\\document.docx\r\n",
        stderr: "",
      });
      expect(await reader.hasImage()).toBe(false);
    });

    it("returns false when clipboard is empty", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "", stderr: "" });
      expect(await reader.hasImage()).toBe(false);
    });
  });

  describe("readImage", () => {
    it("reads the image file from disk", async () => {
      const fakeImage = Buffer.from("BMP-DATA");
      mockExec.mockResolvedValueOnce({
        stdout: "C:\\Users\\test\\photo.bmp\r\n",
        stderr: "",
      });
      mockReadFile.mockResolvedValueOnce(fakeImage);

      const result = await reader.readImage();
      expect(result).toEqual({ data: fakeImage, format: "bmp" });
      expect(mockReadFile).toHaveBeenCalledWith("C:\\Users\\test\\photo.bmp");
    });

    it("selects the first image file from multiple paths", async () => {
      const fakeImage = Buffer.from("WEBP-DATA");
      mockExec.mockResolvedValueOnce({
        stdout: "C:\\Users\\test\\readme.txt\r\nC:\\Users\\test\\pic.webp\r\n",
        stderr: "",
      });
      mockReadFile.mockResolvedValueOnce(fakeImage);

      const result = await reader.readImage();
      expect(result).toEqual({ data: fakeImage, format: "webp" });
    });
  });
});

// ---------------------------------------------------------------------------
// 4. WslFilePathReader
// ---------------------------------------------------------------------------
describe("WslFilePathReader", () => {
  let reader: WslFilePathReader;

  beforeEach(() => {
    reader = new WslFilePathReader(
      makePlatform({ isWSL: true, powershellPath: "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe" }),
    );
  });

  it("requiredTool() returns PowerShell (via WSL interop) with file paths tag", () => {
    expect(reader.requiredTool()).toBe("PowerShell (via WSL interop) [file paths]");
  });

  describe("isToolAvailable", () => {
    it("returns true when PowerShell responds", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "ok", stderr: "" });
      expect(await reader.isToolAvailable()).toBe(true);
    });

    it("returns false when PowerShell is not available", async () => {
      mockExec.mockRejectedValueOnce(new Error("not found"));
      expect(await reader.isToolAvailable()).toBe(false);
    });
  });

  describe("hasImage", () => {
    it("returns true when clipboard has an image file (after wslpath conversion)", async () => {
      // PowerShell GetFileDropList
      mockExec.mockResolvedValueOnce({
        stdout: "C:\\Users\\test\\photo.png\r\n",
        stderr: "",
      });
      // wslpath conversion
      mockExec.mockResolvedValueOnce({
        stdout: "/mnt/c/Users/test/photo.png\n",
        stderr: "",
      });
      expect(await reader.hasImage()).toBe(true);
    });

    it("returns false for non-image files", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "C:\\Users\\test\\document.docx\r\n",
        stderr: "",
      });
      mockExec.mockResolvedValueOnce({
        stdout: "/mnt/c/Users/test/document.docx\n",
        stderr: "",
      });
      expect(await reader.hasImage()).toBe(false);
    });
  });

  describe("readImage", () => {
    it("converts Windows paths via wslpath and reads the file", async () => {
      const fakeImage = Buffer.from("JPEG-DATA");
      // PowerShell GetFileDropList
      mockExec.mockResolvedValueOnce({
        stdout: "C:\\Users\\test\\photo.jpg\r\n",
        stderr: "",
      });
      // wslpath conversion
      mockExec.mockResolvedValueOnce({
        stdout: "/mnt/c/Users/test/photo.jpg\n",
        stderr: "",
      });
      mockReadFile.mockResolvedValueOnce(fakeImage);

      const result = await reader.readImage();
      expect(result).toEqual({ data: fakeImage, format: "jpeg" });
      expect(mockReadFile).toHaveBeenCalledWith("/mnt/c/Users/test/photo.jpg");
    });

    it("uses the configured powershellPath", async () => {
      const fakeImage = Buffer.from("PNG-DATA");
      mockExec.mockResolvedValueOnce({
        stdout: "C:\\Users\\test\\photo.png\r\n",
        stderr: "",
      });
      mockExec.mockResolvedValueOnce({
        stdout: "/mnt/c/Users/test/photo.png\n",
        stderr: "",
      });
      mockReadFile.mockResolvedValueOnce(fakeImage);

      await reader.readImage();
      // First call should use the configured PowerShell path
      expect(mockExec.mock.calls[0][0]).toBe(
        "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
      );
      // Second call should be wslpath
      expect(mockExec.mock.calls[1][0]).toBe("wslpath");
    });

    it("skips paths where wslpath fails and continues", async () => {
      const fakeImage = Buffer.from("PNG-DATA");
      mockExec.mockResolvedValueOnce({
        stdout: "C:\\bad\\path.png\r\nC:\\Users\\test\\photo.png\r\n",
        stderr: "",
      });
      // First wslpath fails
      mockExec.mockRejectedValueOnce(new Error("wslpath failed"));
      // Second wslpath succeeds
      mockExec.mockResolvedValueOnce({
        stdout: "/mnt/c/Users/test/photo.png\n",
        stderr: "",
      });
      mockReadFile.mockResolvedValueOnce(fakeImage);

      const result = await reader.readImage();
      expect(result).toEqual({ data: fakeImage, format: "png" });
    });
  });
});

// ---------------------------------------------------------------------------
// 5. MacosFilePathReader
// ---------------------------------------------------------------------------
describe("MacosFilePathReader", () => {
  let reader: MacosFilePathReader;

  beforeEach(() => {
    reader = new MacosFilePathReader();
  });

  it("requiredTool() returns osascript name with file paths tag", () => {
    expect(reader.requiredTool()).toBe("osascript (built-in) [file paths]");
  });

  describe("hasImage", () => {
    it("returns true when clipboard has a file path pointing to an image", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "/Users/test/Desktop/screenshot.png\n",
        stderr: "",
      });
      expect(await reader.hasImage()).toBe(true);
    });

    it("returns false when clipboard has a non-image file", async () => {
      mockExec.mockResolvedValueOnce({
        stdout: "/Users/test/Desktop/document.pdf\n",
        stderr: "",
      });
      expect(await reader.hasImage()).toBe(false);
    });

    it("returns false when osascript returns empty (no file on clipboard)", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "\n", stderr: "" });
      expect(await reader.hasImage()).toBe(false);
    });

    it("returns false when osascript throws", async () => {
      mockExec.mockRejectedValueOnce(new Error("osascript error"));
      expect(await reader.hasImage()).toBe(false);
    });
  });

  describe("readImage", () => {
    it("reads the image file from disk", async () => {
      const fakeImage = Buffer.from("TIFF-DATA");
      mockExec.mockResolvedValueOnce({
        stdout: "/Users/test/photo.tiff\n",
        stderr: "",
      });
      mockReadFile.mockResolvedValueOnce(fakeImage);

      const result = await reader.readImage();
      expect(result).toEqual({ data: fakeImage, format: "tiff" });
      expect(mockReadFile).toHaveBeenCalledWith("/Users/test/photo.tiff");
    });

    it("throws when no image file on clipboard", async () => {
      mockExec.mockResolvedValueOnce({ stdout: "\n", stderr: "" });
      await expect(reader.readImage()).rejects.toThrow("No image file path found");
    });

    it("passes correct osascript arguments", async () => {
      const fakeImage = Buffer.from("PNG-DATA");
      mockExec.mockResolvedValueOnce({
        stdout: "/Users/test/photo.png\n",
        stderr: "",
      });
      mockReadFile.mockResolvedValueOnce(fakeImage);

      await reader.readImage();
      expect(mockExec).toHaveBeenCalledWith("osascript", [
        "-e", "try",
        "-e", "  set fileList to (the clipboard as «class furl»)",
        "-e", "  return POSIX path of fileList",
        "-e", "on error",
        "-e", "  return \"\"",
        "-e", "end try",
      ]);
    });
  });
});
