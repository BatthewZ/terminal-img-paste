# Phase 26: Notification and Status Bar Control

Give users fine-grained control over feedback verbosity. Currently, the extension shows warnings, info messages, status bar messages, and error dialogs without any way to suppress them. Power users may want a quieter experience.

## New Configuration Setting

Add `terminalImgPaste.notifications` to `package.json`:

```json
"terminalImgPaste.notifications": {
  "type": "string",
  "enum": ["all", "errors", "none"],
  "default": "all",
  "description": "Control notification verbosity. 'all' shows all messages (status bar, warnings, errors). 'errors' suppresses success and warning messages; only shows errors. 'none' routes all feedback to the output channel only."
}
```

## New Module: `src/util/notify.ts`

Centralize all user-facing notification logic. All messages route through this module, which checks the `notifications` setting before displaying.

```typescript
export type NotificationLevel = 'all' | 'errors' | 'none';

export interface Notifier {
  /** Show a success/info status bar message (suppressed at 'errors' and 'none'). */
  statusBar(message: string, durationMs?: number): void;

  /** Show an informational message popup (suppressed at 'errors' and 'none'). */
  info(message: string): void;

  /** Show a warning message popup (suppressed at 'errors' and 'none'). Returns the button choice or undefined. */
  warning(message: string, ...buttons: string[]): Promise<string | undefined>;

  /** Show an error message popup (suppressed at 'none'). Always logged to output channel. */
  error(message: string): void;
}
```

**Behavior by level:**

| Method | `"all"` | `"errors"` | `"none"` |
|--------|---------|------------|----------|
| `statusBar()` | VS Code status bar | Suppressed (logger.info only) | Suppressed (logger.info only) |
| `info()` | `showInformationMessage` | Suppressed (logger.info only) | Suppressed (logger.info only) |
| `warning()` | `showWarningMessage` | Suppressed (logger.warn only) | Suppressed (logger.warn only) |
| `error()` | `showErrorMessage` | `showErrorMessage` | Suppressed (logger.error only) |

**Important edge case:** The `warning()` method with action buttons (like the remote terminal "Paste Anyway" / "Cancel" dialog) needs special handling. When warnings are suppressed, the function should return the first (affirmative) button automatically so the paste flow continues rather than blocking on user input that will never appear. Alternatively, return `undefined` to cancel — we should choose the safer default (cancel) for remote context, but auto-proceed for tool availability warnings.

After discussion, simplest approach: when `warning()` is suppressed, return `undefined` (effectively "Cancel"). This is the safe default. Users who set `"errors"` or `"none"` can separately disable `warnOnRemote` to avoid the remote warning entirely.

## Implementation Plan

### Subagent 1: Create `src/util/notify.ts` and its tests

1. Create `src/util/notify.ts` with the `Notifier` interface and `createNotifier()` factory.
2. The factory reads `vscode.workspace.getConfiguration('terminalImgPaste').get<NotificationLevel>('notifications', 'all')` on each call to respect runtime setting changes.
3. All methods log to the output channel via `logger` regardless of the notification level — the setting only controls UI visibility.
4. Export a singleton: `export const notify: Notifier = createNotifier();`
5. Create `test/notify.test.ts`:
   - Test `statusBar()` calls `vscode.window.setStatusBarMessage` when level is `"all"`, does not call it at `"errors"` or `"none"`.
   - Test `info()` calls `vscode.window.showInformationMessage` at `"all"`, suppressed at `"errors"` and `"none"`.
   - Test `warning()` calls `vscode.window.showWarningMessage` at `"all"`, returns `undefined` and suppresses at `"errors"` and `"none"`.
   - Test `error()` calls `vscode.window.showErrorMessage` at `"all"` and `"errors"`, suppressed at `"none"`.
   - Test that all methods always call the corresponding `logger.*` method regardless of level.
   - Test default level is `"all"` when setting is missing.

### Subagent 2: Update `package.json` and `src/extension.ts`

