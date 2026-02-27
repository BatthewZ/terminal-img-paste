# Phase 17: Clipboard Format Detection

**Priority:** P0 — High impact, most-requested improvement
**Depends on:** V1 complete (Phases 1–16) ✅
**Enables:** Phase 18 (Multi-format clipboard reading), Phase 19 (Format conversion)

## Summary

The extension currently only handles PNG clipboard data. Browsers frequently copy JPEG/WebP, macOS copies TIFF, and Linux exposes MIME-negotiated types. This phase adds format detection to the `ClipboardReader` interface so the extension knows what format is on the clipboard _before_ reading it.

## Scope of Changes

### 1. Add `ClipboardFormat` type and `detectFormat()` to the interface

**File:** `src/clipboard/types.ts`

Add a `ClipboardFormat` union type and extend the `ClipboardReader` interface:

```typescript
export type ClipboardFormat = 'png' | 'jpeg' | 'tiff' | 'bmp' | 'webp' | 'unknown';

export interface ClipboardReader {
  requiredTool(): string;
  isToolAvailable(): Promise<boolean>;
  hasImage(): Promise<boolean>;
  readImage(): Promise<Buffer>;
  /** Detect the format of the image currently on the clipboard. */
  detectFormat(): Promise<ClipboardFormat>;
}
```

### 2. Implement `detectFormat()` on macOS clipboard reader

**File:** `src/clipboard/macosClipboard.ts`

The existing `hasImage()` already calls `osascript -e 'clipboard info'` and checks for `«class PNGf»` and `«class TIFF»`. Extend this to parse all known format classes:

- `«class PNGf»` → `'png'`
- `«class TIFF»` → `'tiff'`
- `«class JPEG»` or `«class JPEf»` → `'jpeg'`
- `«class BMP »` or `«class BMPf»` → `'bmp'`
- If none match but `hasImage()` was true → `'unknown'`
- If no image at all → throw an error

Use a preference order: prefer `png` > `jpeg` > `tiff` > `bmp` since `clipboard info` can list multiple formats. The macOS clipboard often contains the same image in multiple representations.

### 3. Implement `detectFormat()` on Linux clipboard reader

**File:** `src/clipboard/linuxClipboard.ts`

**X11 path:** The existing `hasImage()` already calls `xclip -selection clipboard -t TARGETS -o` to list available MIME types. Parse the output for format detection:

- `image/png` → `'png'`
- `image/jpeg` → `'jpeg'`
- `image/bmp` or `image/x-bmp` → `'bmp'`
- `image/webp` → `'webp'`
- `image/tiff` → `'tiff'`
- If any `image/*` present but unrecognized → `'unknown'`

Use same preference order: `png` > `jpeg` > `webp` > `tiff` > `bmp`.

**Wayland path:** The existing `hasImage()` already calls `wl-paste --list-types`. Apply the same MIME-to-format mapping and preference order.

### 4. Implement `detectFormat()` on PowerShell-based readers (Windows + WSL)

**File:** `src/clipboard/powershellClipboard.ts`

The PowerShell `System.Drawing.Imaging` always re-encodes to PNG when saving, so format detection always returns `'png'`. Implement as:

```typescript
async detectFormat(): Promise<ClipboardFormat> {
  const has = await this.hasImage();
  if (!has) {
    throw new Error('No image found in clipboard');
  }
  // PowerShell's System.Drawing always re-encodes to PNG
  return 'png';
}
```

No changes needed in `windowsClipboard.ts` or `wslClipboard.ts` since they inherit from `PowerShellClipboardReader`.

### 5. Update `hasImage()` on Linux to detect any image format (not just PNG)

**File:** `src/clipboard/linuxClipboard.ts`

Currently, `hasImage()` only checks for `image/png`. Update it to return `true` if _any_ `image/*` MIME type is present in the clipboard TARGETS/types list. This ensures that JPEG-only clipboard contents aren't silently rejected.

### 6. Update `hasImage()` on macOS to detect additional formats

**File:** `src/clipboard/macosClipboard.ts`

Currently checks for `«class PNGf»` and `«class TIFF»` only. Add `«class JPEG»` / `«class JPEf»` and `«class BMP »` / `«class BMPf»`.

### 7. Tests

**File:** `test/clipboard.test.ts` (extend existing file)

Add tests for `detectFormat()` on each platform reader. **Use subagents to parallelize test writing across the three reader implementations** since they are independent:

#### macOS tests (~6 tests):
- `detectFormat()` returns `'png'` when clipboard info contains `«class PNGf»`
- `detectFormat()` returns `'tiff'` when clipboard info contains only `«class TIFF»`
- `detectFormat()` returns `'jpeg'` when clipboard info contains `«class JPEG»`
- `detectFormat()` prefers `'png'` when clipboard has both `«class PNGf»` and `«class TIFF»`
- `detectFormat()` throws when no image data in clipboard
- `hasImage()` returns true for JPEG-only clipboard

