# Bug Check Output (iteration 8, agent e31c38f3)

## Status

Found and fixed **1 bug** in unstaged changes.

## Bug Fixed

### Unused import in `src/api.ts`

**File:** `src/api.ts:8`
**Severity:** Compile error (TS6133)
**Description:** The `logger` import from `./util/logger` was imported but never used, causing a TypeScript compilation error with `--noEmit`.
**Fix:** Removed the unused `import { logger } from './util/logger';` line.

## Review Summary

The unstaged changes include:

1. **Removed redundant `isToolAvailable()` check from `FallbackClipboardReader.readImage()`** — Correct. The fallback now simply tries each reader's `readImage()` and catches errors, which is cleaner and avoids duplicate availability checks.

2. **Removed redundant `hasImage()` pre-check from `PowerShellClipboardReader.readImage()`** — Correct. The PS_READ_IMAGE script already exits with code 1 when no image is present, so the pre-check was a wasted PowerShell round-trip.

3. **Added empty buffer guard in `imageStore.save()`** — Correct. Provides a clear error before the format-specific validation, especially important for `'unknown'` format which skips magic byte checks.

4. **Added symlink protection in `collectImagesRecursive()`** — Correct. Prevents following symlinks during cleanup, which could lead to deletion of files outside the managed folder.

5. **New `src/api.ts` public API** — Correct after removing the unused import. The API properly delegates to existing reader/store/emitter, and `imageStore.save()` internally calls `cleanup()` and `ensureGitIgnored()`.

6. **New `src/commands/diagnostics.ts`** — Correct. All external calls are wrapped in try/catch, `countImages` properly skips symlinks consistent with the `collectImagesRecursive` fix.

7. **Test updates** — All 534 tests pass. Tests correctly reflect the removed pre-checks (fewer mock expectations for `hasImage`/`isToolAvailable` calls that no longer happen).

## Verification

- All 534 tests pass (20 test files)
- TypeScript compiles cleanly (only pre-existing `exec.ts` type issue remains, not part of this changeset)
