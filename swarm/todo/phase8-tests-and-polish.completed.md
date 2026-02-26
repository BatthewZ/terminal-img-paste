# Phase 8: Tests + Polish (PLAN.md Phase 7)

## Summary

The codebase has zero test files despite `vitest` being listed in devDependencies and `npm test` being configured as `vitest run`. This phase implements unit tests for all testable modules and adds integration tests with mocked dependencies for clipboard readers.

## Problem

- Build report confirmed: "Tests: Skipped — no test files exist yet"
- No `test/` directory exists
- The PLAN.md specifies Phase 7 should include: unit tests for platform detection, image store, gitignore logic; integration tests with mocked `execFile` for clipboard readers
- `vitest` is already a devDependency but no vitest config exists

## Implementation

### Subagent Strategy

Spawn **three parallel subagents** to write tests concurrently, since the test files are independent:

1. **Agent A: Platform + Utility tests**
2. **Agent B: Image store tests**
3. **Agent C: Clipboard reader tests**

After all three complete, a final sequential step verifies everything compiles and passes.

---

### Step 0: Vitest Configuration

Create `vitest.config.ts` at project root:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    mockReset: true,
  },
});
```

Also check if `tsconfig.json` needs updating to include the `test/` directory.

---

### Agent A: `test/platform.test.ts` + `test/exec.test.ts`

**Platform detection tests** (`test/platform.test.ts`):
- Mock `process.platform` and `fs.readFileSync` to test all OS detection branches
- Test WSL detection: mock `/proc/version` containing "Microsoft" vs not
- Test display server detection: mock `process.env.XDG_SESSION_TYPE` for x11, wayland, and unknown
- Test PowerShell path detection: mock `fs.existsSync` for WSL candidates
- **Important**: The `detectPlatform()` function caches results in a module-level `cached` variable. Tests must either:
  - Reset the cache between tests (export a `resetCache()` helper or use `vi.resetModules()`)
  - Or test the internal functions directly

**Exec utility tests** (`test/exec.test.ts`):
- Mock `child_process.execFile` using `vi.mock`
- Test `exec()` resolves with stdout/stderr on success
- Test `exec()` rejects with descriptive error on failure
- Test `execBuffer()` returns raw Buffer for stdout
- Test timeout option is passed through

---

### Agent B: `test/imageStore.test.ts`

**Image store tests** (`test/imageStore.test.ts`):
- Mock `vscode` module (workspace configuration, workspace folders, window)
- Mock `fs.promises` (mkdir, writeFile, readdir, unlink, readFile)
- Test `save()`: creates directory, writes file with timestamp name, returns path
- Test `cleanup()`: deletes oldest files when count exceeds maxImages
- Test `cleanup()`: no-op when count is within limit
- Test `cleanup()`: no-op when maxImages is 0 (disabled)
- Test `ensureGitIgnored()`: creates .gitignore if missing
- Test `ensureGitIgnored()`: appends folder name if not in existing .gitignore
- Test `ensureGitIgnored()`: no-op if folder already in .gitignore
- Test `ensureGitIgnored()`: no-op if autoGitIgnore is false

**vscode mock strategy**: Create `test/__mocks__/vscode.ts` that provides minimal stubs for `vscode.workspace.getConfiguration()`, `vscode.workspace.workspaceFolders`, and `vscode.window` methods. This mock will be shared across all test files.

---

### Agent C: `test/clipboard.test.ts`

**Clipboard reader factory tests** (`test/clipboard.test.ts`):
- Test `createClipboardReader()` returns correct reader type for each platform config:
  - macOS → MacosClipboardReader
  - Linux x11 → LinuxClipboardReader
  - Linux wayland → LinuxClipboardReader
  - Windows → WindowsClipboardReader
  - WSL → WslClipboardReader (WSL takes priority over Linux)

**Individual reader integration tests** (mocked execFile):
- Mock `../util/exec` module
- Test `MacosClipboardReader`:
  - `requiredTool()` returns "pngpaste"
  - `isToolAvailable()` calls `exec('which', ['pngpaste'])` — mock success/failure
  - `hasImage()` calls osascript — mock clipboard info output
  - `readImage()` calls `execBuffer('pngpaste', ['-'])` — mock PNG buffer
- Test `LinuxClipboardReader`:
  - X11 variant: uses xclip commands
  - Wayland variant: uses wl-paste commands
  - `requiredTool()` returns "xclip" or "wl-paste" based on display server
- Test `WindowsClipboardReader`: PowerShell commands
- Test `WslClipboardReader`: PowerShell-from-WSL with wslpath conversion

---

### Step 4 (Sequential): Verify

After all agents complete:
1. Run `npx tsc --noEmit` — must pass
2. Run `npm run lint` — must pass
3. Run `npm test` — all tests must pass
4. Run `npm run compile` — must pass

## Dependencies

- Phases 1–5 must be complete (they are)
- Ideally Phase 6 (remove unimplemented webview) and Phase 7 (fix path quoting) should be done first, but tests can be written against the current code and updated if those phases change things

## File Changes

New files:
- `vitest.config.ts` — vitest configuration
- `test/__mocks__/vscode.ts` — shared vscode module mock
- `test/platform.test.ts` — platform detection unit tests
- `test/exec.test.ts` — exec utility unit tests
- `test/imageStore.test.ts` — image store unit tests
- `test/clipboard.test.ts` — clipboard reader factory + integration tests

Possibly modified:
- `tsconfig.json` — may need to include/exclude test files
- `src/platform/detect.ts` — may need to export a cache reset function for testing

## Verification

- `npm test` passes with all tests green
- `npx tsc --noEmit` passes
- `npm run compile` passes
- `npm run lint` passes

## Completion Notes (Agent b462dbce)

- Created `vitest.config.ts` with vscode module alias
- Created `test/__mocks__/vscode.ts` shared mock
- Created 4 test files: platform.test.ts (29), exec.test.ts (27), imageStore.test.ts (21), clipboard.test.ts (56)
- All 133 tests pass, plus `tsc --noEmit`, `npm run compile`, and `npm run lint` all green
