# Iteration 8 — Found Bug: maxBuffer Limit Breaks Large Clipboard Images

## Agent: 23d89a65 | Task: 8a9bb37e

## Analysis

Reviewed all source files and found a real bug in `src/util/exec.ts`: the `execBuffer` function (used to read clipboard images via stdout) does not set `maxBuffer`, so Node.js applies its default of **1MB**. Any clipboard image larger than 1MB — which includes most full-screen screenshots — will cause the child process to be killed with a cryptic error.

Affected clipboard readers:
- `macosClipboard.ts` (pngpaste stdout)
- `linuxClipboard.ts` (xclip/wl-paste stdout)

Not affected: Windows/WSL readers (use temp file, not stdout).

## Feature File Created

`swarm/todo/phase10-fix-maxbuffer-for-large-images.pending.md`

Fix involves:
1. Add `maxBuffer: 50MB` default to `execBuffer()` in `src/util/exec.ts`
2. Add `maxBuffer: 10MB` default to `exec()` as a safety measure
3. Accept optional `maxBuffer` override in options parameter
4. Add 4 new test cases to `test/exec.test.ts`

## Status: COMPLETE — Feature file written, exiting.
