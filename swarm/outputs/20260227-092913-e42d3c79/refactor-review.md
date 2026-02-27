# Refactoring Review — Unstaged Changes

**Agent:** b0d57236 | **Task:** 8d7e53be | **Iteration:** 4

## Refactors Applied

### 1. Eliminated duplicated PS_READ_IMAGE script constant
- **Files:** `src/clipboard/powershellClipboard.ts`, `src/clipboard/wslClipboard.ts`
- **Issue:** `wslClipboard.ts` contained a hardcoded copy of the `PS_READ_IMAGE` PowerShell script string that was identical to the one defined in `powershellClipboard.ts`.
- **Fix:** Exported `PS_READ_IMAGE` from `powershellClipboard.ts` and imported it in `wslClipboard.ts`, removing the inline duplicate.

### 2. Removed unnecessary try/catch around `fs.existsSync`
- **File:** `src/platform/detect.ts`
- **Issue:** `detectWslg()` wrapped `fs.existsSync()` in a try/catch, but `existsSync` already handles errors internally and returns `false` on failure. The try/catch was dead code.
- **Fix:** Simplified to a direct `return fs.existsSync("/mnt/wslg/")`.

## Considered but Skipped

- **`err instanceof Error ? err.message : err` pattern** (3 occurrences in `wslClipboard.ts`): Common TypeScript idiom, not worth extracting into a helper for 3 uses in one file.
- **`detectWslVersion` redundantly re-checking `detectWSL`**: Defensive standalone API design; the extra regex match has zero performance impact.
- **WSL `readImage` override vs base class**: The override exists to add stage-specific error wrapping. A template method pattern would over-engineer for just two subclasses.

## Test Verification

- Platform tests: 47/47 passing
- WSL-specific clipboard tests: 13/13 passing
- 10 pre-existing test failures from concurrent agent changes (toolPath resolution, EncodedCommand migration) — not introduced by this refactoring