#### Linux tests (~8 tests):
- X11 `detectFormat()` returns `'png'` when TARGETS includes `image/png`
- X11 `detectFormat()` returns `'jpeg'` when TARGETS includes `image/jpeg` but not `image/png`
- X11 `detectFormat()` returns `'webp'` when TARGETS includes `image/webp` only
- X11 `detectFormat()` returns `'unknown'` when TARGETS has `image/x-custom` only
- Wayland `detectFormat()` returns `'png'` for `image/png`
- Wayland `detectFormat()` returns `'jpeg'` for `image/jpeg` without `image/png`
- `hasImage()` returns true for JPEG-only clipboard (X11)
- `hasImage()` returns true for JPEG-only clipboard (Wayland)

#### PowerShell tests (~3 tests):
- `detectFormat()` returns `'png'` when image is present
- `detectFormat()` throws when no image in clipboard
- Inherited by Windows and WSL readers (verify via one test each)

## Implementation Notes

- **Do NOT change `readImage()` behavior yet.** This phase only adds detection. Phase 18 will update `readImage()` to use the detected format.
- **Do NOT change `imageStore.ts` yet.** The store still only saves PNG. Phase 18 handles multi-format saving.
- The `detectFormat()` method should reuse existing tool invocations where possible (e.g., macOS `osascript` output is already parsed in `hasImage()`). Consider extracting a shared `getClipboardInfo()` helper in macOS to avoid calling `osascript` twice.
- Similarly on Linux, consider extracting the TARGETS/types listing into a shared helper since both `hasImage()` and `detectFormat()` need it.

## Parallelism Opportunities

The implementing agent should **spawn subagents in parallel** for:
1. **Types + macOS implementation** — Update `types.ts` and `macosClipboard.ts` together (types must come first, so do types then macOS sequentially within one agent)
2. **Linux implementation** — Update `linuxClipboard.ts` (independent of macOS)
3. **PowerShell implementation** — Update `powershellClipboard.ts` (independent of others)
4. **Tests** — Can be split across platform readers, each in a subagent, after the implementation subagents finish

## Verification

1. `npm run compile` succeeds with no TypeScript errors
2. `npm run lint` passes
3. `npm test` passes — all existing 228 tests still green + new tests pass
4. No changes to the paste flow behavior (this is additive only)

## Completion Notes (Agent bb447eb4)

**All items implemented and verified.**

### Changes made:

1. **`src/clipboard/types.ts`** — Added `ClipboardFormat` union type (`'png' | 'jpeg' | 'tiff' | 'bmp' | 'webp' | 'unknown'`) and `detectFormat(): Promise<ClipboardFormat>` to the `ClipboardReader` interface.

2. **`src/clipboard/macosClipboard.ts`** —
   - Extracted `getClipboardInfo()` helper to avoid duplicate `osascript` calls.
   - Added `parseClipboardFormats()` helper to parse `clipboard info` output into formats with preference order: `png > jpeg > tiff > bmp`.
   - Implemented `detectFormat()` using the parsed formats.
   - Updated `hasImage()` to also detect `«class JPEG»`, `«class JPEf»`, `«class BMP »`, and `«class BMPf»` (was only PNG+TIFF).

3. **`src/clipboard/linuxClipboard.ts`** —
   - Extracted `getClipboardTypes()` helper shared between `hasImage()` and `detectFormat()`.
   - Added `MIME_FORMAT_MAP` constant and `detectFormatFromMimeTypes()` helper with preference order: `png > jpeg > webp > tiff > bmp`.
   - Implemented `detectFormat()` using MIME type parsing.
   - Updated `hasImage()` to use `image/*` regex match instead of just `image/png`, so JPEG/WebP/TIFF/BMP-only clipboards are detected.

4. **`src/clipboard/powershellClipboard.ts`** — Implemented `detectFormat()` that always returns `'png'` (PowerShell re-encodes to PNG). No changes to Windows/WSL subclasses needed.

5. **`test/clipboard.test.ts`** — Added 30 new tests (228 → 258 total):
   - macOS: 8 detectFormat tests (format parsing, preference order, error paths) + 2 new hasImage tests
   - Linux X11: 9 detectFormat tests (all MIME types + preference + unknown + errors) + 1 new hasImage test
   - Linux Wayland: 4 detectFormat tests + 1 new hasImage test
   - PowerShell: 4 detectFormat tests (Windows + WSL, success + error) + 1 description update

### Verification results:
- `npm run compile` — Clean build
- `npm run lint` — No errors
- `npm test` — 258/258 tests passing
