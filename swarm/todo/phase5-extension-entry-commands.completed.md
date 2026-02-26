# Phase 5: Extension Entry Point + Commands

## Summary

Wire up the extension entry point (`src/extension.ts`) to connect all previously-built modules (platform detection, clipboard readers, image storage, terminal insertion) into working VS Code commands. This is the phase that makes the extension actually functional.

## Current State

- `src/extension.ts` is a **stub** — commands show placeholder "not yet implemented" messages
- All dependencies are fully built:
  - `src/platform/detect.ts` — `detectPlatform()` returns `PlatformInfo`
  - `src/clipboard/index.ts` — `createClipboardReader(platform)` returns a `ClipboardReader`
  - `src/clipboard/types.ts` — `ClipboardReader` interface with `requiredTool()`, `isToolAvailable()`, `hasImage()`, `readImage()`
  - `src/storage/imageStore.ts` — `createImageStore()` returns `ImageStore` with `save(buffer)`, `cleanup()`, `ensureGitIgnored()`
  - `src/terminal/insertPath.ts` — `insertPathToTerminal(filePath)` sends path to active terminal
  - `src/util/logger.ts` — `logger` OutputChannel wrapper

## Implementation Tasks

### Task 1: Rewrite `src/extension.ts` — the `activate` function

Replace the stub with real activation logic:

1. **Detect platform** by calling `detectPlatform()` from `src/platform/detect.ts`
2. **Create clipboard reader** by calling `createClipboardReader(platform)` from `src/clipboard/index.ts`
3. **Check tool availability** by calling `reader.isToolAvailable()` — if the required CLI tool is missing, show a warning message with the tool name (from `reader.requiredTool()`) but still register commands (they'll re-check at invocation time)
4. **Create image store** by calling `createImageStore()` from `src/storage/imageStore.ts`
5. **Register the `terminalImgPaste.pasteImage` command** (see Task 2)
6. **Register the `terminalImgPaste.sendPathToTerminal` command** (see Task 3)
7. **Push all disposables** to `context.subscriptions`
8. **Log** activation success via `logger.info()`

### Task 2: Implement `terminalImgPaste.pasteImage` command handler

This is the core command bound to `Ctrl+Alt+V` / `Cmd+Alt+V`. The flow:

```
1. Check reader.hasImage() → if false, show info message "No image found in clipboard" and return
2. Call reader.readImage() → get PNG Buffer
3. Call imageStore.save(buffer) → get saved file path
4. Call insertPathToTerminal(filePath) → send path to active terminal
5. Show brief status bar message confirming paste (e.g. vscode.window.setStatusBarMessage for 3 seconds)
```

Error handling:
- Wrap the entire flow in try/catch
- On error, show `vscode.window.showErrorMessage()` with the error message
- Log the error via `logger.error()`
- Specifically handle the case where `isToolAvailable()` returns false at invocation time — show a warning with install instructions mentioning `reader.requiredTool()`

### Task 3: Implement `terminalImgPaste.sendPathToTerminal` command handler

This handles the explorer context menu "Send Image Path to Terminal" action. It receives a `vscode.Uri` argument:

```
1. Validate that uri is provided and uri.fsPath exists
2. Call insertPathToTerminal(uri.fsPath)
3. Show brief status bar message confirming the path was sent
```

Error handling:
- If no URI provided, show error message
- Wrap in try/catch, show errors via `vscode.window.showErrorMessage()`

### Task 4: Implement `deactivate` function

The `deactivate` function should be minimal — just log that the extension is deactivating. VS Code handles disposable cleanup via `context.subscriptions`.

## Key Design Decisions

- **No newline by default**: `insertPathToTerminal` already reads the `sendNewline` config, so the command handler doesn't need to handle this
- **Tool availability is checked at activation AND at paste time**: Activation check is a warning; paste-time check is a blocking error. This handles the case where a user installs the tool after extension activation.
- **Status bar messages** (3-second duration) instead of information messages for success — less intrusive UX
- **All errors surface as VS Code error messages** — the user should always know what went wrong

## File Changes

Only one file needs to be modified:
- `src/extension.ts` — complete rewrite from the current stub

## Imports Needed in extension.ts

```typescript
import * as vscode from 'vscode';
import { detectPlatform } from './platform/detect';
import { createClipboardReader, ClipboardReader } from './clipboard/index';
import { createImageStore, ImageStore } from './storage/imageStore';
import { insertPathToTerminal } from './terminal/insertPath';
import { logger } from './util/logger';
```

## Verification

1. `npm run compile` — must succeed with no TypeScript errors
2. Manual test: Launch extension dev host → open terminal → copy a screenshot → press `Ctrl+Alt+V` → verify image path appears in terminal and file exists on disk
3. Manual test: Right-click a `.png` in the explorer → "Send Image Path to Terminal" → verify path appears in terminal
4. Verify error cases: no terminal open, no image in clipboard, missing CLI tool

## Notes

This is a single-file change so parallelization via subagents is NOT recommended for the implementation itself. However, the implementer could spawn a subagent to run `npm run compile` to verify the build after writing the code.

## Completion Notes (Agent 1158964a)

Rewrote `src/extension.ts` with full activation and command logic:

- **activate()**: Detects platform, creates clipboard reader and image store, checks tool availability at activation (warning only), registers both commands, pushes disposables to subscriptions, logs activation.
- **pasteImage command**: Checks tool availability (blocking), checks clipboard for image, reads image buffer, saves to image store, inserts path to terminal, shows status bar confirmation. Full try/catch with error messages and logging.
- **sendPathToTerminal command**: Validates URI, inserts fsPath to terminal, shows status bar confirmation. Full try/catch with error messages.
- **deactivate()**: Logs deactivation.

Verification:
- `npm run compile` — passes (esbuild build complete)
- `npx tsc --noEmit` — passes (no TypeScript errors)
- `npm run lint` — passes (no lint errors)
- No test files exist yet in the project
