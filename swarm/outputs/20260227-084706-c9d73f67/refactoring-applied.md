# Refactoring Review — Agent d9650dea

## Refactorings Applied

### 1. Extracted shared `parseClipboardFormats` (macOS clipboard format detection)

**Files**: `src/clipboard/macosClipboard.ts`, `src/clipboard/macosOsascriptClipboard.ts`

**Problem**: `MacosOsascriptClipboardReader.hasImage()` manually checked the same set of `«class PNGf»`, `«class JPEG»`/`«class JPEf»`, `«class TIFF»`, `«class BMP »`/`«class BMPf»` strings that `parseClipboardFormats()` in `macosClipboard.ts` already handles. Adding a new macOS clipboard format class would require updating two files.

**Fix**: Exported `parseClipboardFormats` from `macosClipboard.ts` and imported it in `macosOsascriptClipboard.ts`, replacing the inline checks with `parseClipboardFormats(info).length > 0`.

### 2. Simplified WSL display server branching in `index.ts`

**File**: `src/clipboard/index.ts`

**Problem**: Two separate branches (`"x11"` / `"wayland"`) both constructed `new LinuxClipboardReader(displayServer)` with the same pattern.

**Fix**: Collapsed into a single condition: `if (platform.displayServer === "x11" || platform.displayServer === "wayland")` with `new LinuxClipboardReader(platform.displayServer)`.

## Verification

- All 288 tests pass (10 test files)
- Pre-existing type errors in `powershellClipboard.ts:71` and `imageStore.ts:122` (logger.warn arity) are unrelated to these changes
