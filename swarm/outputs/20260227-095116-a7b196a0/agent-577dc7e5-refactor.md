# Refactoring Review — Agent 577dc7e5

## Changes Applied

### 1. Deduplicated month formatting in `getSubdirectory` (`src/storage/imageStore.ts:265`)
The `monthly` case manually reconstructed `${y}-${mo}` with the same year/month extraction already in `formatDate()`. Replaced with `formatDate(now).substring(0, 7)` to reuse the existing function and eliminate duplicated logic.

### 2. Cleaned up type casts in `save()` and `cleanup()` (`src/storage/imageStore.ts:321,359`)
Both methods used `get<string>('organizeFolders', 'flat') as OrganizeFolders` — an unnecessary cast. Changed to `get<OrganizeFolders>('organizeFolders', 'flat')` which is type-safe and cleaner. The `getSubdirectory` function's `default` switch case already handles any unexpected runtime values.

## Verification
- All 470 tests pass
- Pre-existing type errors in `src/util/exec.ts` are unrelated to these changes
