# Bug Review — Unstaged Changes

**Agent:** 5555b1c9 | **Task:** fddabe3e | **Iteration:** 4

## Bug Found and Fixed

### Case-insensitive path comparison on case-sensitive Linux filesystems

- **File:** `src/storage/imageStore.ts` — `assertInsideWorkspace()`
- **Severity:** Medium (security defense-in-depth bypass)
- **Issue:** The function unconditionally lowercased both `realTarget` and `realRoot` before comparing, intending to handle case-insensitive filesystems (Windows/macOS). However, on Linux (where the filesystem is case-sensitive), this allows a path like `/home/user/myproject/images` to pass the workspace containment check when the actual workspace root is `/home/user/MyProject` — these are completely different directories on ext4.
- **Fix:** Only lowercase on `win32` and `darwin` (case-insensitive); preserve exact casing on Linux.
- **Tests:** All 57 imageStore tests pass, plus 165 platform/clipboard tests.

## Other Areas Reviewed (No Bugs)

1. **`src/clipboard/index.ts`** — WSLg-aware fallback chain ordering logic is correct. Native tools preferred when WSLg available, PowerShell preferred otherwise.
2. **`src/clipboard/linuxClipboard.ts`** — Tool path resolution with lazy caching is correct. Minor theoretical TOCTOU on concurrent calls but no incorrect behavior.
3. **`src/clipboard/powershellClipboard.ts`** — `-EncodedCommand` migration is correct. Base `isToolAvailable()` still uses `-Command` for the simple `echo ok` probe, which is fine.
4. **`src/clipboard/windowsClipboard.ts`** — `resolvePs()` only called from `isToolAvailable()`, not from `readImage()`/`hasImage()`. This means bare `powershell.exe` is used if `isToolAvailable()` isn't called first, but that's correct on Windows (always in PATH). Misleading comment but not a bug.
5. **`src/clipboard/wslClipboard.ts`** — Stage-specific error wrapping in `readImage()` override is correct. `resolveTempPath()` error wrapping is correct.
6. **`src/image/convert.ts`** — `-EncodedCommand` with stdin `{ input: data }` is correct — PowerShell reads the script from the encoded argument and stdin is still available to the script.
7. **`src/platform/detect.ts`** — WSL version detection, WSLg detection, and 3-tier PowerShell path discovery are all correct. `whichSync` correctly uses `shell: true` since `command` is a shell builtin.
8. **`src/util/powershell.ts`** — UTF-16LE base64 encoding for `-EncodedCommand` is the correct PowerShell format.
9. **`src/util/toolPath.ts`** — Path resolution with `which`/`where` and caching is correct.
10. **`src/util/fs.ts`** — `writeSecureFile` wrapper is trivially correct.
