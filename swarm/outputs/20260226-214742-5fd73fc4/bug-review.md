# Bug Review Results

## Bugs Found and Fixed in `src/clipboard/powershellClipboard.ts`

### Bug 1: Temp file leak in `PS_READ_IMAGE` PowerShell script
- **Line 9**: `GetTempFileName()` creates a 0-byte `.tmp` file AND returns its path. Appending `+ '.png'` created a different filename, so the original `.tmp` file was never cleaned up — leaking one temp file per clipboard read.
- **Fix**: Removed `+ '.png'` suffix. `Image.Save()` already specifies `ImageFormat::Png` explicitly, so the file extension is irrelevant.

### Bug 2: `finally` block could swallow successful read result
- **Lines 57-61**: If `readFile` succeeded but `unlink` threw (e.g., file locked on Windows), the error from `finally` replaced the return value, losing the successfully-read image buffer.
- **Fix**: Changed `await fs.promises.unlink(...)` to fire-and-forget `fs.promises.unlink(...).catch(() => {})` so cleanup errors don't propagate.

## Files Reviewed (no bugs found)
- `src/clipboard/types.ts` — Clean interface definition.
- `src/clipboard/index.ts` — Factory function with exhaustive switch. Correct.
- `src/clipboard/macosClipboard.ts` — Uses pngpaste correctly.
- `src/clipboard/linuxClipboard.ts` — Correctly handles Wayland/X11 branching.
- `src/clipboard/windowsClipboard.ts` — Simple subclass, correct.
- `src/clipboard/wslClipboard.ts` — Uses wslpath correctly, correct.
- `src/util/exec.ts` — Proper error handling, correct buffer handling.
- `src/platform/detect.ts` — Platform detection logic is correct.
