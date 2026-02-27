# Swarm Agent Output: Feature Selection

**Agent ID:** 9a342832
**Task:** Find improvement or issue and write feature file
**Iteration:** 10 of 10

## What Was Found

A thorough codebase audit revealed that all 32 planned phases are implemented. However, several real bugs were found:

1. **Remote warning bypasses `notify` system** — `src/extension.ts:63` calls `vscode.window.showWarningMessage()` directly instead of respecting the `notifications` setting
2. **Double error message on no workspace** — `src/storage/imageStore.ts:99` calls `showErrorMessage()` directly AND throws, causing the caller to show a second error via `notify.error()`
3. **`FallbackClipboardReader.hasImage()` silently swallows errors** — `src/clipboard/fallback.ts:41` has a bare `catch { continue }` with no logging
4. **`removeEmptyDirs()` swallows errors without logging** — `src/storage/imageStore.ts:301` has `catch {}` with no `logger.warn()`

## Feature File Written

`swarm/todo/bugfix-notify-bypass-and-error-handling.pending.md`

All four fixes are independent and can be parallelized via subagents. The feature file includes specific file locations, code snippets, and a clear implementation plan with test requirements.
