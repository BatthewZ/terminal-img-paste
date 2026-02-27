# Bug Review — Agent 60e88598

## Bug Found and Fixed

### Remote terminal paste silently blocked when notifications are suppressed

**Location**: `src/extension.ts:57-64`

**Problem**: The refactoring replaced `vscode.window.showWarningMessage()` with `notify.warning()` for the remote terminal confirmation dialog. When the `notifications` setting is `'errors'` or `'none'`, `notify.warning()` suppresses the dialog and returns `undefined`. The existing check `if (choice !== 'Paste Anyway')` then treats `undefined` as "not Paste Anyway" and silently aborts the paste operation.

This is a regression: users who set `notifications: 'errors'` to reduce popup noise would find that pasting in remote terminals silently fails with no feedback.

**Root Cause**: The remote terminal dialog is a **confirmation prompt** (it gates an operation), not a **notification** (it provides feedback). Confirmation prompts should always be shown regardless of notification verbosity settings.

**Fix**: Changed the remote terminal confirmation back to use `vscode.window.showWarningMessage()` directly, bypassing the notification wrapper. Updated corresponding tests to match.

**Files Changed**:
- `src/extension.ts` — line 57: reverted to `vscode.window.showWarningMessage`
- `test/extension.test.ts` — 6 test cases in "remote terminal awareness" block: reverted mock targets from `notify.warning` to `window.showWarningMessage`

## Verification

- All 471 tests pass
- Type errors in `src/util/exec.ts` are pre-existing and unrelated to the changes
