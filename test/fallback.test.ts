import { describe, it, expect, vi } from "vitest";
import { FallbackClipboardReader } from "../src/clipboard/fallback";
import type { ClipboardReader, ClipboardFormat, ClipboardImageResult } from "../src/clipboard/types";

function createMockReader(
  overrides: Partial<ClipboardReader> = {},
): ClipboardReader {
  return {
    requiredTool: () => "mock-tool",
    isToolAvailable: async () => true,
    hasImage: async () => true,
    detectFormat: async () => "png" as ClipboardFormat,
    readImage: async () => ({ data: Buffer.from("fake"), format: "png" as ClipboardFormat }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------
describe("FallbackClipboardReader", () => {
  it("throws if empty reader list provided", () => {
    expect(() => new FallbackClipboardReader([])).toThrow(
      "FallbackClipboardReader requires at least one reader",
    );
  });

  // -------------------------------------------------------------------------
  // requiredTool()
  // -------------------------------------------------------------------------
  describe("requiredTool", () => {
    it("returns joined names of all readers", () => {
      const fb = new FallbackClipboardReader([
        createMockReader({ requiredTool: () => "pngpaste" }),
        createMockReader({ requiredTool: () => "osascript (built-in)" }),
      ]);
      expect(fb.requiredTool()).toBe("pngpaste or osascript (built-in)");
    });

    it("returns single name when only one reader", () => {
      const fb = new FallbackClipboardReader([
        createMockReader({ requiredTool: () => "xclip" }),
      ]);
      expect(fb.requiredTool()).toBe("xclip");
    });
  });

  // -------------------------------------------------------------------------
  // isToolAvailable()
  // -------------------------------------------------------------------------
  describe("isToolAvailable", () => {
    it("returns true if any reader has tool available", async () => {
      const fb = new FallbackClipboardReader([
        createMockReader({ isToolAvailable: async () => false }),
        createMockReader({ isToolAvailable: async () => true }),
      ]);
      expect(await fb.isToolAvailable()).toBe(true);
    });

    it("returns false if no reader has tool available", async () => {
      const fb = new FallbackClipboardReader([
        createMockReader({ isToolAvailable: async () => false }),
        createMockReader({ isToolAvailable: async () => false }),
      ]);
      expect(await fb.isToolAvailable()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // hasImage()
  // -------------------------------------------------------------------------
  describe("hasImage", () => {
    it("returns true from first reader that succeeds", async () => {
      const fb = new FallbackClipboardReader([
        createMockReader({ hasImage: async () => true }),
        createMockReader({ hasImage: async () => false }),
      ]);
      expect(await fb.hasImage()).toBe(true);
    });

    it("falls through when first reader throws, returns true from second", async () => {
      const fb = new FallbackClipboardReader([
        createMockReader({
          hasImage: async () => {
            throw new Error("fail");
          },
        }),
        createMockReader({ hasImage: async () => true }),
      ]);
      expect(await fb.hasImage()).toBe(true);
    });

    it("returns false when all readers return false", async () => {
      const fb = new FallbackClipboardReader([
        createMockReader({ hasImage: async () => false }),
        createMockReader({ hasImage: async () => false }),
      ]);
      expect(await fb.hasImage()).toBe(false);
    });

    it("returns false when all readers throw", async () => {
      const fb = new FallbackClipboardReader([
        createMockReader({
          hasImage: async () => {
            throw new Error("a");
          },
        }),
        createMockReader({
          hasImage: async () => {
            throw new Error("b");
          },
        }),
      ]);
      expect(await fb.hasImage()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // detectFormat()
  // -------------------------------------------------------------------------
  describe("detectFormat", () => {
    it("returns format from first successful reader", async () => {
      const fb = new FallbackClipboardReader([
        createMockReader({ detectFormat: async () => "jpeg" }),
        createMockReader({ detectFormat: async () => "png" }),
      ]);
      expect(await fb.detectFormat()).toBe("jpeg");
    });

    it("falls through when first reader throws, returns second format", async () => {
      const fb = new FallbackClipboardReader([
        createMockReader({
          detectFormat: async () => {
            throw new Error("no image");
          },
        }),
        createMockReader({ detectFormat: async () => "tiff" }),
      ]);
      expect(await fb.detectFormat()).toBe("tiff");
    });

    it("throws AggregateError when all readers fail", async () => {
      const fb = new FallbackClipboardReader([
        createMockReader({
          detectFormat: async () => {
            throw new Error("reader1 failed");
          },
        }),
        createMockReader({
          detectFormat: async () => {
            throw new Error("reader2 failed");
          },
        }),
      ]);
      const err = await fb.detectFormat().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AggregateError);
      const agg = err as AggregateError;
      expect(agg.message).toContain("All clipboard readers failed to detect format");
      expect(agg.errors).toHaveLength(2);
      expect(agg.errors[0].message).toBe("reader1 failed");
      expect(agg.errors[1].message).toBe("reader2 failed");
    });
  });

  // -------------------------------------------------------------------------
  // readImage()
  // -------------------------------------------------------------------------
  describe("readImage", () => {
    it("returns result from first available and successful reader", async () => {
      const result: ClipboardImageResult = { data: Buffer.from("image-data"), format: "png" };
      const fb = new FallbackClipboardReader([
        createMockReader({ readImage: async () => result }),
        createMockReader({
          readImage: async () => ({ data: Buffer.from("second"), format: "png" }),
        }),
      ]);
      expect(await fb.readImage()).toEqual(result);
    });

    it("falls through when first reader readImage throws, returns second result", async () => {
      const result: ClipboardImageResult = { data: Buffer.from("from-second"), format: "jpeg" };
      const fb = new FallbackClipboardReader([
        createMockReader({
          readImage: async () => { throw new Error("tool not found"); },
        }),
        createMockReader({ readImage: async () => result }),
      ]);
      expect(await fb.readImage()).toEqual(result);
    });

    it("does not call isToolAvailable during readImage", async () => {
      const isToolSpy = vi.fn().mockResolvedValue(true);
      const result: ClipboardImageResult = { data: Buffer.from("data"), format: "png" };
      const fb = new FallbackClipboardReader([
        createMockReader({
          isToolAvailable: isToolSpy,
          readImage: async () => result,
        }),
      ]);
      await fb.readImage();
      expect(isToolSpy).not.toHaveBeenCalled();
    });

    it("falls through when first reader available but throws on read", async () => {
      const result: ClipboardImageResult = { data: Buffer.from("fallback-buf"), format: "png" };
      const fb = new FallbackClipboardReader([
        createMockReader({
          readImage: async () => {
            throw new Error("read failed");
          },
        }),
        createMockReader({ readImage: async () => result }),
      ]);
      expect(await fb.readImage()).toEqual(result);
    });

    it("passes through format from successful reader", async () => {
      const result: ClipboardImageResult = { data: Buffer.from("jpeg-data"), format: "jpeg" };
      const fb = new FallbackClipboardReader([
        createMockReader({
          readImage: async () => {
            throw new Error("first fails");
          },
        }),
        createMockReader({ readImage: async () => result }),
      ]);
      const out = await fb.readImage();
      expect(out.format).toBe("jpeg");
      expect(out.data).toEqual(Buffer.from("jpeg-data"));
    });

    it("throws AggregateError when all readers fail", async () => {
      const fb = new FallbackClipboardReader([
        createMockReader({
          readImage: async () => {
            throw new Error("tool-a not found");
          },
        }),
        createMockReader({
          readImage: async () => {
            throw new Error("tool-b crashed");
          },
        }),
      ]);
      const err = await fb.readImage().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AggregateError);
      const agg = err as AggregateError;
      expect(agg.message).toContain("All clipboard readers failed");
      expect(agg.errors).toHaveLength(2);
      expect(agg.errors[0].message).toBe("tool-a not found");
      expect(agg.errors[1].message).toBe("tool-b crashed");
    });

    it("handles non-Error throws gracefully", async () => {
      const fb = new FallbackClipboardReader([
        createMockReader({
          readImage: async () => {
            throw "string error"; // eslint-disable-line no-throw-literal
          },
        }),
        createMockReader({
          readImage: async () => {
            throw new Error("also failed");
          },
        }),
      ]);
      await expect(fb.readImage()).rejects.toThrow(
        "All clipboard readers failed",
      );
    });
  });
});
