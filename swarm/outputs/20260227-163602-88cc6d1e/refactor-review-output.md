# Refactor Review — 2026-02-27

## Summary

No additional refactoring needed. The unstaged changes are already clean refactoring work.

## What the changes do

1. **Centralized logger mock** — Removed 10+ duplicate `vi.mock('../src/util/logger', ...)` blocks from test files, replaced with a single global `test/setup.ts` setup file.
2. **Removed stale `detectShellType` mock** — Shell detection now uses `creationOptions.shellPath` directly; removed the separate mock import and calls.
3. **Cleaner error assertion pattern** — `fallback.test.ts` replaced double-call try/catch with single `.catch((e: unknown) => e)`.
4. **Idiomatic `describe.skipIf`** — `platform.integration.test.ts` replaced imperative if/else with vitest's built-in conditional grouping.

## Test results

All 559 tests pass across 21 test files.

## Refactoring applied

None — changes were already well-structured.
