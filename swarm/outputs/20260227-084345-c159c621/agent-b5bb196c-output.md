# Bug Review Results (agent b5bb196c)

## Summary

Reviewed all unstaged changes across clipboard readers, platform detection, fallback chain, and tests.

## Bug Found and Fixed

**`logger.warn()` signature mismatch** (`src/util/logger.ts`)

The `Logger.warn` method only accepted `(message: string)` but was called with 2 arguments at:
- `src/clipboard/powershellClipboard.ts:71` — `logger.warn(..., err)`
- `src/storage/imageStore.ts:122` — `logger.warn(..., err)`

This caused TypeScript compilation to fail (`TS2554: Expected 1 arguments, but got 2`). Pre-existing bug, but `powershellClipboard.ts` is in the set of modified files.

**Fix**: Updated the `Logger` interface and `warn` implementation to accept an optional `err?: unknown` parameter, matching the pattern already used by `Logger.error`.

## Verification

- `npx tsc --noEmit` — passes cleanly (0 errors)
- `npx vitest run` — all 288 tests pass

## Notes on Design Choices (Not Bugs)

- `LinuxClipboardReader.hasImage()` now returns true for any `image/*` MIME type while `readImage()` still reads only `image/png`. This is intentional for format detection; failures are caught by `FallbackClipboardReader`.
- `MacosOsascriptClipboardReader.detectFormat()` always returns "png" — correct because it always reads as `«class PNGf»`.
- `FallbackClipboardReader.detectFormat()` doesn't check `isToolAvailable()` unlike `readImage()` — minor inconsistency but errors are caught by the try/catch.
