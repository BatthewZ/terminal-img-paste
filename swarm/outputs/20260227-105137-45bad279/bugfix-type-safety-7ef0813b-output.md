# Bugfix: Type Safety & Edge Case Hardening — Agent 7ef0813b

## Task
Fix 6 verified bugs from `swarm/todo/bugfix-type-safety-and-edge-cases.pending.md`.

## Fixes Applied

1. **Bug 1 (CRITICAL): TypeScript compilation error** — `src/util/exec.ts:79`
   - Added explicit type assertion `as ExecOptions & { input: Buffer }` to satisfy `execBufferWithStdin` parameter type.

2. **Bug 2 (HIGH): Invalid MIME type** — `src/views/previewPanel.ts:32`
   - Changed `image/${format}` to default to `image/png` when format is `'unknown'`.

3. **Bug 3 (HIGH): Invalid ImageMagick specifier** — `src/image/convert.ts:139`
   - Changed `${sourceFormat}:-` to use bare `-` (auto-detect) when sourceFormat is `'unknown'`.

4. **Bug 4 (MEDIUM): Temporal dead zone risk** — `src/views/previewPanel.ts:16`
   - Declared `timer` as `let` with `undefined` initial value before `finish()` closure, then assigned via `timer = setTimeout(...)`.

5. **Bug 5 (MEDIUM): Unawaited promises** — `src/extension.ts:32,50`
   - Added `void` prefix to fire-and-forget `notify.warning()` calls.

6. **Bug 6 (MEDIUM): DropZone missing mutex** — `src/views/dropZoneProvider.ts`, `src/extension.ts`
   - Added `Mutex` to `DropZoneProvider` constructor (shared from `pasteMutex`). Wrapped `_handleMessage` with mutex acquire/release.

## Verification

- `npx tsc --noEmit`: **0 errors** (was 1 error)
- `npx vitest run`: **559/559 tests passed**
- `npx eslint src/`: **0 errors**

## Status
SUCCESS — All 6 bugs fixed, all checks pass.
