# Phase 19: Image Format Conversion Option

## Completion Notes (agent f4dc54ab)

All 6 tasks completed successfully. Changes made:

1. **package.json**: Added `terminalImgPaste.saveFormat` setting (`"auto" | "png" | "jpeg"`, default `"auto"`)
2. **src/util/exec.ts**: Extended `execBuffer` with stdin (`input`) support using `child_process.spawn` when `options.input` is provided. Added `input?: Buffer` to `ExecOptions`.
3. **src/image/convert.ts**: New module with `convertImage()` function supporting:
   - macOS: `sips` via temp files
   - Linux: ImageMagick `convert` (stdin/stdout) with `ffmpeg` fallback
   - Windows/WSL: PowerShell `System.Drawing` re-encode
   - Graceful fallback to original format when no tools available or conversion fails
4. **src/extension.ts**: Integrated conversion into paste pipeline between `readImage()` and `imageStore.save()`
5. **test/convert.test.ts**: 19 new tests covering all platforms, fallback chains, error handling, and format correctness
6. **test/extension.test.ts**: Updated pipeline test to verify `convertImage` is called; added mock for `../src/image/convert`
7. **test/__mocks__/vscode.ts**: Added `saveFormat: 'auto'` to config defaults

Verification: `npm run compile` succeeds, `npm test` passes all 366 tests (12 test files).

---

**Priority:** P0 (completes Macro-Phase A: Multi-Format Clipboard Support)
**Dependencies:** Phase 17 (format detection) ✅, Phase 18 (multi-format reading) ✅
**Goal:** Let users force a target format (e.g., always save as PNG regardless of clipboard content). Useful for consistency and for tools that only accept PNG.

---

## Overview

Currently, clipboard images are saved in their native format (PNG, JPEG, BMP, WebP, TIFF). This phase adds:
1. A new setting `terminalImgPaste.saveFormat` (`"auto" | "png" | "jpeg"`, default `"auto"`)
2. A new module `src/image/convert.ts` that uses platform-native tools for image conversion
3. Graceful fallback when conversion tools aren't installed
4. Integration into the paste pipeline in `extension.ts`

---

## Implementation Tasks

### Task 1: Add the `saveFormat` configuration setting

**File:** `package.json`

Add to `contributes.configuration.properties`:
```json
"terminalImgPaste.saveFormat": {
  "type": "string",
  "enum": ["auto", "png", "jpeg"],
  "default": "auto",
  "description": "Image save format. 'auto' preserves native format, 'png' or 'jpeg' forces conversion."
}
```

### Task 2: Create `src/image/convert.ts` — platform-native image conversion

**New file:** `src/image/convert.ts`

This module provides a thin wrapper around platform-native tools for image format conversion.

```typescript
import { PlatformInfo } from '../platform/detect';
import { ClipboardFormat } from '../clipboard/types';
import { execBuffer } from '../util/exec';
import { logger } from '../util/logger';

export type SaveFormat = 'auto' | 'png' | 'jpeg';

export interface ConversionResult {
  data: Buffer;
  format: ClipboardFormat;
}

/**
 * If conversion is needed (saveFormat !== 'auto' and differs from source format),
 * convert using platform-native tools. Returns original data if:
 * - saveFormat is 'auto'
 * - source format already matches target
 * - conversion tool is unavailable (with a warning logged)
 */
export async function convertImage(
  data: Buffer,
  sourceFormat: ClipboardFormat,
  targetFormat: SaveFormat,
  platform: PlatformInfo,
): Promise<ConversionResult> {
  // No conversion needed
  if (targetFormat === 'auto' || sourceFormat === targetFormat) {
    return { data, format: sourceFormat };
  }

  // Map target to MIME type for tool arguments
  const targetMime = targetFormat === 'png' ? 'image/png' : 'image/jpeg';

  try {
    const converted = await convertWithPlatformTool(data, sourceFormat, targetFormat, targetMime, platform);
    return { data: converted, format: targetFormat };
  } catch (err) {
    logger.warn(
      `Image conversion from ${sourceFormat} to ${targetFormat} failed, saving in native format: ${err instanceof Error ? err.message : String(err)}`
    );
    return { data, format: sourceFormat };
  }
}
```

