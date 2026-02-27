# Phase 18: Multi-Format Clipboard Reading

## Completion Notes (Agent edc7245b)

All three workstreams completed successfully:

### Workstream 1: Clipboard Readers
- Added `ClipboardImageResult` type (`{ data: Buffer; format: ClipboardFormat }`) to `types.ts`
- Updated `LinuxClipboardReader.readImage()` to detect format first, then request the correct MIME type from `xclip`/`wl-paste` (e.g., `image/jpeg`, `image/webp`) instead of hardcoded `image/png`
- Updated `MacosClipboardReader.readImage()` to return `{ data, format: "png" }` (pngpaste always outputs PNG)
- Updated `MacosOsascriptClipboardReader.readImage()` to detect format and use corresponding osascript class (`JPEG`, `TIFF`, or `PNGf` fallback)
- Updated `PowerShellClipboardReader.readImage()` to return `{ data, format: "png" }` (System.Drawing always re-encodes to PNG)
- Updated `FallbackClipboardReader.readImage()` return type to `ClipboardImageResult`

### Workstream 2: Storage Layer
- Added format-aware `validateImage()` replacing `validatePng()` — supports PNG, JPEG, BMP, WebP, TIFF magic bytes; skips validation for `unknown`
- Added `formatToExtension()` mapping (jpeg→.jpg, tiff→.tiff, bmp→.bmp, webp→.webp, default→.png)
- Updated `generateFileName()` to accept format parameter and use correct extension
- Updated `save()` to accept optional `format` parameter (defaults to `'png'` for backward compat)
- Updated `cleanup()` to include all image extensions (`.png`, `.jpg`, `.jpeg`, `.tiff`, `.bmp`, `.webp`) instead of just `.png`

### Workstream 3: Extension + Tests
- Updated `extension.ts` paste command to destructure `{ data, format }` and pass format to `imageStore.save()`
- Updated all test files (`clipboard.test.ts`, `extension.test.ts`, `imageStore.test.ts`, `imageStore.integration.test.ts`, `fallback.test.ts`)
- Added new tests for: JPEG/WebP extraction on Linux, JPEG/TIFF extraction via osascript, format-aware validation (all formats), multi-extension cleanup, format passthrough in fallback reader

### Verification
- `tsc --noEmit`: 0 errors
- `vitest run`: 347 tests pass (48 new tests added)

## Summary

The codebase can detect clipboard image formats (Phase 17) but always extracts and saves as PNG. This phase makes the pipeline format-aware end-to-end: read non-PNG formats from the clipboard in their native format and save them with the correct extension and validation.

## Current State

- `detectFormat()` is implemented on all platforms — returns `'png' | 'jpeg' | 'tiff' | 'bmp' | 'webp' | 'unknown'`
- `readImage()` always returns PNG data regardless of clipboard content:
  - Linux Wayland: `wl-paste --type image/png` (hardcoded)
  - Linux X11: `xclip -selection clipboard -t image/png -o` (hardcoded)
  - macOS pngpaste: outputs PNG by design
  - macOS osascript: requests `PNGf` format
  - Windows/WSL PowerShell: re-encodes to PNG via `System.Drawing`
- `imageStore.save()` validates PNG signature and saves with `.png` extension
- Cleanup logic filters for `.png` files only

## Implementation

This phase has **three parallel workstreams** that can be implemented by spawning subagents:

---

### Workstream 1: Update clipboard readers to support native format extraction

**Files to modify:**

#### `src/clipboard/types.ts`
- Change `readImage()` signature to `readImage(): Promise<{ data: Buffer; format: ClipboardFormat }>`
- This returns both the raw image bytes AND the format they're in

#### `src/clipboard/linuxClipboard.ts`
- Modify `readImage()` to call `detectFormat()` first
- Map the detected `ClipboardFormat` to the MIME type string:
  - `png` → `image/png`
  - `jpeg` → `image/jpeg`
  - `webp` → `image/webp`
  - `tiff` → `image/tiff`
  - `bmp` → `image/bmp` or `image/x-bmp`
  - `unknown` → fall back to `image/png`
- Pass the resolved MIME type to `wl-paste --type <mime>` or `xclip -t <mime> -o` instead of hardcoded `image/png`
- Return `{ data: buffer, format: detectedFormat }`

#### `src/clipboard/macosClipboard.ts`
- `pngpaste` always outputs PNG regardless of clipboard format, so format stays `'png'`
- Return `{ data: buffer, format: 'png' }`

