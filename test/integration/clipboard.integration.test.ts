import { describe, it, expect, vi, beforeAll } from "vitest";
import { execSync } from "child_process";
import { createClipboardReader } from "../../src/clipboard/index";
import { detectPlatform } from "../../src/platform/detect";
import { createTestPng, PNG_SIGNATURE } from "./fixtures/testImages";

// ---------------------------------------------------------------------------
// Required mock: logger (all clipboard readers log through this)
// ---------------------------------------------------------------------------
vi.mock("../../src/util/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Platform & reader setup (evaluated once before all tests)
// ---------------------------------------------------------------------------
const platform = detectPlatform();
const reader = createClipboardReader(platform);

const isLinuxX11 =
  platform.os === "linux" && platform.displayServer === "x11";
const isLinuxWayland =
  platform.os === "linux" && platform.displayServer === "wayland";
const isMacos = platform.os === "macos" && !platform.isWSL;

// ---------------------------------------------------------------------------
// Helper: check whether a CLI tool is on PATH
// ---------------------------------------------------------------------------
function hasCommand(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Determine tool availability up-front so we can skip platform-gated suites
const hasXclip = hasCommand("xclip");
const hasWlCopy = hasCommand("wl-copy");
const hasWlPaste = hasCommand("wl-paste");
const hasPngpaste = hasCommand("pngpaste");

// ---------------------------------------------------------------------------
// Top-level gate: skip the entire file unless RUN_INTEGRATION=1
// ---------------------------------------------------------------------------
describe.skipIf(!process.env.RUN_INTEGRATION)(
  "clipboard integration (real clipboard tools)",
  () => {
    // -------------------------------------------------------------------
    // 1. Tool availability
    // -------------------------------------------------------------------
    describe("tool availability", () => {
      it("isToolAvailable() returns true when the required tool is installed", async () => {
        const available = await reader.isToolAvailable();
        // On a properly configured CI or dev machine, at least one
        // clipboard backend should be available.
        expect(available).toBe(true);
      });
    });

    // -------------------------------------------------------------------
    // 2. Platform detection consistency
    // -------------------------------------------------------------------
    describe("platform detection consistency", () => {
      it("requiredTool() returns a non-empty string", () => {
        const tool = reader.requiredTool();
        expect(typeof tool).toBe("string");
        expect(tool.length).toBeGreaterThan(0);
      });
    });

    // -------------------------------------------------------------------
    // 3. Platform-gated write-then-read cycle
    // -------------------------------------------------------------------

    // --- Linux X11 (xclip) ---
    describe.skipIf(!isLinuxX11 || !hasXclip)(
      "Linux X11 — write-then-read via xclip",
      () => {
        const testPng = createTestPng();

        beforeAll(() => {
          // Write the test PNG into the clipboard using xclip
          execSync("xclip -selection clipboard -t image/png -i", {
            input: testPng,
            timeout: 5000,
          });
        });

        it("hasImage() returns true after writing a PNG to clipboard", async () => {
          const has = await reader.hasImage();
          expect(has).toBe(true);
        });

        it("readImage() returns a buffer starting with PNG signature", async () => {
          const result = await reader.readImage();
          expect(Buffer.isBuffer(result.data)).toBe(true);
          expect(result.data.length).toBeGreaterThan(0);

          // First 8 bytes must be the PNG signature
          const header = result.data.subarray(0, PNG_SIGNATURE.length);
          expect(header.equals(PNG_SIGNATURE)).toBe(true);
        });
      },
    );

    // --- Linux Wayland (wl-copy / wl-paste) ---
    describe.skipIf(!isLinuxWayland || !hasWlCopy || !hasWlPaste)(
      "Linux Wayland — write-then-read via wl-copy",
      () => {
        const testPng = createTestPng();

        beforeAll(() => {
          execSync("wl-copy --type image/png", {
            input: testPng,
            timeout: 5000,
          });
        });

        it("hasImage() returns true after writing a PNG to clipboard", async () => {
          const has = await reader.hasImage();
          expect(has).toBe(true);
        });

        it("readImage() returns a buffer starting with PNG signature", async () => {
          const result = await reader.readImage();
          expect(Buffer.isBuffer(result.data)).toBe(true);
          expect(result.data.length).toBeGreaterThan(0);

          const header = result.data.subarray(0, PNG_SIGNATURE.length);
          expect(header.equals(PNG_SIGNATURE)).toBe(true);
        });
      },
    );

    // --- macOS (pngpaste) ---
    describe.skipIf(!isMacos || !hasPngpaste)(
      "macOS — pngpaste availability",
      () => {
        it("pngpaste is on PATH", () => {
          expect(hasPngpaste).toBe(true);
        });

        it("isToolAvailable() returns true", async () => {
          const available = await reader.isToolAvailable();
          expect(available).toBe(true);
        });
      },
    );

    // -------------------------------------------------------------------
    // 4. detectFormat() correctness after writing an image
    // -------------------------------------------------------------------
    describe.skipIf(
      !(isLinuxX11 && hasXclip) && !(isLinuxWayland && hasWlCopy),
    )("detectFormat() after writing a PNG", () => {
      const testPng = createTestPng();

      beforeAll(() => {
        if (isLinuxX11 && hasXclip) {
          execSync("xclip -selection clipboard -t image/png -i", {
            input: testPng,
            timeout: 5000,
          });
        } else if (isLinuxWayland && hasWlCopy) {
          execSync("wl-copy --type image/png", {
            input: testPng,
            timeout: 5000,
          });
        }
      });

      it("detectFormat() returns 'png'", async () => {
        const format = await reader.detectFormat();
        expect(format).toBe("png");
      });
    });

    // -------------------------------------------------------------------
    // 5. hasImage() returns false when clipboard holds plain text
    // -------------------------------------------------------------------
    describe.skipIf(
      !(isLinuxX11 && hasXclip) && !(isLinuxWayland && hasWlCopy),
    )("hasImage() is false after clearing clipboard with text", () => {
      beforeAll(() => {
        // Overwrite the clipboard with plain text so no image target exists
        if (isLinuxX11 && hasXclip) {
          execSync(
            'echo -n "just text" | xclip -selection clipboard -t text/plain',
            { timeout: 5000, shell: "/bin/bash" },
          );
        } else if (isLinuxWayland && hasWlCopy) {
          execSync('echo -n "just text" | wl-copy --type text/plain', {
            timeout: 5000,
            shell: "/bin/bash",
          });
        }
      });

      it("hasImage() returns false", async () => {
        const has = await reader.hasImage();
        expect(has).toBe(false);
      });
    });
  },
);
