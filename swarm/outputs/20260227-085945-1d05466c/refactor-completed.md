# Refactoring Review - Completed

## Changes Applied

### `src/clipboard/linuxClipboard.ts`
1. **Eliminated duplicated format-to-MIME mapping**: Replaced the `formatToMime` switch statement (which manually duplicated the inverse of `MIME_FORMAT_MAP`) with a lookup derived from `MIME_FORMAT_MAP.find()`. This keeps the forward and reverse mappings in sync from a single source of truth.

2. **Removed duplicated return in `readImage`**: Both Wayland and X11 branches constructed the same `{ data: stdout, format: resolvedFormat }` return. Refactored to use a ternary for the exec call and a single return statement, eliminating the duplication.

## What Was Reviewed But Not Changed
- `imageStore.ts`: `validateImage` switch is long but readable; a data-driven approach would be over-engineering
- `imageStore.ts`: `formatToExtension` — clear switch, no duplication to address
- `insertPath.ts`: `quotePath` — each shell case is distinct with appropriate escaping, well-structured
- `shellDetect.ts`: Clean, pattern-driven approach, no issues
- `macosOsascriptClipboard.ts`: `resolvedFormat` logic is slightly indirect but correct and clear enough
- `powershellClipboard.ts`, `macosClipboard.ts`, `fallback.ts`: Minimal changes, no issues

## Verification
- TypeScript compilation: clean (no errors)
- All 347 tests pass
