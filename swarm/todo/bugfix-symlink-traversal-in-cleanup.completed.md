# Bug: collectImagesRecursive follows symlinks during cleanup

## Severity
Moderate (security — potential file deletion outside image folder)

## Description

In `src/storage/imageStore.ts`, the `collectImagesRecursive()` function (line 274) uses `entry.isDirectory()` to decide whether to recurse into subdirectories. However, `isDirectory()` returns `true` for symlinks pointing to directories. If a symlink exists inside the image folder that points to a directory outside the workspace, the recursive cleanup can traverse into it and **delete image files outside the intended folder**.

The `assertInsideWorkspace()` check only guards the save target path, not the files discovered and deleted during cleanup.

## Reproduction scenario

1. User sets `organizeFolders` to `daily` or `monthly` (non-flat mode triggers recursive cleanup)
2. A symlink exists inside the image folder: `terminal-images/link -> /home/user/photos`
3. Paste enough images to trigger cleanup (exceed `maxImages`)
4. `collectImagesRecursive` follows the symlink into `/home/user/photos`
5. Image files in `/home/user/photos` are included in the sorted list and may be **deleted**

## Affected code

- `src/storage/imageStore.ts` lines 274-291: `collectImagesRecursive`
- `src/storage/imageStore.ts` lines 388-411: recursive cleanup in `cleanup()`

## Fix

In `collectImagesRecursive`, skip symlinks:

```typescript
if (entry.isDirectory() && !entry.isSymbolicLink()) {
  results.push(...(await collectImagesRecursive(fullPath)));
}
```

Or alternatively, validate each discovered file path is inside the image folder before including it in cleanup candidates.

## Tests to add

1. Test that symlinks to directories are not followed during recursive image collection
2. Test that cleanup only deletes files within the image folder root

## Dependencies
None

## Completion Notes

**Fixed by agent 7b5aa343 (task 916b30d6)**

### Changes made:

1. **`src/storage/imageStore.ts` line 284**: Added `&& !entry.isSymbolicLink()` check to `collectImagesRecursive` for both directory traversal and file inclusion:
   - Symlinks to directories are no longer recursed into
   - Symlinked image files are no longer included in cleanup candidates

2. **`test/imageStore.test.ts`**:
   - Added `isSymbolicLink: () => false` to all existing mock dirent entries (required since the code now calls this method)
   - Added 2 new unit tests:
     - "does not follow symlinks to directories during recursive cleanup"
     - "does not include symlinked image files in cleanup candidates"

3. **`test/imageStore.integration.test.ts`**:
   - Added 2 new integration tests using real filesystem symlinks:
     - "cleanup does not follow symlinks to directories" — verifies external directory files are not deleted
     - "cleanup does not include symlinked image files" — verifies symlinked files are skipped

All 490 tests pass. Compile succeeds.
