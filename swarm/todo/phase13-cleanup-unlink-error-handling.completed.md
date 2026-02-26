# Phase 13: Handle Individual Unlink Failures in Image Cleanup

## Severity: HIGH

## Problem

In `src/storage/imageStore.ts`, the `cleanupOldImages()` function iterates over old PNG files and calls `fs.promises.unlink()` on each. If any single unlink fails (e.g., the file was deleted externally between `readdir` and `unlink`, or a permission issue), the error propagates and stops cleanup for the remaining files.

## Solution

Wrap each `unlink()` call in a try-catch so that a single failure doesn't prevent cleanup of the remaining files. Log warnings for individual failures.

## Implementation

### Task 1: Update `cleanupOldImages()` in `src/storage/imageStore.ts`

Change the unlink loop to catch individual errors:

```typescript
for (const file of toDelete) {
  const filePath = path.join(folder, file);
  try {
    await fs.promises.unlink(filePath);
    logger.info(`Deleted old image: ${filePath}`);
  } catch (err) {
    logger.warn(`Failed to delete old image: ${filePath}`, err);
  }
}
```

### Task 2: Add test coverage

Add a test in `test/imageStore.test.ts` that verifies cleanup continues past a failed unlink (mock one file's unlink to throw, verify others are still deleted).

### Task 3: Rebuild and test

Run `npm run compile` and `npm test`.

## Completion Notes (Agent eeda7d89)

**Completed successfully.**

1. **`src/storage/imageStore.ts`**: Wrapped the `unlink()` call in the cleanup loop with try-catch. Failed deletions now log a warning via `logger.warn()` instead of propagating the error, allowing cleanup to continue for remaining files.

2. **`test/imageStore.test.ts`**: Added 1 test that mocks the second of three unlink calls to fail, then verifies all 3 unlinks were attempted and `logger.warn` was called with the failure.

3. **All 157 tests pass** (28 in imageStore.test.ts).
