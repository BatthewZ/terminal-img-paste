# Refactor: Clipboard Readers — Completed

## Changes Made

### 1. Extracted `PowerShellClipboardReader` base class (NEW)
- `src/clipboard/powershellClipboard.ts` — Abstract base class for PowerShell-based clipboard readers
- Extracts shared PowerShell commands (`hasImage`, `readImage`, `isToolAvailable`) that were duplicated between Windows and WSL readers
- Subclasses customize: `powershellExe`, `requiredTool()`, and `resolveTempPath()`

### 2. Simplified `WindowsClipboardReader`
- Now extends `PowerShellClipboardReader` (was ~50 lines, now ~14 lines)
- `resolveTempPath()` is identity — path is used directly

### 3. Simplified `WslClipboardReader`
- Now extends `PowerShellClipboardReader` (was ~60 lines, now ~24 lines)
- `resolveTempPath()` runs `wslpath -u` for Windows→Linux path conversion

### 4. Fixed type consistency in `LinuxClipboardReader`
- Changed inline `"x11" | "wayland" | "unknown"` type to `PlatformInfo["displayServer"]`
- Ensures type stays in sync with the platform detection module

## Verification
- `tsc --noEmit`: 0 errors
- `npm run lint`: 0 errors
