# Phase 20: Clipboard Tool Fallback Chains

**Status:** COMPLETED by agent e69b32bb (task 9d215aaf)

## Completion Notes

All items implemented and verified:

### New files created:
- `src/clipboard/fallback.ts` — `FallbackClipboardReader` wrapper that tries readers in sequence, with AggregateError on total failure
- `src/clipboard/macosOsascriptClipboard.ts` — macOS osascript fallback reader (zero-install, uses `osascript` for clipboard access)
- `test/fallback.test.ts` — 17 unit tests for FallbackClipboardReader

### Files modified:
- `src/clipboard/index.ts` — Updated factory to build fallback chains: macOS (pngpaste→osascript), Linux (detected DS→opposite DS), WSL (PowerShell→Linux reader if WSLg detected)
- `src/platform/detect.ts` — WSL now detects WSLg display server via `WAYLAND_DISPLAY` and `DISPLAY` env vars
- `test/clipboard.test.ts` — Updated factory tests for FallbackClipboardReader, added MacosOsascriptClipboardReader tests (12 new tests)
- `test/platform.test.ts` — Updated WSL display server tests to match new WSLg detection behavior, added new WSLg-specific tests

### Verification:
- `npm run compile` — passes
- `npm run lint` — passes
- `npm test` — 288 tests pass (10 test files, 0 failures)

---

**Priority:** P0 — High impact, frequently requested
**Depends on:** V1 complete (Phases 1–16) ✅
**Independent of:** Phase 17 (format detection) — can be implemented in parallel

## Summary

When the preferred clipboard tool fails or is unavailable, the extension currently shows an error and gives up. This phase adds a `FallbackClipboardReader` wrapper that accepts an ordered list of readers and tries each in sequence. This is especially valuable for:

- **Linux mixed display servers:** Wayland sessions with XWayland (wl-paste fails → try xclip)
- **WSL with WSLg:** PowerShell interop is slow; xclip/wl-paste via WSLg may be faster and more reliable
- **macOS without pngpaste:** Fall back to osascript for basic clipboard reading

## Scope of Changes

### 1. Create `FallbackClipboardReader` wrapper

**New file:** `src/clipboard/fallback.ts`

Create a `FallbackClipboardReader` class that implements `ClipboardReader` and wraps an ordered list of readers:

```typescript
import { ClipboardReader, ClipboardFormat } from "./types";

/**
 * Tries each reader in order. The first reader whose operation succeeds wins.
 * If all readers fail, throws an aggregate error with details from each.
 */
export class FallbackClipboardReader implements ClipboardReader {
  private readers: ClipboardReader[];

  constructor(readers: ClipboardReader[]) {
    if (readers.length === 0) {
      throw new Error("FallbackClipboardReader requires at least one reader");
    }
    this.readers = readers;
  }

  requiredTool(): string {
    // Return the primary reader's tool name, with fallback names
    return this.readers
      .map((r) => r.requiredTool())
      .join(" or ");
  }

  async isToolAvailable(): Promise<boolean> {
    // True if ANY reader has its tool available
    for (const reader of this.readers) {
      if (await reader.isToolAvailable()) {
        return true;
      }
    }
    return false;
  }

  async hasImage(): Promise<boolean> {
    // True if ANY reader detects an image
    for (const reader of this.readers) {
      try {
        if (await reader.hasImage()) {
          return true;
        }
      } catch {
        // This reader failed; try the next
        continue;
      }
    }
    return false;
  }

  async detectFormat(): Promise<ClipboardFormat> {
    const errors: Error[] = [];
    for (const reader of this.readers) {
      try {
        return await reader.detectFormat();
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }
    throw new AggregateError(
      errors,
      `All clipboard readers failed to detect format: ${errors.map((e) => e.message).join("; ")}`
    );
  }

  async readImage(): Promise<Buffer> {
    const errors: Error[] = [];
    for (const reader of this.readers) {
      try {
        // Check tool availability first to skip unavailable readers quickly
        if (!(await reader.isToolAvailable())) {
          errors.push(new Error(`${reader.requiredTool()}: tool not available`));
          continue;
        }
        return await reader.readImage();
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }
    throw new AggregateError(
      errors,
      `All clipboard readers failed: ${errors.map((e) => e.message).join("; ")}`
    );
  }
}
```

Key design decisions:
- **Lazy fallback:** Only tries the next reader when the current one throws or fails
- **Tool availability check in `readImage()`:** Skips unavailable readers quickly without executing the full read pipeline
- **Aggregate error:** When all readers fail, throws a single error with messages from every failed reader so the user sees the full picture
- **Simple sequential loop:** No parallelism — we want the _first_ working reader, not all of them simultaneously

### 2. Create macOS osascript fallback reader

**New file:** `src/clipboard/macosOsascriptClipboard.ts`

A lightweight macOS clipboard reader that uses only `osascript` (no pngpaste dependency). Less reliable but zero-install:

