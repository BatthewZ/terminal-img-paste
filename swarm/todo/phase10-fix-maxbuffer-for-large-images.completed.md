# Phase 10: Fix maxBuffer Limit for Large Clipboard Images

## Problem

`src/util/exec.ts`'s `execBuffer` function does not set a `maxBuffer` option when calling `child_process.execFile`. Node.js defaults to **1MB** (1,048,576 bytes). When a clipboard image exceeds this size, `execFile` kills the child process and throws an error.

This directly affects:
- **`macosClipboard.ts`** — reads image via `pngpaste -` (binary stdout)
- **`linuxClipboard.ts`** — reads image via `xclip -o` or `wl-paste` (binary stdout)

Typical clipboard image sizes:
- 1080p screenshot PNG: **2–5 MB** (exceeds limit)
- 4K screenshot PNG: **10–20 MB** (far exceeds limit)
- Retina/HiDPI screenshot: **5–15 MB** (exceeds limit)

The Windows and WSL clipboard readers are **unaffected** because they save to a temp file instead of piping through stdout.

The user will see a cryptic "Command failed" error with no indication that the image was simply too large.

## Fix

### Task 1: Add `maxBuffer` to `execBuffer` and `exec` in `src/util/exec.ts`

**File:** `src/util/exec.ts`

Add a generous `maxBuffer` default to both functions:

- `execBuffer`: Set `maxBuffer` to `50 * 1024 * 1024` (50 MB) — this handles binary image data and must accommodate large screenshots
- `exec`: Set `maxBuffer` to `10 * 1024 * 1024` (10 MB) — text output from commands like `which`, `osascript`, `xclip --list-types` is small, but a safe buffer prevents edge-case failures

Also accept `maxBuffer` as an optional parameter in the `options` argument so callers can override if needed.

Changes:
```typescript
// In the options type for both functions, add:
maxBuffer?: number;

// In exec():
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024; // 10 MB
// ...
maxBuffer: options?.maxBuffer ?? DEFAULT_MAX_BUFFER,

// In execBuffer():
const DEFAULT_MAX_BUFFER_BINARY = 50 * 1024 * 1024; // 50 MB
// ...
maxBuffer: options?.maxBuffer ?? DEFAULT_MAX_BUFFER_BINARY,
```

### Task 2: Add tests for the maxBuffer behavior in `test/exec.test.ts`

**File:** `test/exec.test.ts`

Add test cases:
1. `exec` passes default maxBuffer of 10MB to execFile
2. `execBuffer` passes default maxBuffer of 50MB to execFile
3. `exec` passes custom maxBuffer when provided in options
4. `execBuffer` passes custom maxBuffer when provided in options

### Task 3: Verify all tests pass and build compiles

Run `npm test` and `npm run compile` to ensure nothing is broken.

## Implementation Notes

- This is a targeted 2-file change (`src/util/exec.ts` + `test/exec.test.ts`)
- No subagents needed — the change is small and focused
- The fix is backwards-compatible: no callers need to change since the default is applied automatically

## Completion Notes (Agent 698f2802)

Implemented exactly as specified:

1. **`src/util/exec.ts`**: Added two constants (`DEFAULT_MAX_BUFFER = 10MB`, `DEFAULT_MAX_BUFFER_BINARY = 50MB`), added `maxBuffer?: number` to the options type for both `exec()` and `execBuffer()`, and wired the defaults into the `execFile` calls with caller override support.

2. **`test/exec.test.ts`**: Added 4 new tests:
   - `exec` uses default maxBuffer of 10MB
   - `exec` passes through custom maxBuffer
   - `execBuffer` uses default maxBuffer of 50MB
   - `execBuffer` passes through custom maxBuffer

3. **Verification**: All 146 tests pass, build compiles successfully.
