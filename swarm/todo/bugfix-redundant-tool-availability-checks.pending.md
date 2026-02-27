# Bug: Redundant isToolAvailable() subprocess calls on every paste

## Severity
Moderate (performance — unnecessary subprocess spawning)

## Description

`FallbackClipboardReader.readImage()` (`src/clipboard/fallback.ts`, line 62) calls `isToolAvailable()` for each reader before attempting to read. However, `extension.ts` already checks `isToolAvailable()` on line 43 before calling `readImage()`.

For PowerShell-based readers, `isToolAvailable()` spawns a subprocess (`powershell.exe -Command "echo ok"` or similar), which has high startup cost (500ms+). This means every paste operation performs at least one redundant PowerShell invocation.

Additionally, `extension.ts` line 69 calls `reader.hasImage()` before `readImage()`, and `PowerShellClipboardReader.readImage()` internally calls `this.hasImage()` again (line 57), resulting in yet another redundant subprocess call.

## Affected code

- `src/clipboard/fallback.ts` line 62: `isToolAvailable()` check in `readImage()`
- `src/extension.ts` line 43: first `isToolAvailable()` check
- `src/extension.ts` line 69: `hasImage()` check
- `src/clipboard/powershellClipboard.ts` line 57: redundant `hasImage()` in `readImage()`

## Fix options

**Option A (simple):** Cache the `isToolAvailable()` result in each reader after the first call. Since tool availability rarely changes during a session, a simple boolean cache is sufficient.

**Option B (minimal):** Remove the `isToolAvailable()` check from `FallbackClipboardReader.readImage()` since the caller (`extension.ts`) already validates it. Remove the `hasImage()` call from `PowerShellClipboardReader.readImage()` and handle the "no image" case from the script exit code instead.

## Tests to add

1. Verify that `isToolAvailable()` is not called redundantly when `readImage()` is invoked through the fallback reader
2. Verify that removing the precondition `hasImage()` check still produces a clear error when no image is present

## Dependencies
None