```typescript
import { ClipboardReader, ClipboardFormat } from "./types";
import { execBuffer } from "../util/exec";

/**
 * macOS clipboard reader using only osascript.
 * Used as a fallback when pngpaste is not installed.
 * Writes clipboard data to stdout via osascript.
 */
export class MacosOsascriptClipboardReader implements ClipboardReader {
  requiredTool(): string {
    return "osascript (built-in)";
  }

  async isToolAvailable(): Promise<boolean> {
    // osascript is always available on macOS
    return process.platform === "darwin";
  }

  async hasImage(): Promise<boolean> {
    // Reuse the same osascript clipboard info approach
    // Import exec inline to match existing patterns
    const { exec } = await import("../util/exec");
    try {
      const { stdout } = await exec("osascript", ["-e", "clipboard info"]);
      return (
        stdout.includes("«class PNGf»") ||
        stdout.includes("«class TIFF»") ||
        stdout.includes("«class JPEG»") ||
        stdout.includes("«class JPEf»") ||
        stdout.includes("«class BMP »") ||
        stdout.includes("«class BMPf»")
      );
    } catch {
      return false;
    }
  }

  async detectFormat(): Promise<ClipboardFormat> {
    // Delegate to the same logic as MacosClipboardReader
    // osascript always reads as PNG via the write command below
    const has = await this.hasImage();
    if (!has) {
      throw new Error("No image found in clipboard");
    }
    return "png";
  }

  async readImage(): Promise<Buffer> {
    const has = await this.hasImage();
    if (!has) {
      throw new Error("No image found in clipboard");
    }
    // Use osascript to write the clipboard as PNG to stdout
    // This is less reliable than pngpaste but requires no installation
    const { stdout } = await execBuffer("osascript", [
      "-e",
      "set pngData to (the clipboard as «class PNGf»)",
      "-e",
      "return pngData",
    ]);
    return stdout;
  }
}
```

**Note:** The `osascript` approach for reading raw PNG bytes is fragile — `osascript` may add AppleScript framing to the binary output. If this proves unreliable, the implementation should fall back to writing to a temp file:
```applescript
set pngData to (the clipboard as «class PNGf»)
set f to open for access POSIX file "/tmp/tip-clipboard.png" with write permission
write pngData to f
close access f
return "/tmp/tip-clipboard.png"
```
Then read and delete the temp file. The implementing agent should test both approaches and use whichever works.

### 3. Update `createClipboardReader()` to return fallback chains

**File:** `src/clipboard/index.ts`

Update the factory function to build fallback chains:

```typescript
import { FallbackClipboardReader } from "./fallback";
import { MacosOsascriptClipboardReader } from "./macosOsascriptClipboard";

export function createClipboardReader(platform: PlatformInfo): ClipboardReader {
  if (platform.isWSL) {
    // Primary: PowerShell interop
    // Fallback: xclip or wl-paste if WSLg is available
    const readers: ClipboardReader[] = [new WslClipboardReader(platform)];

    // If WSLg might be available, add Linux readers as fallbacks
    if (platform.displayServer === "x11") {
      readers.push(new LinuxClipboardReader("x11"));
    } else if (platform.displayServer === "wayland") {
      readers.push(new LinuxClipboardReader("wayland"));
    }

    return readers.length === 1 ? readers[0] : new FallbackClipboardReader(readers);
  }

  switch (platform.os) {
    case "macos":
      // Primary: pngpaste. Fallback: osascript (zero-install)
      return new FallbackClipboardReader([
        new MacosClipboardReader(),
        new MacosOsascriptClipboardReader(),
      ]);

    case "windows":
      return new WindowsClipboardReader();

    case "linux": {
      // Primary: detected display server's tool
      // Fallback: the other display server's tool (XWayland / Wayland-on-X11 scenarios)
      const primary = new LinuxClipboardReader(platform.displayServer);
      const fallbackDS = platform.displayServer === "wayland" ? "x11" : "wayland";
      const fallback = new LinuxClipboardReader(fallbackDS);
      return new FallbackClipboardReader([primary, fallback]);
    }
  }
}
```

Key changes:
- **macOS:** pngpaste → osascript fallback
- **Linux:** detected display server → opposite display server (handles XWayland and Wayland-on-X11)
- **WSL:** PowerShell → Linux readers if WSLg display server is detected
- **Windows:** No fallback needed (PowerShell is always available)

### 4. Update WSL display server detection

**File:** `src/platform/detect.ts`

Currently `detectDisplayServer()` returns `"unknown"` for WSL. Update it to detect WSLg's display server:

```typescript
function detectDisplayServer(
  os: PlatformInfo["os"],
  isWSL: boolean
): PlatformInfo["displayServer"] {
  if (os !== "linux") {
    return "unknown";
  }

  // For WSL, check for WSLg (which provides X11/Wayland via /mnt/wslg/)
  if (isWSL) {
    // WSLg sets WAYLAND_DISPLAY or DISPLAY
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
  if (process.env.WAYLAND_DISPLAY) {
    return "wayland";
  }
  return "unknown";
}
```

This allows WSL + WSLg to have Linux clipboard readers as fallbacks.

