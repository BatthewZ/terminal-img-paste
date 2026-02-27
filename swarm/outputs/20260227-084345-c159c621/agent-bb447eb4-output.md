# Agent bb447eb4 — Phase 17: Clipboard Format Detection

## Task Completed Successfully

Implemented clipboard format detection across all platform readers.

## Changes Summary

| File | Change |
|------|--------|
| `src/clipboard/types.ts` | Added `ClipboardFormat` type and `detectFormat()` to interface |
| `src/clipboard/macosClipboard.ts` | `detectFormat()` + broadened `hasImage()` for JPEG/BMP |
| `src/clipboard/linuxClipboard.ts` | `detectFormat()` + broadened `hasImage()` for all `image/*` MIME types |
| `src/clipboard/powershellClipboard.ts` | `detectFormat()` always returns `'png'` (PS re-encodes) |
| `test/clipboard.test.ts` | +30 new tests (228 → 258 total) |

## Verification

- Compile: Clean
- Lint: Clean
- Tests: 258/258 passing
