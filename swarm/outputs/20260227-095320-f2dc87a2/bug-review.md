# Bug Review — Unstaged Changes

## Bug Found and Fixed

### `notify.warning()` silently blocks paste in remote terminals when notifications are suppressed

**Location**: `src/util/notify.ts:42-47`, triggered from `src/extension.ts:57-64`

**Problem**: When the `notifications` setting is `'errors'` or `'none'`, `notify.warning()` returned `undefined` without showing the dialog. The remote terminal warning in `extension.ts` checks `if (choice !== 'Paste Anyway')` — so `undefined` causes the paste to abort silently. Users who suppress warnings could never paste images in remote terminals.

**Fix**: When warnings are suppressed and action buttons are provided, return the first button (auto-approve). This is correct semantics: if the user chose to suppress warnings, confirmation dialogs should not block operations. When no buttons are provided (fire-and-forget warnings), `undefined` is still returned.

**Files changed**:
- `src/util/notify.ts` — return first button when suppressed with buttons
- `test/notify.test.ts` — updated suppression tests to expect auto-approval, added test for no-button case

**Tests**: All 471 tests pass after the fix.

## Other Changes Reviewed (No Bugs Found)

- `package.json` — new `organizeFolders` and `notifications` config entries: correct schema
- `src/storage/imageStore.ts` — `getSubdirectory()`, `collectImagesRecursive()`, `removeEmptyDirs()`, and cleanup logic: correct
- `test/__mocks__/vscode.ts` — config defaults updated: correct
- `test/extension.test.ts` — updated to use `notify` mock: correct
- `test/imageStore.test.ts` — new tests for subdirectory and cleanup: correct
- `test/imageStore.integration.test.ts` — integration tests for organize folders: correct
