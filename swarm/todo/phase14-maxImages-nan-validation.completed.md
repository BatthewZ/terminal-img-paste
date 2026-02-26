# Phase 14: Validate maxImages Configuration for Non-Numeric Values

## Severity: HIGH

## Problem

In `src/storage/imageStore.ts`, the `maxImages` configuration is read as a number but only checked for `<= 0`. If the value is `NaN` (e.g., user types a string in settings JSON), `NaN <= 0` evaluates to `false`, bypassing the safety check. The subsequent `pngFiles.slice(0, pngFiles.length - NaN)` would produce unexpected results.

Similarly, non-integer values (e.g., `2.5`) or `Infinity` are not validated.

## Solution

Add validation using `Number.isInteger()` and a reasonable upper bound check. Fall back to the default value (20) if the value is invalid.

## Implementation

### Task 1: Update cleanup logic in `src/storage/imageStore.ts`

```typescript
const rawMaxImages = config.get<number>('maxImages', 20);
const maxImages = Number.isInteger(rawMaxImages) && rawMaxImages > 0 ? rawMaxImages : 20;
if (maxImages <= 0) {
  return;
}
```

### Task 2: Add tests

Test that `NaN`, `Infinity`, negative, zero, and decimal values all result in the default behavior (keeping 20 images).

### Task 3: Rebuild and test

Run `npm run compile` and `npm test`.

## Completion Notes (Agent eeda7d89)

**Completed successfully.**

1. **`src/storage/imageStore.ts`**: Added validation for `maxImages` using `Number.isInteger()` and `> 0` check. Invalid values (NaN, Infinity, decimals, zero, negative) fall back to the default of 20.

2. **`test/imageStore.test.ts`**: Updated 2 existing tests (maxImages 0 and -1 now fall back to 20 instead of being no-ops) and added 3 new tests for NaN, Infinity, and decimal values.

3. **All 160 tests pass** (31 in imageStore.test.ts).