**Platform conversion strategies:**

- **macOS:** Use `sips --setProperty format <png|jpeg> /dev/stdin --out /dev/stdout` — however `sips` doesn't support stdin/stdout well, so instead:
  - Write input buffer to a temp file, run `sips --setProperty format <target> <input> --out <output>`, read output file, clean up temps.
  - Alternative: check if `ffmpeg` is available and prefer it (single-command stdin→stdout conversion).

- **Linux:** Use `convert` (ImageMagick) or `ffmpeg` as fallback:
  - ImageMagick: `convert <input-format>:- <target-format>:-` (reads stdin, writes stdout)
  - ffmpeg: `ffmpeg -hide_banner -loglevel error -f image2pipe -i - -f image2 -c:v <codec> -`
  - Check tool availability with `which convert` or `which ffmpeg`.

- **Windows/WSL (PowerShell):** PowerShell `System.Drawing` re-encode:
  - Load image from bytes, save with target format via `System.Drawing.Imaging.ImageFormat`.
  - This is what the clipboard reader already does, so conversion is straightforward.

**Tool availability detection:**
```typescript
async function findConversionTool(platform: PlatformInfo): Promise<'sips' | 'magick' | 'ffmpeg' | null> {
  if (platform.os === 'macos') {
    // sips is always available on macOS
    return 'sips';
  }
  if (platform.os === 'windows' || platform.isWSL) {
    // PowerShell System.Drawing handles conversion
    return null; // handled separately via PowerShell
  }
  // Linux: try ImageMagick first, then ffmpeg
  try {
    await exec('which', ['convert']);
    return 'magick';
  } catch { /* not found */ }
  try {
    await exec('which', ['ffmpeg']);
    return 'ffmpeg';
  } catch { /* not found */ }
  return null;
}
```

**Implementation details for `convertWithPlatformTool()`:**

For **sips** (macOS):
```typescript
// sips requires files, so use temp files
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const tmpDir = os.tmpdir();
const inputPath = path.join(tmpDir, `tip-convert-in-${Date.now()}.${sourceFormat}`);
const outputPath = path.join(tmpDir, `tip-convert-out-${Date.now()}.${targetFormat === 'jpeg' ? 'jpg' : 'png'}`);

await fs.promises.writeFile(inputPath, data, { mode: 0o600 });
try {
  await exec('sips', ['--setProperty', 'format', targetFormat === 'jpeg' ? 'jpeg' : 'png', inputPath, '--out', outputPath]);
  return await fs.promises.readFile(outputPath);
} finally {
  await fs.promises.unlink(inputPath).catch(() => {});
  await fs.promises.unlink(outputPath).catch(() => {});
}
```

For **ImageMagick** (Linux):
```typescript
// ImageMagick convert reads stdin with format prefix, writes stdout
const inputSpec = `${sourceFormat}:-`;
const outputSpec = `${targetFormat}:-`;
return await execBuffer('convert', [inputSpec, outputSpec], { input: data });
```

For **ffmpeg** (Linux fallback):
```typescript
const codec = targetFormat === 'png' ? 'png' : 'mjpeg';
return await execBuffer('ffmpeg', [
  '-hide_banner', '-loglevel', 'error',
  '-f', 'image2pipe', '-i', '-',
  '-f', 'image2', '-c:v', codec, '-'
], { input: data });
```

For **PowerShell** (Windows/WSL):
```typescript
// PowerShell script to convert via System.Drawing
const formatEnum = targetFormat === 'png' ? 'Png' : 'Jpeg';
const script = `
Add-Type -AssemblyName System.Drawing
$ms = New-Object System.IO.MemoryStream
$input | ForEach-Object { $ms.Write($_, 0, $_.Length) }
$img = [System.Drawing.Image]::FromStream($ms)
$outMs = New-Object System.IO.MemoryStream
$img.Save($outMs, [System.Drawing.Imaging.ImageFormat]::${formatEnum})
[Console]::OpenStandardOutput().Write($outMs.ToArray(), 0, $outMs.Length)
`;
return await execBuffer(platform.powershellPath!, ['-NoProfile', '-Command', script], { input: data });
```

> **Note:** `execBuffer` in `src/util/exec.ts` already supports binary stdout. Verify it also supports passing `input` (stdin data) — if not, extend it.

