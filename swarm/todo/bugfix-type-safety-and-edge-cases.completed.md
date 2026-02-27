# Bugfix: Type Safety & Edge Case Hardening

## Completion Notes (Agent 7ef0813b)

All 6 bugs fixed and verified:
- **Bug 1 (CRITICAL):** Added explicit type assertion `as ExecOptions & { input: Buffer }` in `src/util/exec.ts:79`
- **Bug 2 (HIGH):** Defaulted to `image/png` MIME type for unknown formats in `src/views/previewPanel.ts:32`
- **Bug 3 (HIGH):** Used bare `-` for auto-detection when `sourceFormat === 'unknown'` in `src/image/convert.ts:139`
- **Bug 4 (MEDIUM):** Fixed TDZ risk by declaring `timer` as `let` before `finish()` in `src/views/previewPanel.ts:16`
- **Bug 5 (MEDIUM):** Added `void` prefix to fire-and-forget `notify.warning()` calls in `src/extension.ts:32,50`
- **Bug 6 (MEDIUM):** Added mutex to `DropZoneProvider` (shared from `pasteMutex`) in `src/views/dropZoneProvider.ts`

**Verification:** `tsc --noEmit` = 0 errors, `vitest run` = 559/559 tests pass, `eslint src/` = 0 errors

## Summary

Several verified bugs and code quality issues that need fixing. The most critical is a **TypeScript compilation error** that causes `tsc --noEmit` to fail, which would block strict CI pipelines.

---

## Bug 1: TypeScript Compilation Error in exec.ts (CRITICAL)

**File:** `src/util/exec.ts`, line 79
**Symptom:** `npx tsc --noEmit` produces:
```
src/util/exec.ts(79,47): error TS2345: Argument of type 'ExecOptions' is not assignable to
parameter of type 'ExecOptions & { input: Buffer<ArrayBufferLike>; }'.
```

**Root cause:** TypeScript's type narrowing from `if (options?.input)` narrows `options` to `ExecOptions` (not undefined) and knows `input` is truthy, but does NOT produce the intersection type `ExecOptions & { input: Buffer }` that `execBufferWithStdin` expects.

**Fix:** Add an explicit type assertion after the guard:
```typescript
if (options?.input) {
  return execBufferWithStdin(command, args, options as ExecOptions & { input: Buffer });
}
```

---

## Bug 2: Invalid MIME Type for Unknown Format in Preview (HIGH)

**File:** `src/views/previewPanel.ts`, line 31
**Symptom:** When `format` is `'unknown'`, the code constructs `image/unknown` as the MIME type, which is invalid. The browser cannot render `data:image/unknown;base64,...`, so the preview shows a broken image.

**Fix:** Default to `image/png` when format is `'unknown'`:
```typescript
const mimeType = format === 'unknown' ? 'image/png' : `image/${format}`;
```

---

## Bug 3: Invalid ImageMagick Format Specifier for Unknown Format (HIGH)

**File:** `src/image/convert.ts`, line 139
**Symptom:** When `sourceFormat` is `'unknown'`, the code constructs `unknown:-` as the ImageMagick input specifier, which is invalid and causes the conversion to fail with a confusing error.

**Fix:** Default to auto-detection (empty format) for unknown:
```typescript
const inputSpec = sourceFormat === 'unknown' ? '-' : `${sourceFormat}:-`;
```
When ImageMagick receives bare `-` it auto-detects the format from the data, which is the correct behavior for unknown formats.

---

## Bug 4: Temporal Dead Zone Risk in previewPanel.ts (MEDIUM)

**File:** `src/views/previewPanel.ts`, lines 19 and 48
**Symptom:** The `finish()` function (line 16) references `timer` via `clearTimeout(timer)` at line 19, but `timer` is declared with `const` at line 48. While this works at runtime because all callbacks are asynchronous, it relies on an implicit timing assumption and is a code smell that could break if VS Code ever delivers synchronous callbacks.

**Fix:** Declare `timer` as `let` before `finish()`:
```typescript
let timer: ReturnType<typeof setTimeout>;
const finish = (value: boolean) => {
  if (resolved) return;
  resolved = true;
  clearTimeout(timer);
  panel.dispose();
  resolve(value);
};
// ... panel setup ...
timer = setTimeout(() => {
  finish(false);
}, TIMEOUT_MS + 500);
```

---

## Bug 5: Unawaited Promises for notify.warning() (MEDIUM)

**File:** `src/extension.ts`, lines 32-35 and 50-53
**Symptom:** `notify.warning()` returns a `Promise<string | undefined>` but these calls are fire-and-forget without `.catch()` handlers. While unlikely to reject (since VS Code's `showWarningMessage` is well-behaved), an unhandled rejection would crash the extension host.

**Fix for line 32-35** (inside `.then()` callback): Add `void` prefix to signal intentional fire-and-forget:
```typescript
void notify.warning(
  `Terminal Image Paste: clipboard tool "${reader.requiredTool()}" not found. ` +
    `Install it to use clipboard image pasting.`,
);
```

**Fix for line 50-53** (inside async command handler): Same treatment — the function returns immediately after, so awaiting is unnecessary but the promise should be explicitly voided:
```typescript
void notify.warning(
  `Terminal Image Paste: "${reader.requiredTool()}" is not installed. ` +
    `Please install it to paste clipboard images.`,
);
```

---

## Bug 6: DropZone Missing Mutex for Concurrent Saves (MEDIUM)

**File:** `src/views/dropZoneProvider.ts` and `src/extension.ts`
**Symptom:** The `pasteImage` command (extension.ts line 41) correctly uses a `Mutex` to serialize clipboard operations. However, the DropZone webview provider processes drop events without any mutex, meaning concurrent drops could trigger simultaneous `imageStore.save()` calls, potentially racing with cleanup operations.

**Fix:** Share the paste mutex with the DropZoneProvider, or create a dedicated mutex inside DropZoneProvider for serializing drop-to-save operations.

---

## Implementation Strategy

**Spawn two parallel subagents:**

1. **Subagent A: Core type & logic fixes** — Fixes bugs 1, 2, 3, and 4 (exec.ts, previewPanel.ts, convert.ts). These are independent file changes with no cross-dependencies.

2. **Subagent B: Extension-level fixes** — Fixes bugs 5 and 6 (extension.ts, dropZoneProvider.ts). These involve the extension wiring and may need coordinated changes between two files.

After both complete, run `npx tsc --noEmit` and `npx vitest run` to verify all fixes.

---

## Verification

1. `npx tsc --noEmit` should produce **zero errors** (currently 1 error)
2. `npx vitest run` should still pass all **559 tests**
3. `npx eslint .` should produce **zero errors**
