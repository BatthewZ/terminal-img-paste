# Refactor Review Summary

## Files Reviewed
- `src/platform/detect.ts` — Clean, no issues
- `src/util/logger.ts` — Clean, no issues
- `src/util/exec.ts` — Two refactors applied

## Refactors Applied to `src/util/exec.ts`

### 1. Extracted `exitCode` helper
The exit code extraction logic was duplicated identically in both `exec` and `execBuffer`:
```ts
const code = "code" in error && typeof error.code === "number"
  ? error.code
  : (error as NodeJS.ErrnoException).code ?? "unknown";
```
Extracted into a shared `exitCode(error)` helper at module scope.

### 2. De-duplicated `stderrStr` conversion in `execBuffer`
The Buffer-to-string stderr conversion was computed in both the error and success paths. Moved it before the `if (error)` check so it's computed once.

## Verification
- TypeScript compilation passes (`npx tsc --noEmit` — no errors)