### 5. Tests

**New file:** `test/fallback.test.ts`

Test the `FallbackClipboardReader` class in isolation. **Use subagents to parallelize** test writing since the fallback tests and the factory/integration tests are independent.

#### Subagent 1: `FallbackClipboardReader` unit tests (~12 tests)

**File:** `test/fallback.test.ts`

Create mock `ClipboardReader` implementations for testing:

```typescript
function createMockReader(overrides: Partial<ClipboardReader>): ClipboardReader {
  return {
    requiredTool: () => "mock-tool",
    isToolAvailable: async () => true,
    hasImage: async () => true,
    detectFormat: async () => "png",
    readImage: async () => Buffer.from("fake"),
    ...overrides,
  };
}
```

Tests:
- **Constructor** — throws if empty reader list provided
- **`requiredTool()`** — returns joined names of all readers (e.g., "pngpaste or osascript (built-in)")
- **`isToolAvailable()`** — returns true if any reader has tool available
- **`isToolAvailable()`** — returns false if no reader has tool available
- **`hasImage()`** — returns true from first reader that succeeds
- **`hasImage()`** — first reader throws, second reader returns true → returns true
- **`hasImage()`** — all readers return false → returns false
- **`detectFormat()`** — returns format from first successful reader
- **`detectFormat()`** — first reader throws, second succeeds → returns second's format
- **`detectFormat()`** — all readers throw → throws AggregateError with all messages
- **`readImage()`** — returns buffer from first available & successful reader
- **`readImage()`** — first reader's tool unavailable → skips to second reader
- **`readImage()`** — first reader available but throws on read → falls through to second
- **`readImage()`** — all readers fail → throws AggregateError with details from each

#### Subagent 2: Updated factory tests

**File:** `test/clipboard.test.ts` (extend existing)

Add a new `describe('createClipboardReader fallback chains')` block:

- **macOS** — returns `FallbackClipboardReader` (verify with `instanceof` or by checking `requiredTool()` contains "or")
- **Linux (wayland)** — returns `FallbackClipboardReader` with wayland primary + x11 fallback
- **Linux (x11)** — returns `FallbackClipboardReader` with x11 primary + wayland fallback
- **WSL without display** — returns plain `WslClipboardReader` (no fallback needed)
- **WSL with WAYLAND_DISPLAY** — returns `FallbackClipboardReader` with WSL primary + wayland fallback
- **WSL with DISPLAY** — returns `FallbackClipboardReader` with WSL primary + x11 fallback
- **Windows** — returns plain `WindowsClipboardReader` (no fallback)

#### Subagent 3: macOS osascript reader tests

**File:** `test/clipboard.test.ts` (extend existing) or new `test/macosOsascript.test.ts`

- **`requiredTool()`** — returns "osascript (built-in)"
- **`isToolAvailable()`** — returns true on darwin, false elsewhere
- **`hasImage()`** — returns true when clipboard info contains image class
- **`hasImage()`** — returns false when no image class present
- **`detectFormat()`** — returns `'png'` when image present
- **`detectFormat()`** — throws when no image present
- **`readImage()`** — returns buffer from osascript output
- **`readImage()`** — throws when no image in clipboard

## Implementation Notes

- **Do NOT break existing single-reader behavior.** The `FallbackClipboardReader` with a single reader should behave identically to the reader itself. When only one reader is applicable (e.g., Windows), return it directly rather than wrapping.
- **Keep `FallbackClipboardReader` generic.** It should not contain any platform-specific logic — all platform decisions happen in `createClipboardReader()`.
- **The `readImage()` fallback checks `isToolAvailable()` first** to avoid slow timeouts from trying to run a tool that doesn't exist. This is important for user experience.
- **`AggregateError`** is available in Node.js 15+ (VS Code's minimum is Node 16+), so it's safe to use.
- **osascript binary output caveat:** The macOS osascript reader may need to use a temp file approach instead of stdout for binary data. The implementing agent should test the stdout approach first and fall back to temp file if needed.

## Parallelism Opportunities

The implementing agent should **spawn subagents in parallel** for:

1. **`FallbackClipboardReader` + factory update** — Create `src/clipboard/fallback.ts` and update `src/clipboard/index.ts` (these are tightly coupled, do sequentially within one agent)
2. **macOS osascript reader** — Create `src/clipboard/macosOsascriptClipboard.ts` (independent of fallback wrapper)
3. **Platform detection update** — Update `src/platform/detect.ts` for WSLg display server (independent, small change)

After implementation subagents complete:
4. **Fallback unit tests** — `test/fallback.test.ts` (independent)
5. **Factory + osascript tests** — Extend `test/clipboard.test.ts` (independent of fallback tests)

## Verification

1. `npm run compile` succeeds with no TypeScript errors
2. `npm run lint` passes
3. `npm test` passes — all existing tests still green + new tests pass
4. No changes to the paste flow behavior for users whose primary tool works (fallback is transparent)
5. When primary tool is unavailable, fallback chain activates and produces the correct result
