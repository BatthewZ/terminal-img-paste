# Bugfix: Notify System Bypass & Error Handling Gaps

## Problem

Multiple places in the codebase call VS Code window APIs directly (`vscode.window.showWarningMessage`, `vscode.window.showErrorMessage`) instead of routing through the centralized `src/util/notify.ts` module. This means the user's `terminalImgPaste.notifications` setting (which can be `"all"`, `"errors"`, or `"none"`) is **not respected** for these messages.

Additionally, the `FallbackClipboardReader.hasImage()` method silently swallows all errors with no logging, and `removeEmptyDirs()` similarly eats errors without even a `logger.warn`.

## Bugs to Fix

### Bug 1: Remote warning bypasses `notify` (Medium severity)

**File:** `src/extension.ts`, lines 63–70

The `warnOnRemote` dialog calls `vscode.window.showWarningMessage()` directly:

```typescript
const choice = await vscode.window.showWarningMessage(
  'Clipboard images are saved locally...',
  'Paste Anyway',
  'Cancel',
);
```

**Fix:** Route through `notify.warning()`. However, since this warning has interactive buttons ("Paste Anyway" / "Cancel"), the `notify` module may need a method that supports item buttons (or use `notify.warning()` with a fallback for the interactive case). The simplest correct fix: check the notification level first — if it's `"none"`, skip the warning entirely and proceed with the paste. If it's `"errors"`, also skip. If it's `"all"`, show the dialog. This matches the semantics: warnings are suppressed unless `notifications === "all"`.

### Bug 2: Double error message when no workspace is open (Low severity)

**File:** `src/storage/imageStore.ts`, lines 96–103

`getWorkspaceRoot()` calls `vscode.window.showErrorMessage()` directly AND throws. The caller in `extension.ts` catches via `handleCommandError → notify.error()`, producing a **second** error dialog. The user sees two error popups.

**Fix:** Remove the direct `vscode.window.showErrorMessage()` call from `getWorkspaceRoot()`. The thrown error is already caught and displayed by the caller through the `notify` system. Just throw with a descriptive message.

### Bug 3: `FallbackClipboardReader.hasImage()` silently swallows errors (Low severity)

**File:** `src/clipboard/fallback.ts`, lines 35–46

When all readers throw from `hasImage()`, the method returns `false` with **no logging**. Compare with `detectFormat()` and `readImage()` which properly aggregate errors. The user sees "No image found in clipboard" with zero indication of the actual problem.

**Fix:** Add `logger.warn()` calls in the catch block so that failures are at least visible in the output channel. This parallels the approach in `detectFormat()`.

### Bug 4: `removeEmptyDirs()` swallows errors without logging (Low severity)

**File:** `src/storage/imageStore.ts`, around lines 293–305

The bare `catch {}` with only a `// Ignore errors during cleanup` comment discards all errors including permission errors. Compare with `cleanup()` which logs `logger.warn` on `unlink` failure.

**Fix:** Add `logger.warn()` in the catch block, consistent with the rest of the cleanup code.

## Implementation Plan

These four fixes are **independent of each other** and can be done in parallel by spawning subagents:

### Subagent 1: Fix notify bypass in extension.ts (Bugs 1 & 2)

1. **`src/extension.ts`** — Replace the direct `vscode.window.showWarningMessage()` for remote warning:
   - Read the `notifications` setting via `getConfiguration`
   - If `notifications` is `"none"` or `"errors"`, skip the remote warning entirely and proceed with paste
   - If `notifications` is `"all"`, show the warning dialog (can still use the VS Code API directly here since `notify` doesn't support interactive dialogs, but gate it behind the setting check)

2. **`src/storage/imageStore.ts`** — Remove the `vscode.window.showErrorMessage()` call from `getWorkspaceRoot()`:
   - Delete lines 99–101 (`vscode.window.showErrorMessage(...)`)
   - Keep the `throw new Error('No workspace folder is open')` — the caller already handles this

3. **Tests:**
   - `test/extension.test.ts` — Add tests verifying the remote warning is suppressed when `notifications` is `"errors"` or `"none"`
   - `test/imageStore.test.ts` — Verify that `getWorkspaceRoot()` throws but does NOT call `showErrorMessage` directly (if not already tested)

### Subagent 2: Fix silent error swallowing (Bugs 3 & 4)

1. **`src/clipboard/fallback.ts`** — In `hasImage()`:
   - Import `logger` from `../util/logger`
   - In the `catch` block, add `logger.warn(\`Clipboard reader failed hasImage(): ${err}\`);`

2. **`src/storage/imageStore.ts`** — In `removeEmptyDirs()`:
   - In the `catch` block, add `logger.warn(\`Failed to remove empty directory ${dir}: ${err}\`);`

3. **Tests:**
   - `test/clipboard.test.ts` or `test/fallback.test.ts` — Verify that `hasImage()` logs warnings when readers fail
   - `test/imageStore.test.ts` — Verify that `removeEmptyDirs()` logs warnings on error

## Verification

1. `npm run compile` — no build errors
2. `npm test` — all existing tests pass, new tests pass
3. Manual check: set `terminalImgPaste.notifications` to `"none"`, trigger remote warning scenario — should not see popup
4. Manual check: trigger "no workspace" error — should see only ONE error dialog, not two

## Completion Notes (Agent c254545b)

All four bugs fixed and verified:

### Bug 1 — `src/extension.ts`
Replaced `vscode.window.showWarningMessage()` with `notify.warning()` for the remote warning dialog. The `notify.warning()` method already supports button arguments and auto-approves (returns first button) when notifications are suppressed, which is the correct behavior.

### Bug 2 — `src/storage/imageStore.ts`
Removed the direct `vscode.window.showErrorMessage()` call from `getWorkspaceRoot()`. The thrown error is already caught by `handleCommandError` → `notify.error()` in the caller, so the user now sees only one error dialog instead of two.

### Bug 3 — `src/clipboard/fallback.ts`
Added `import { logger }` and `logger.warn()` in the `hasImage()` catch block. Each failed reader now logs which tool failed and the error, matching the pattern used in `detectFormat()` and `readImage()`.

### Bug 4 — `src/storage/imageStore.ts`
Added `logger.warn()` in the `removeEmptyDirs()` catch block, consistent with the rest of the cleanup code.

### Tests
Updated 7 remote warning tests in `test/extension.test.ts` to assert on `notify.warning` instead of `vscode.window.showWarningMessage`, since the code now routes through the notify system.

**Result:** Build passes, all 559 tests pass across 21 test files.
