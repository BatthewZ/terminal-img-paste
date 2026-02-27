# Refactoring Review — Agent 322cf9ad

## Changes Applied

### Deduplicated `countImages` in `diagnostics.ts` → reuses `collectImagesRecursive` from `imageStore.ts`

**Problem:** `src/commands/diagnostics.ts` contained a `countImages` function (15 lines) that duplicated the recursive directory traversal logic of `collectImagesRecursive` in `src/storage/imageStore.ts`. Both walked the directory tree, skipped symlinks on directories, and filtered by `IMAGE_EXTENSIONS`. Additionally, the diagnostics version had a subtle inconsistency: it used `entry.isFile()` to filter images but didn't guard against symlinked files, whereas `collectImagesRecursive` correctly checks `!entry.isSymbolicLink()`.

**Fix:**
1. Exported `collectImagesRecursive` from `src/storage/imageStore.ts`
2. Replaced the 15-line `countImages` function in `src/commands/diagnostics.ts` with a one-liner: `return (await collectImagesRecursive(folder)).length`
3. Removed the now-unused `import * as fs from 'fs'` import from diagnostics.ts

**Result:** Eliminates code duplication, fixes the symlink inconsistency in diagnostics image counting, and ensures both cleanup and diagnostics use the exact same traversal logic.

## Verification

- TypeScript type-check: passes (only pre-existing error in `exec.ts`)
- All 534 tests pass across 20 test files
