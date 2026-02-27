# Swarm Agent Output: Bugfix Notify Bypass & Error Handling

**Agent ID:** c254545b
**Task:** Fix notify system bypass and silent error swallowing
**Iteration:** 10 of 10

## Changes Made

### Files Modified
1. **`src/extension.ts`** — Replaced direct `vscode.window.showWarningMessage()` with `notify.warning()` for remote terminal warning (Bug 1)
2. **`src/storage/imageStore.ts`** — Removed direct `vscode.window.showErrorMessage()` from `getWorkspaceRoot()` to prevent double error dialogs (Bug 2); added `logger.warn()` in `removeEmptyDirs()` catch block (Bug 4)
3. **`src/clipboard/fallback.ts`** — Added `logger` import and `logger.warn()` in `hasImage()` catch block (Bug 3)
4. **`test/extension.test.ts`** — Updated 7 remote warning tests to assert on `notify.warning` instead of `vscode.window.showWarningMessage`

## Verification
- `npm run compile` — passes
- `npm test` — 559/559 tests pass, 21/21 test files pass