#### `src/clipboard/macosOsascriptClipboard.ts`
- Modify `readImage()` to detect format first
- For JPEG: use `osascript -e 'write (the clipboard as JPEG picture) to "/tmp/tip-clip.jpg"'`
- For TIFF: use `osascript -e 'write (the clipboard as TIFF picture) to "/tmp/tip-clip.tiff"'`
- For PNG or unknown: keep current PNGf behavior
- Return `{ data: buffer, format: actualFormat }`

#### `src/clipboard/powershellClipboard.ts` (affects Windows + WSL)
- PowerShell's `System.Drawing` always re-encodes to PNG — no change to extraction logic
- Return `{ data: buffer, format: 'png' }`

#### `src/clipboard/fallback.ts`
- Update `readImage()` return type to match new `{ data, format }` signature
- Pass through the result from whichever reader succeeds

---

### Workstream 2: Update storage layer for multi-format support

**Files to modify:**

#### `src/storage/imageStore.ts`

1. **`save()` method** — Accept a `format: ClipboardFormat` parameter alongside the buffer:
   - Map format to file extension: `png→.png`, `jpeg→.jpg`, `tiff→.tiff`, `bmp→.bmp`, `webp→.webp`, `unknown→.png`
   - Use the correct extension in `generateFilename()`

2. **Validation** — Replace `validatePng()` with a format-aware `validateImage()`:
   - PNG: `0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A` (existing)
   - JPEG: first 2 bytes are `0xFF 0xD8`
   - BMP: first 2 bytes are `0x42 0x4D` (`BM`)
   - WebP: bytes 0-3 are `RIFF` AND bytes 8-11 are `WEBP`
   - TIFF: first 2 bytes are `0x49 0x49` (little-endian) or `0x4D 0x4D` (big-endian)
   - `unknown`: skip validation entirely (log a warning)

3. **`generateFilename()`** — Accept format parameter, use correct extension

4. **`cleanup()`** — Update the file filter from `.png` only to include all image extensions:
   ```typescript
   const imageExtensions = ['.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.webp'];
   const imageFiles = entries.filter(f => imageExtensions.some(ext => f.endsWith(ext)));
   ```

---

### Workstream 3: Update extension entry point and tests

**Files to modify:**

#### `src/extension.ts`
- Update the paste command handler to destructure `{ data, format }` from `readImage()`
- Pass `format` to `imageStore.save(data, format)`

#### Tests — update all test files that interact with `readImage()` or `save()`:

- **`test/clipboard.test.ts`** — Update all `readImage()` assertions to expect `{ data, format }` return shape. Add tests for:
  - Linux reader extracting JPEG (passes `image/jpeg` to xclip/wl-paste)
  - Linux reader extracting WebP
  - macOS osascript extracting JPEG via osascript
  - Fallback reader passes through format from successful reader

- **`test/imageStore.test.ts`** — Update `save()` calls to pass format. Add tests for:
  - Save JPEG → file has `.jpg` extension
  - Save WebP → file has `.webp` extension
  - Save with `unknown` format → defaults to `.png`, skips validation
  - JPEG validation passes/fails correctly
  - BMP validation passes/fails correctly
  - WebP validation passes/fails correctly
  - TIFF validation passes/fails correctly
  - Cleanup includes all image extensions, not just `.png`

- **`test/imageStore.integration.test.ts`** — Update save calls to include format parameter

- **`test/extension.test.ts`** — Update mock `readImage()` to return `{ data, format }` shape

## Execution Strategy

Use **three parallel subagents**:

1. **Subagent A**: Clipboard reader updates (Workstream 1) — modify `types.ts`, `linuxClipboard.ts`, `macosClipboard.ts`, `macosOsascriptClipboard.ts`, `powershellClipboard.ts`, `fallback.ts`

2. **Subagent B**: Storage layer updates (Workstream 2) — modify `imageStore.ts` with format-aware validation, saving, and cleanup

3. **Subagent C**: Extension + test updates (Workstream 3) — modify `extension.ts` and all test files

**Note:** Subagent C depends on the interface changes from A and B. Run A and B in parallel first, then run C after both complete. Alternatively, C can be started in parallel if it works from the spec above rather than needing to read the modified files.

After all three complete, run `npm run compile && npm test` to verify everything works together.

## Verification

1. `npm run compile` — no type errors
2. `npm test` — all tests pass including new format-specific tests
3. Manual verification that `generateFilename()` produces correct extensions
4. Validation logic correctly accepts/rejects each format's magic bytes
