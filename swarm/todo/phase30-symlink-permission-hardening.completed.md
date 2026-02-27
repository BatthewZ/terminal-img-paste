# Phase 30: Symlink and Permission Hardening

**Priority:** P1 — Important for reliability
**Macro-Phase:** D (Extensibility, Testing & Security)
**Dependencies:** None (independent phase)
**Status:** completed

## Overview

Close security gaps around symlinks, file permissions, and tool path verification. These hardening measures protect against symlink escape attacks, ensure consistent file permissions across all code paths, prevent PowerShell injection via path interpolation, and guard against PATH manipulation attacks on clipboard tools.

## Implementation Tasks

### Task 1: Symlink Escape Detection (`src/storage/imageStore.ts`)

Before saving an image, resolve the image folder path with `fs.realpath()` and verify it still falls within the workspace root. Reject if a symlink escapes the workspace.

- After `ensureFolder()` creates/verifies the image directory, call `fs.promises.realpath()` on the resolved folder path
- Compare the real path against the workspace root using a prefix check (ensure the real path starts with the workspace root path + path separator)
- If the real path escapes the workspace, throw a descriptive error: `"Image folder resolves to a path outside the workspace (possible symlink escape): ${realPath}"`
- Also apply the check to the final saved file path after writing, as an additional defense-in-depth measure
- **Edge case:** On case-insensitive filesystems (Windows/macOS), normalize both paths to lowercase before comparison

### Task 2: Consistent File Permissions Audit

Verify that file permissions (`0o600`) are set consistently across ALL save paths, including format conversion temp files.

- Audit `src/storage/imageStore.ts` — the main `save()` method should already set `mode: 0o600` via `fs.promises.writeFile()` options
- Audit `src/image/convert.ts` — if conversion creates temp files, those temp files must also have `0o600` permissions
- Audit any other code paths that write image data to disk
- If any paths are missing explicit permissions, add them
- Add a utility function `writeSecureFile(path: string, data: Buffer): Promise<void>` in `src/util/fs.ts` (new file) that always writes with `0o600` permissions, and refactor all image-writing code to use it

### Task 3: PowerShell Script Hardening (`src/clipboard/wslClipboard.ts` & `src/clipboard/windowsClipboard.ts`)

Avoid string interpolation for paths in PowerShell commands to prevent injection.

- Review current PowerShell command construction in both WSL and Windows clipboard readers
- Replace any string interpolation of file paths in PowerShell commands with one of:
  - **`-EncodedCommand`** — Base64-encode the entire PowerShell script after constructing it safely
  - **Argument passing** — Pass paths as separate arguments to PowerShell (not inline in the script string)
- Specifically look for patterns like `` `$env:TEMP\\tip-${timestamp}.png` `` where the timestamp or path could contain special characters
- Ensure that paths containing spaces, quotes, backticks, or dollar signs cannot break the PowerShell script

### Task 4: Clipboard Tool Path Verification (`src/clipboard/index.ts` or new `src/util/toolPath.ts`)

Resolve clipboard tool paths to absolute paths at startup and cache them. This prevents PATH manipulation attacks where a malicious directory early in `$PATH` shadows a legitimate tool.

- Create `src/util/toolPath.ts` with:
  ```typescript
  /**
   * Resolves a tool name to its absolute path using `which` (Unix) or `where` (Windows).
   * Caches the result for subsequent calls.
   * Returns undefined if the tool is not found.
   */
  export async function resolveToolPath(toolName: string): Promise<string | undefined>;
  ```
- Use `execFile('which', [toolName])` on Unix, `execFile('where', [toolName])` on Windows
- Cache resolved paths in a module-level `Map<string, string>`
- Update all clipboard readers to use resolved absolute paths when calling clipboard tools (`pngpaste`, `xclip`, `wl-paste`, `powershell.exe`, etc.)
- On tool resolution failure, fall through to the existing behavior (use the bare tool name) and log a warning
- The resolution should happen once during `activate()` or lazily on first use, not on every paste

### Task 5: Tests

**Spawn subagents in parallel** for independent test work:

#### Subagent A: Symlink & Permission Tests (`test/imageStore.test.ts` or new `test/security.test.ts`)
- Test: saving to a normal directory succeeds
- Test: saving when image folder is a symlink pointing outside workspace — throws error
- Test: saving when image folder is a symlink pointing within workspace — succeeds
- Test: `writeSecureFile` always sets `0o600` permissions
- Test: file permissions are `0o600` after save (verify with `fs.stat()`)

#### Subagent B: PowerShell Hardening Tests (`test/clipboard.test.ts`)
- Test: PowerShell commands with paths containing spaces work correctly
- Test: PowerShell commands with paths containing `$`, backticks, and quotes work correctly
- Test: `-EncodedCommand` produces valid base64-encoded scripts
- Test: no raw string interpolation of user-controlled values in PowerShell command strings

#### Subagent C: Tool Path Resolution Tests (`test/toolPath.test.ts`)
- Test: `resolveToolPath('ls')` returns an absolute path (e.g., `/usr/bin/ls`)
- Test: `resolveToolPath('nonexistent-tool-xyz')` returns `undefined`
- Test: resolved paths are cached (second call doesn't invoke `which` again)
- Test: clipboard readers use absolute paths when available

#### Subagent D: Build Verification
- Run `npm run compile` to verify no TypeScript errors
- Run `npm test` to verify all tests pass (including new ones)
- Run `npm run lint` if available

## Implementation Notes

- **Do not break existing behavior** — all changes must be additive. If symlink detection or tool resolution fails, fall back to current behavior with a warning log
- The `writeSecureFile` utility should be a thin wrapper; don't over-abstract
- PowerShell `-EncodedCommand` accepts UTF-16LE base64-encoded scripts — use `Buffer.from(script, 'utf16le').toString('base64')`
- Tool path caching should clear on extension deactivation (or use a `WeakRef`/TTL if that's overkill, just document the caching behavior)
- On Windows (non-WSL), `which` isn't available — use `where` instead
- Symlink check should use `path.resolve()` + `fs.realpath()` combined, not just one

## Verification

1. Build compiles with no errors
2. All existing tests still pass
3. New symlink escape tests pass
4. New PowerShell hardening tests pass
5. New tool path resolution tests pass
6. No regressions in non-security-related functionality

## Completion Notes (Agent 81316d93, Task 11aa3686)

All 5 tasks completed successfully. 419 tests pass across 16 test files, build compiles cleanly.

### What was implemented:

**Task 1 — Symlink escape detection** (`src/storage/imageStore.ts`):
- Added `assertInsideWorkspace()` function using `fs.promises.realpath()` + case-insensitive prefix check
- Applied to both the folder path (after mkdir) and the final file path (defense-in-depth)
- Throws descriptive error on symlink escape

**Task 2 — File permissions audit & writeSecureFile** (`src/util/fs.ts`):
- Created `writeSecureFile(path, data)` utility that always writes with `mode: 0o600`
- Refactored `imageStore.ts` and `convert.ts` to use it

**Task 3 — PowerShell script hardening** (`src/util/powershell.ts`):
- Created `encodePowerShellCommand()` utility (UTF-16LE base64 encoding)
- Migrated all PowerShell invocations in `powershellClipboard.ts`, `wslClipboard.ts`, and `convert.ts` from `-Command` to `-EncodedCommand`
- `isToolAvailable()` still uses `-Command "echo ok"` (safe static string)

**Task 4 — Clipboard tool path verification** (`src/util/toolPath.ts`):
- Created `resolveToolPath()` / `resolveToolPathOrFallback()` with caching
- Uses `which` (Unix) or `where` (Windows) via `child_process.execFile`
- Updated `LinuxClipboardReader`, `MacosClipboardReader`, and `WindowsClipboardReader` to resolve and cache tool paths

**Task 5 — Tests**:
- `test/security.test.ts` — 6 tests: symlink escape (normal save, outside symlink, within-workspace symlink), writeSecureFile permissions, file permission after save
- `test/powershell.test.ts` — 7 tests: UTF-16LE encoding, special characters, spaces, empty/multi-line scripts
- `test/toolPath.test.ts` — 7 tests: resolution, caching, fallback, cache clearing
- Updated `test/clipboard.test.ts` — fixed 9 tests for `-EncodedCommand` change, added toolPath mock
- Updated `test/convert.test.ts` — fixed 2 tests for `-EncodedCommand` change
- Updated `test/imageStore.test.ts` — added `realpath` mock
