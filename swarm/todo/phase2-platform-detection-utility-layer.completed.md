# Phase 2: Platform Detection + Utility Layer

## Goal
Implement the platform detection module and utility functions (exec helpers, logger) that all subsequent phases depend on. These are the foundational building blocks used by clipboard readers, storage, and the extension entry point.

## Dependencies
- Phase 1 (Project Scaffold) — completed

## Tasks

Use subagents in parallel for all three modules since they are completely independent of each other.

### 1. Create `src/platform/detect.ts` — Platform Detection

**Can run in parallel with tasks 2 and 3.**

Implement platform detection with the following exports:

```typescript
interface PlatformInfo {
  os: 'macos' | 'linux' | 'windows';
  isWSL: boolean;
  displayServer: 'x11' | 'wayland' | 'unknown';  // Only relevant on Linux
  powershellPath: string | null;                    // For Windows/WSL
}

function detectPlatform(): PlatformInfo;
```

Detection logic:
- **OS**: Use `process.platform` — `darwin` → `macos`, `win32` → `windows`, `linux` → `linux`
- **WSL detection**: On Linux, check if `/proc/version` contains `microsoft` or `Microsoft` (case-insensitive). Use synchronous `fs.readFileSync` since this runs once at startup.
- **Display server**: On Linux (non-WSL), check `process.env.XDG_SESSION_TYPE` — value `wayland` → `wayland`, value `x11` → `x11`, anything else → `unknown`. On WSL, set to `unknown` (clipboard comes from Windows side).
- **PowerShell path**:
  - On Windows: `powershell.exe` (available in PATH)
  - On WSL: Search for PowerShell at common paths in order:
    1. `/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`
    2. `/mnt/c/Program Files/PowerShell/7/pwsh.exe`
    3. Fall back to just `powershell.exe` (may be in PATH via interop)
  - On macOS/Linux (non-WSL): `null`

Export the `PlatformInfo` type and `detectPlatform` function. Cache the result — platform doesn't change at runtime.

### 2. Create `src/util/exec.ts` — Promisified exec helpers

**Can run in parallel with tasks 1 and 3.**

Implement two exec helper functions:

```typescript
interface ExecResult {
  stdout: string;
  stderr: string;
}

interface ExecBufferResult {
  stdout: Buffer;
  stderr: string;
}

function exec(command: string, args: string[], options?: { timeout?: number; cwd?: string }): Promise<ExecResult>;
function execBuffer(command: string, args: string[], options?: { timeout?: number; cwd?: string }): Promise<ExecBufferResult>;
```

Implementation details:
- Use `child_process.execFile` (NOT `exec` with shell) for security — avoids shell injection
- Default timeout: **10000ms** (10 seconds)
- `exec` — returns stdout/stderr as strings (encoding: `utf-8`)
- `execBuffer` — returns stdout as a `Buffer` (encoding: `buffer`), stderr as string. This is needed for reading binary image data from clipboard tools that write to stdout.
- Both should reject with a descriptive error that includes the command name, exit code, and stderr content
- Do NOT import or use `vscode` in this module — it should be testable without the VS Code runtime

### 3. Create `src/util/logger.ts` — OutputChannel Logger

**Can run in parallel with tasks 1 and 2.**

Implement a logger that wraps VS Code's `OutputChannel`:

```typescript
interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, err?: unknown): void;
  show(): void;
}

function createLogger(name: string): Logger;
```

Implementation details:
- Use `vscode.window.createOutputChannel(name)` internally
- Each log line should be prefixed with a timestamp: `[HH:MM:SS.mmm]`
- `info` — writes `[INFO] message`
- `warn` — writes `[WARN] message`
- `error` — writes `[ERROR] message`. If `err` is provided and is an `Error`, append the stack trace. If it's something else, append `String(err)`.
- `show()` — reveals the output channel to the user (useful for showing errors)
- Export a default logger instance: `createLogger('Terminal Image Paste')` — but also export `createLogger` for testing

### 4. Verify compilation and lint

**Must run AFTER tasks 1-3 are complete.**

- Run `npm run compile` — must succeed with no errors
- Run `npm run lint` — must succeed with no errors
- Fix any issues found

## Verification

- `npm run compile` produces `dist/extension.js` with no errors
- `npm run lint` passes with no errors
- All three files exist:
  - `src/platform/detect.ts`
  - `src/util/exec.ts`
  - `src/util/logger.ts`
- The `detect.ts` module correctly identifies the current platform (this will be WSL2 in the dev environment based on the kernel version `6.6.87.2-microsoft-standard-WSL2`)

## Parallelization Notes

Tasks 1, 2, and 3 are completely independent and should be done using **parallel subagents** (3 subagents). Task 4 must run last after all three modules are written. Since `exec.ts` and `detect.ts` don't import `vscode`, they can potentially be unit-tested standalone — but that's Phase 7's concern.

---

## Completion Notes (Agent 481abbfb, Task 3faa86bd)

All 4 tasks completed successfully:

1. **src/platform/detect.ts** — Platform detection module with OS detection (`process.platform`), WSL detection (reads `/proc/version`), display server detection (`XDG_SESSION_TYPE`), and PowerShell path detection (checks common WSL paths with `fs.existsSync`). Result is cached in a module-level variable. No `vscode` dependency.

2. **src/util/exec.ts** — Two exec helper functions using `child_process.execFile` (no shell injection). `exec()` returns string stdout/stderr, `execBuffer()` returns Buffer stdout for binary clipboard data. Both have 10s default timeout and descriptive error messages with command name, exit code, and stderr. No `vscode` dependency.

3. **src/util/logger.ts** — Logger wrapping VS Code's OutputChannel with `[HH:MM:SS.mmm]` timestamps. Supports `info`, `warn`, `error` (with optional Error stack trace), and `show`. Exports `createLogger` factory and a default `logger` instance.

4. **Compilation & lint verification** — Both `npm run compile` and `npm run lint` pass with zero errors. `dist/extension.js` produced successfully.

### Verification
- `npm run compile` → `dist/extension.js` produced (1144 bytes)
- `npm run lint` → 0 errors, 0 warnings
- All three files exist and are correctly structured
- `detect.ts` and `exec.ts` have no `vscode` imports (testable standalone)
- `logger.ts` uses `vscode.window.createOutputChannel` as required
