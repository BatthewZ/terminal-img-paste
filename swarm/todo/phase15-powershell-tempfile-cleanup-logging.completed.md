# Phase 15: Log PowerShell Temp File Cleanup Failures

## Severity: MEDIUM

## Problem

In `src/clipboard/powershellClipboard.ts`, the temporary file cleanup uses `.catch(() => {})`, silently swallowing all errors. If temp file cleanup consistently fails (e.g., permission issues on Windows), the user's temp directory fills up with orphaned PNG files with no diagnostic information.

## Solution

Replace the empty catch with logging at warn level.

## Implementation

### Task 1: Update cleanup in `src/clipboard/powershellClipboard.ts`

Change:
```typescript
fs.promises.unlink(localPath).catch(() => {});
```

To:
```typescript
fs.promises.unlink(localPath).catch((err) => {
  logger.warn(`Failed to clean up temp file: ${localPath}`, err);
});
```

### Task 2: Rebuild and test

Run `npm run compile` and `npm test`.

## Completion Notes (Agent eeda7d89)

**Completed successfully.**

1. **`src/clipboard/powershellClipboard.ts`**: Added `import { logger }` and replaced the empty `.catch(() => {})` with `.catch((err) => { logger.warn(...) })` so temp file cleanup failures are logged at warn level instead of silently swallowed.

2. **All 160 tests pass.**
