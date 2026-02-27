# Phase 21: Shell-Aware Path Insertion

## Summary

Different shells need different path quoting. The current `insertPath.ts` uses bash-style single-quote escaping (`'path'` with `'\''` for embedded quotes), which breaks in fish, PowerShell, and cmd. This phase detects the active terminal's shell and applies the correct quoting strategy.

## Dependencies

- Phase 20 (Clipboard tool fallback chains) — **completed**

## Priority

P1 — Important for reliability. Wrong quoting causes silent breakage when users have non-bash terminals.

## Current State

- `src/terminal/insertPath.ts` — Always uses `'` + `replace(/'/g, "'\\''")` + `'` (bash/zsh style)
- No shell detection exists anywhere in the codebase
- VS Code provides `terminal.creationOptions.shellPath` which can be inspected

## Implementation

### Task 1: Create `src/terminal/shellDetect.ts` (new module)

**Can be done in parallel with Task 2 (quoting logic design) by separate subagents.**

Detect the active terminal's shell type by inspecting VS Code terminal properties.

```typescript
export type ShellType = 'bash' | 'zsh' | 'fish' | 'powershell' | 'cmd' | 'unknown';

export function detectShellType(terminal: vscode.Terminal): ShellType;
```

**Detection strategy (ordered by reliability):**

1. Check `terminal.creationOptions.shellPath` — most reliable when available. Extract the basename and match:
   - Contains `bash` → `'bash'`
   - Contains `zsh` → `'zsh'`
   - Contains `fish` → `'fish'`
   - Contains `pwsh` or `powershell` → `'powershell'`
   - Contains `cmd` → `'cmd'`
2. Fall back to checking `process.env.SHELL` (the user's default shell) — works when `shellPath` is undefined (which happens when the terminal uses the default shell).
3. On Windows (`process.platform === 'win32'`), default to `'powershell'` if nothing else matched (VS Code defaults to PowerShell on Windows).
4. Otherwise return `'unknown'`.

**Important:** Match case-insensitively and handle paths (e.g., `/usr/bin/fish`, `C:\Windows\System32\cmd.exe`).

### Task 2: Update `src/terminal/insertPath.ts` — shell-aware quoting

**Can be done in parallel with Task 1 by separate subagents, since the quoting functions don't depend on shell detection at compile time.**

Refactor path quoting into a function that branches by shell type:

```typescript
export function quotePath(filePath: string, shell: ShellType): string;
```

**Quoting rules per shell:**

| Shell | Strategy | Example for `/home/it's here/img.png` |
|-------|----------|--------------------------------------|
| `bash` | Single-quote, escape `'` with `'\''` | `'/home/it'\''s here/img.png'` |
| `zsh` | Same as bash (identical quoting rules) | `'/home/it'\''s here/img.png'` |
| `fish` | Single-quote, escape `'` with `\'` | `'/home/it\'s here/img.png'` |
| `powershell` | Double-quote, escape `` ` `` with ``` `` ```, `$` with `` `$ ``, `"` with `` `" `` | `"/home/it's here/img.png"` |
| `cmd` | Double-quote, escape `%` with `%%`, `"` with `""` | `"/home/it's here/img.png"` |
| `unknown` | Fall back to bash-style (current behavior) | `'/home/it'\''s here/img.png'` |

**Update `insertPathToTerminal()`:** Call `detectShellType(terminal)` then `quotePath(filePath, shellType)`.

### Task 3: Tests for `shellDetect.ts`

New file: `test/shellDetect.test.ts`

Test cases (~10 tests):
- `shellPath = '/usr/bin/bash'` → `'bash'`
- `shellPath = '/usr/local/bin/fish'` → `'fish'`
- `shellPath = '/usr/bin/zsh'` → `'zsh'`
- `shellPath = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'` → `'powershell'`
- `shellPath = 'C:\\Windows\\System32\\cmd.exe'` → `'cmd'`
- `shellPath = undefined` with `SHELL=/bin/fish` → `'fish'`
- `shellPath = undefined` with `SHELL` unset on Windows → `'powershell'`
- `shellPath = undefined` with `SHELL` unset on Linux → `'unknown'`
- `shellPath = '/some/custom/shell'` → `'unknown'`
- Case-insensitive: `shellPath = '/usr/bin/Fish'` → `'fish'`

### Task 4: Tests for `quotePath()` in updated `insertPath.test.ts`

Expand existing test file with new describe blocks (~15 tests):

**`quotePath` tests by shell type:**
- bash: simple path, path with spaces, path with single quotes, path with `$` and backticks
- fish: simple path, path with single quotes (verify `\'` not `'\''`)
- powershell: simple path, path with `$variable`, path with backtick, path with double quotes
- cmd: simple path, path with `%VAR%`, path with double quotes
- unknown: falls back to bash quoting

**`insertPathToTerminal` integration tests:**
- Verify it calls `detectShellType` and applies correct quoting for the detected shell
- Existing tests should continue passing (bash is the default/fallback)

### Task 5: Export `quotePath` for testability

Export `quotePath` from `insertPath.ts` so tests can unit-test it directly, independent of the VS Code terminal mock.

## Suggested Parallelization

Use **two subagents** in parallel:

1. **Subagent A:** Implement `src/terminal/shellDetect.ts` + `test/shellDetect.test.ts` (Tasks 1 & 3)
2. **Subagent B:** Implement `quotePath()` function + quoting tests (Tasks 2 & 4)

After both complete, a **final integration step** wires `detectShellType` into `insertPathToTerminal` and verifies existing tests still pass.

## Files Changed

| File | Action |
|------|--------|
| `src/terminal/shellDetect.ts` | **New** — shell type detection |
| `src/terminal/insertPath.ts` | **Modified** — import shellDetect, refactor quoting into `quotePath()`, branch by shell |
| `test/shellDetect.test.ts` | **New** — shell detection tests |
| `test/insertPath.test.ts` | **Modified** — add quotePath tests, add shell-aware integration tests |

## Verification

1. `npm run compile` — no errors
2. `npm test` — all tests pass (existing + new)
3. Manual check: existing bash/zsh quoting behavior unchanged (regression safety)

## Completion Notes (Agent eb2858ec)

**Completed all 5 tasks:**

1. **`src/terminal/shellDetect.ts`** (new) — Detects shell type from `terminal.creationOptions.shellPath`, falls back to `process.env.SHELL`, then Windows platform default. Supports bash, zsh, fish, powershell, cmd. Case-insensitive matching on basename.

2. **`src/terminal/insertPath.ts`** (modified) — Added `quotePath(filePath, shell)` exported function with per-shell quoting:
   - bash/zsh/unknown: single-quote with `'\''` escape
   - fish: single-quote with `\'` escape (also escapes backslashes)
   - powershell: double-quote with `` ` `` escapes for `$`, `` ` ``, and `"`
   - cmd: double-quote with `%%` and `""` escapes
   - `insertPathToTerminal()` now calls `detectShellType()` then `quotePath()`.

3. **`test/shellDetect.test.ts`** (new) — 11 tests covering shellPath detection for all 5 shell types, case insensitivity, SHELL env fallback, Windows default, and unknown fallback.

4. **`test/insertPath.test.ts`** (modified) — 33 tests total: 15 new `quotePath` unit tests (bash/zsh, fish, powershell, cmd, unknown) + 3 new shell-aware integration tests + all original tests preserved and passing.

5. Compile and all 44 new/modified tests pass. 6 pre-existing failures in clipboard.test.ts/extension.test.ts are from Phase 18's in-progress `readImage()` return type change — unrelated to this phase.
