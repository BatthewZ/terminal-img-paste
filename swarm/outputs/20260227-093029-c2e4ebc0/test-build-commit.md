# Agent 81316d93 — Phase 30: Symlink & Permission Hardening (Complete)

## Summary

Implemented all 5 tasks from Phase 30 (Symlink and Permission Hardening):

1. **Symlink escape detection** — `assertInsideWorkspace()` in `imageStore.ts` prevents symlink escape attacks
2. **writeSecureFile utility** — All image write paths use consistent `0o600` permissions
3. **PowerShell `-EncodedCommand`** — Eliminated `-Command` for all non-trivial PowerShell scripts
4. **Tool path resolution** — Clipboard tools resolved to absolute paths and cached
5. **Tests** — 20 new tests across 3 new test files, updated 3 existing test files

## Build & Test

- `npm run compile` — passes
- `npm test` — 419 tests pass across 16 test files (0 failures)

## Files Modified

### New files:
- `src/util/fs.ts` — `writeSecureFile()` utility
- `src/util/powershell.ts` — `encodePowerShellCommand()` utility
- `src/util/toolPath.ts` — `resolveToolPath()` / `resolveToolPathOrFallback()` / `clearToolPathCache()`
- `test/security.test.ts` — Symlink escape + permission tests
- `test/powershell.test.ts` — PowerShell encoding tests
- `test/toolPath.test.ts` — Tool path resolution tests

### Modified files:
- `src/storage/imageStore.ts` — symlink detection + writeSecureFile
- `src/image/convert.ts` — writeSecureFile + -EncodedCommand
- `src/clipboard/powershellClipboard.ts` — -EncodedCommand
- `src/clipboard/wslClipboard.ts` — -EncodedCommand
- `src/clipboard/windowsClipboard.ts` — tool path resolution
- `src/clipboard/linuxClipboard.ts` — tool path resolution
- `src/clipboard/macosClipboard.ts` — tool path resolution
- `test/clipboard.test.ts` — toolPath mock + -EncodedCommand assertions
- `test/convert.test.ts` — -EncodedCommand assertions
- `test/imageStore.test.ts` — realpath mock
