# Phase 4: Storage + Terminal Insertion

## Overview

Implement the image storage layer (`src/storage/imageStore.ts`) and the terminal path insertion module (`src/terminal/insertPath.ts`). These are the two core modules that bridge clipboard image data to the VS Code terminal.

## Context

- **Phases 1-3 are complete**: project scaffold, platform detection, utility layer, and all clipboard readers are implemented.
- The `ClipboardReader.readImage()` returns a `Buffer` of PNG data — Phase 4 takes that buffer and saves it to disk.
- Configuration settings are already declared in `package.json`: `folderName` (`.tip-images`), `maxImages` (20), `autoGitIgnore` (true), `sendNewline` (false).
- The `Logger` interface is available at `src/util/logger.ts` — use `logger` from there.
- VS Code API types are available via `@types/vscode`.

## Implementation Tasks

These two files can be implemented **in parallel** since they have no dependencies on each other.

---

### Task A: `src/storage/imageStore.ts` — Image Store

Create the image storage module that saves PNG buffers to disk, manages file naming, enforces auto-cleanup, and maintains `.gitignore`.

#### API Surface

```typescript
export interface ImageStore {
  /** Save a PNG buffer to the image folder. Returns the absolute file path. */
  save(imageBuffer: Buffer): Promise<string>;

  /** Delete the oldest images if count exceeds maxImages setting. */
  cleanup(): Promise<void>;

  /** Ensure the image folder is listed in .gitignore (if autoGitIgnore is enabled). */
  ensureGitIgnored(): Promise<void>;
}

export function createImageStore(): ImageStore;
```

#### Requirements

1. **Folder resolution**: Read `terminalImgPaste.folderName` from `vscode.workspace.getConfiguration()`. Resolve it relative to the first workspace folder (`vscode.workspace.workspaceFolders[0].uri.fsPath`). If no workspace folder is open, throw a descriptive error.

2. **File naming**: Use timestamp-based names: `img-YYYY-MM-DDTHH-mm-ss-SSS.png` (e.g., `img-2026-02-26T21-30-45-123.png`). Use hyphens instead of colons for filesystem compatibility.

3. **Save logic**:
   - Ensure the image folder exists (`fs.promises.mkdir` with `{ recursive: true }`).
   - Write the buffer with `fs.promises.writeFile`.
   - After saving, call `cleanup()` and `ensureGitIgnored()`.
   - Log the save operation via `logger.info()`.
   - Return the absolute path to the saved file.

4. **Cleanup logic**:
   - Read `terminalImgPaste.maxImages` from configuration.
   - List all `.png` files in the image folder, sorted by name (oldest first — the timestamp naming makes alphabetical = chronological).
   - If count exceeds `maxImages`, delete the oldest files until count equals `maxImages`.
   - Log each deletion via `logger.info()`.

5. **Git ignore logic**:
   - Read `terminalImgPaste.autoGitIgnore` from configuration. If `false`, return immediately.
   - Look for `.gitignore` in the workspace root.
   - If it doesn't exist, create it with the folder name as its content (plus a trailing newline).
   - If it exists, read it and check if the folder name is already listed (as a whole line). If not, append it (with a preceding newline if the file doesn't end with one, plus trailing newline).
   - Use `fs.promises` for all file operations.

6. **Edge cases**:
   - No workspace folder open → show `vscode.window.showErrorMessage` and throw.
   - Image folder doesn't exist yet → create it.
   - `.gitignore` contains the folder name with leading `/` or as part of a pattern → do simple line-by-line exact match (match trimmed lines against the folder name).

#### Implementation notes

- Use `import * as fs from 'fs'` and `import * as path from 'path'`.
- Use `import * as vscode from 'vscode'`.
- Use `import { logger } from '../util/logger'`.
- Read configuration fresh each time (don't cache) so users can change settings without reloading.

---

### Task B: `src/terminal/insertPath.ts` — Terminal Path Insertion

Create the module that sends a file path to the active VS Code terminal.

#### API Surface

```typescript
/**
 * Send a file path to the active terminal.
 * Quotes the path if it contains spaces.
 * Reads `sendNewline` setting to decide whether to append a newline.
 */
export function insertPathToTerminal(filePath: string): void;
```

#### Requirements

1. **Get the active terminal**: Use `vscode.window.activeTerminal`. If there is no active terminal, show an error message (`vscode.window.showErrorMessage('No active terminal...')`) and return.

2. **Quote the path**: If the path contains spaces, wrap it in double quotes. Otherwise, insert it as-is.

3. **Send the text**: Use `terminal.sendText(path, addNewline)` where `addNewline` is read from `terminalImgPaste.sendNewline` configuration (default `false`). When `false`, the path appears in the terminal input line but the user must press Enter manually — this lets them append context after the path.

4. **Logging**: Log the insertion via `logger.info()`.

#### Implementation notes

- This is a small, focused module — keep it simple.
- Use `import * as vscode from 'vscode'`.
- Use `import { logger } from '../util/logger'`.

---

## Build Verification

After both files are created, run `npm run compile` to verify the project builds with no TypeScript errors. Fix any issues.

## Suggested Agent Strategy

Spawn **two subagents in parallel**:
- **Agent 1**: Implement `src/storage/imageStore.ts` (Task A)
- **Agent 2**: Implement `src/terminal/insertPath.ts` (Task B)

Then a **sequential step**: run `npm run compile` to verify the build succeeds, and fix any type errors.

---

## Completion Notes (Agent 68f0c666, Task 4ac18325)

**Status**: Completed successfully.

### What was implemented:

**Task A — `src/storage/imageStore.ts`**:
- Exported `ImageStore` interface with `save()`, `cleanup()`, and `ensureGitIgnored()` methods.
- Factory function `createImageStore()` returns the implementation.
- `save()`: Creates image folder if needed, writes buffer with timestamp-based filename (`img-YYYY-MM-DDTHH-mm-ss-SSS.png`), then runs cleanup and gitignore maintenance.
- `cleanup()`: Reads `maxImages` config, lists `.png` files sorted alphabetically, deletes oldest when count exceeds limit.
- `ensureGitIgnored()`: Checks `autoGitIgnore` config, creates or appends to `.gitignore` with the folder name using line-by-line exact match.
- Reads configuration fresh on each call (no caching).
- Handles edge cases: no workspace folder (shows error + throws), missing image folder (creates it), missing `.gitignore` (creates it).

**Task B — `src/terminal/insertPath.ts`**:
- Exported `insertPathToTerminal(filePath: string): void` function.
- Gets active terminal, shows error if none exists.
- Quotes path with double quotes if it contains spaces.
- Reads `sendNewline` config to control whether Enter is sent after the path.
- Logs the insertion.

**Build verification**: Both `npm run compile` (esbuild) and `npx tsc --noEmit` (type checker) pass with zero errors.
