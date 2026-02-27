# Bug Review — 2026-02-27

## Summary

No bugs found in unstaged changes. All 559 tests pass across 21 test files.

## Changes Reviewed

| File(s) | Change | Verdict |
|---------|--------|---------|
| `vitest.config.ts` | Added `setupFiles: ['test/setup.ts']` | Correct |
| `test/setup.ts` (new) | Global logger mock with `createLogger` + `logger` | Correct — works with `mockReset: true` |
| 10 test files | Removed duplicate inline `vi.mock` for logger | Correct — replaced by setup file |
| `test/logger.test.ts` | Added `vi.unmock` to test real logger | Correct — hoisted, overrides setup mock |
| `test/diagnostics.test.ts`, `test/insertPath.test.ts` | Removed `detectShellType` mock, use `creationOptions.shellPath` | Correct — tests real detection pipeline |
| `test/fallback.test.ts` | Single `.catch()` replaces double-call try/catch | Correct — actually a bug fix (old code called fn twice) |
| `test/integration/platform.integration.test.ts` | `describe.skipIf` replaces imperative if/return | Correct — equivalent logic |

## Bugs Fixed

None — no bugs found.
