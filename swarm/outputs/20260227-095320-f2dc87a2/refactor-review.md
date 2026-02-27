# Refactoring Review — Iteration 6

## Changes Reviewed
- `src/util/notify.ts` (new) — notification abstraction with level-based suppression
- `src/storage/imageStore.ts` — organizeFolders (flat/daily/monthly) with subdirectory support, recursive cleanup
- `src/extension.ts` — migrated all vscode.window calls to notify module
- `test/notify.test.ts`, `test/extension.test.ts`, `test/imageStore.test.ts`, `test/imageStore.integration.test.ts` — comprehensive test coverage
- `test/__mocks__/vscode.ts` — added notifications config default
- `package.json` — new settings: organizeFolders, notifications

## Refactoring Applied
- None needed. The one opportunity (monthly date formatting duplication in `getSubdirectory`) was already resolved by a previous pipeline stage using `formatDate(now).substring(0, 7)`.

## Reviewed but Declined
- **Cleanup delete-loop extraction**: The flat and recursive cleanup branches share similar delete patterns (~6 lines each) but operate on different data shapes. Extracting a shared helper would add an abstraction for minimal gain.

## Verification
- TypeScript: pre-existing type error in `exec.ts` (unrelated to changes)
- Tests: All 470 tests pass (17 test files)