1. Add the `terminalImgPaste.notifications` setting to `package.json` `contributes.configuration.properties`.
2. Refactor `src/extension.ts` to import and use `notify` instead of direct `vscode.window.*` calls:

   Current → New mapping:

   | Location | Current Call | Replacement |
   |----------|-------------|-------------|
   | Line 13 (`handleCommandError`) | `vscode.window.showErrorMessage(...)` | `notify.error(...)` |
   | Lines 25-28 (activation tool check) | `vscode.window.showWarningMessage(...)` | `notify.warning(...)` |
   | Lines 43-47 (paste tool check) | `vscode.window.showWarningMessage(...)` | `notify.warning(...)` |
   | Lines 56-60 (remote warning) | `vscode.window.showWarningMessage(..., 'Paste Anyway', 'Cancel')` | `notify.warning(..., 'Paste Anyway', 'Cancel')` — when suppressed, returns `undefined` so paste is cancelled (safe default; user should disable `warnOnRemote` separately) |
   | Line 69 | `vscode.window.showInformationMessage(...)` | `notify.info(...)` |
   | Line 81 | `vscode.window.setStatusBarMessage(...)` | `notify.statusBar(...)` |
   | Lines 95-97 | `vscode.window.showErrorMessage(...)` | `notify.error(...)` |
   | Line 102 | `vscode.window.setStatusBarMessage(...)` | `notify.statusBar(...)` |

3. The `handleCommandError` function should use `notify.error()` instead of `vscode.window.showErrorMessage()`.

### Subagent 3: Update `test/extension.test.ts`

1. Update existing extension tests to mock the `notify` module instead of `vscode.window.*` for notification assertions.
2. Add test cases verifying that the notification setting is respected:
   - With `"all"`: all messages displayed (current behavior).
   - With `"errors"`: success/info/warning messages suppressed, errors still shown.
   - With `"none"`: no UI messages at all, all go to logger.

## Files Modified

- `package.json` — Add `notifications` setting
- `src/util/notify.ts` — **NEW** — Centralized notification module
- `src/extension.ts` — Replace direct `vscode.window.*` calls with `notify.*`
- `test/notify.test.ts` — **NEW** — Tests for the notify module
- `test/extension.test.ts` — Update mocks to use notify module

## Acceptance Criteria

1. `npm run compile` passes with zero errors.
2. `npm run test` passes — all existing tests still green plus new notify tests.
3. `npm run lint` passes.
4. Setting `"terminalImgPaste.notifications": "errors"` suppresses status bar and info messages but still shows error dialogs.
5. Setting `"terminalImgPaste.notifications": "none"` suppresses all UI notifications — everything goes to the output channel only.
6. Default behavior (`"all"`) is identical to current behavior — no regression.

## Completion Notes (Agent 15c96acc, Task 37f8b58b)

**All acceptance criteria met:**

- `npm run compile` — passes
- `npm run test` — 463 tests pass (14 new notify tests + all 449 existing tests green)
- `npm run lint` — passes

**Changes made:**

1. **`package.json`** — Added `terminalImgPaste.notifications` setting with `"all" | "errors" | "none"` enum, default `"all"`.
2. **`src/util/notify.ts`** (NEW) — Created `Notifier` interface and `createNotifier()` factory. Reads notification level on each method call to respect runtime changes. All methods always log via `logger` regardless of level. Exported singleton `notify`.
3. **`src/extension.ts`** — Replaced all 8 direct `vscode.window.show*Message()` and `setStatusBarMessage()` calls with `notify.*` equivalents. Import added for `notify`.
4. **`test/notify.test.ts`** (NEW) — 14 tests covering all 4 methods (`statusBar`, `info`, `warning`, `error`) across all 3 levels (`all`, `errors`, `none`), plus default level test.
5. **`test/extension.test.ts`** — Updated all notification assertions to mock/check `notify.*` instead of `vscode.window.*`. Added `notify` mock at module level.
6. **`test/__mocks__/vscode.ts`** — Added `notifications: 'all'` to config defaults and reset.