### Task 3: Check/extend `execBuffer` for stdin support

**File:** `src/util/exec.ts`

Verify that `execBuffer` supports passing input data to stdin. The current signature likely uses `child_process.execFile`. If it doesn't support stdin, extend it:

```typescript
export interface ExecBufferOptions {
  timeout?: number;
  input?: Buffer;  // data to write to child's stdin
}
```

Use `child_process.spawn` instead of `execFile` when `input` is provided, piping data to stdin and collecting stdout as a Buffer.

### Task 4: Integrate conversion into `extension.ts`

**File:** `src/extension.ts`

Modify the `pasteImage` command handler to read the `saveFormat` setting and call `convertImage()` when needed:

```typescript
import { convertImage, SaveFormat } from './image/convert';

// Inside pasteImage handler, after readImage():
const { data, format } = await reader.readImage();

// Check if conversion is needed
const config = vscode.workspace.getConfiguration('terminalImgPaste');
const saveFormat = config.get<SaveFormat>('saveFormat', 'auto');
const converted = await convertImage(data, format, saveFormat, platform);

const filePath = await imageStore.save(converted.data, converted.format);
```

The `platform` variable is already available in the `activate()` scope.

### Task 5: Write tests for `src/image/convert.ts`

**New file:** `test/convert.test.ts`

Tests should use mocked `exec`/`execBuffer` to avoid needing real conversion tools.

**Test cases:**

1. **`saveFormat === 'auto'` returns original data unchanged** — no tool invoked
2. **Source format matches target** — e.g., source is 'png', target is 'png' — no conversion
3. **macOS: `sips` conversion** — mock `exec('sips', ...)` and `fs.readFile` to return converted data; verify correct arguments
4. **Linux: ImageMagick `convert` conversion** — mock `execBuffer('convert', ...)` returning converted PNG buffer; verify correct format specifiers
5. **Linux: ffmpeg fallback** — mock ImageMagick `which` failing, `ffmpeg` `which` succeeding, `execBuffer('ffmpeg', ...)` returning converted data
6. **Graceful fallback when no tool is available** — all tool checks fail; verify original data returned with a warning logged
7. **Graceful fallback on conversion error** — tool exists but conversion throws; verify original data returned with warning
8. **Windows/WSL: PowerShell conversion** — mock PowerShell `execBuffer` call with correct format enum
9. **Unknown source format with target 'png'** — should attempt conversion; if it fails, falls back gracefully
10. **JPEG to PNG conversion produces valid PNG header** — with mocked output, verify the returned format is 'png'

### Task 6: Update existing tests if needed

If `extension.test.ts` tests the paste flow end-to-end, update mocks to account for the new `convertImage` call in the pipeline. Ensure the default `saveFormat: 'auto'` passes through without conversion.

---

## Parallelization Strategy

Use **subagents** for parallel work:

1. **Subagent A:** Tasks 1 + 2 + 3 — Add the setting to `package.json`, create `src/image/convert.ts`, and check/extend `execBuffer` stdin support. These are the core implementation files.

2. **Subagent B:** Task 5 — Write `test/convert.test.ts` in parallel once the interface is defined (the test file only needs to know the function signatures, not the full implementation).

3. **Sequential (after both complete):** Tasks 4 + 6 — Integrate into `extension.ts` and update existing tests. This depends on the convert module existing.

---

## Files to Create
- `src/image/convert.ts`
- `test/convert.test.ts`

## Files to Modify
- `package.json` (add `saveFormat` setting)
- `src/util/exec.ts` (extend `execBuffer` with stdin support if needed)
- `src/extension.ts` (integrate conversion into paste pipeline)
- `test/extension.test.ts` (update mocks for conversion step)

## Verification

1. `npm run compile` — no build errors
2. `npm test` — all tests pass including new convert tests
3. Manual: set `saveFormat: "png"`, copy a JPEG to clipboard → pasted file should be `.png`
4. Manual: set `saveFormat: "auto"` → native format preserved (existing behavior)
5. Manual: uninstall ImageMagick/ffmpeg on Linux, set `saveFormat: "png"`, copy JPEG → falls back to saving as JPEG with a warning
