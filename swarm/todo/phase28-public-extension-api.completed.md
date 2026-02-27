# Phase 28: Public Extension API

## Overview

Expose a programmatic API from the extension's `activate()` return value, allowing other VS Code extensions to programmatically paste clipboard images, send paths to terminals, query the image folder, and react to paste events. This enables ecosystem integration — for example, a chat extension could auto-attach pasted images.

## Priority

P3 — Ecosystem & confidence. Independent of other unimplemented phases.

## Dependencies

- All core phases (1-7) — completed
- Phase 20 (fallback chains) — completed
- Phase 24-27 (UX features) — completed
- No blocking dependencies on other pending work

## New Configuration

None — the API is always available; no settings needed.

## Implementation Plan

### Subagent 1: Core Implementation (src changes)

#### 1. Create `src/api.ts`

New module defining the public API interface and factory.

```typescript
import * as vscode from 'vscode';
import type { ClipboardReader } from './clipboard/types';
import type { ImageStore } from './storage/imageStore';
import type { PlatformInfo } from './platform/detect';

export interface PasteResult {
  /** Absolute path to the saved image file */
  path: string;
  /** Detected or converted format */
  format: string;
}

export interface TerminalImgPasteApi {
  /**
   * Read the clipboard image, save it to the image folder, and return the path.
   * Does NOT insert the path into a terminal — the caller decides what to do with it.
   * Returns undefined if no image is on the clipboard.
   */
  pasteFromClipboard(): Promise<PasteResult | undefined>;

  /**
   * Send a file path to the active terminal.
   * Uses shell-aware quoting based on the active terminal's shell type.
   */
  sendPathToTerminal(filePath: string): void;

  /**
   * Get the absolute path to the image storage folder for the current workspace.
   * Returns undefined if no workspace is open.
   */
  getImageFolder(): string | undefined;

  /**
   * Event fired after every successful image paste (clipboard → file).
   * Consumers can subscribe to react to paste events.
   */
  onImagePasted: vscode.Event<PasteResult>;
}
```

**Factory function:**

```typescript
export function createApi(
  platform: PlatformInfo,
  reader: ClipboardReader,
  imageStore: ImageStore,
  emitter: vscode.EventEmitter<PasteResult>
): TerminalImgPasteApi
```

**Implementation details for each method:**

- **`pasteFromClipboard()`**:
  - Call `reader.hasImage()` — return `undefined` if false
  - Call `reader.detectFormat()` then `reader.readImage()`
  - Check `saveFormat` config — if not `"auto"`, convert via `convertImage()` from `src/image/convert.ts`
  - Call `imageStore.save(buffer, format)` — returns the saved path
  - Call `imageStore.cleanup()` to enforce maxImages
  - Fire `emitter.fire({ path, format })`
  - Return `{ path, format }`
  - Wrap in try/catch — log errors via logger, re-throw so the calling extension sees them

- **`sendPathToTerminal(filePath)`**:
  - Import and call `insertPathToTerminal(filePath)` from `src/terminal/insertPath.ts`
  - Reads `sendNewline` config internally

- **`getImageFolder()`**:
  - Read `folderName` from config
  - Resolve against `vscode.workspace.workspaceFolders?.[0]?.uri.fsPath`
  - Return `undefined` if no workspace open

- **`onImagePasted`**:
  - Simply `emitter.event` — the EventEmitter is owned by `extension.ts` and passed in

#### 2. Modify `src/extension.ts`

**Changes needed** (reference: current extension.ts lines 19-124):

a. **Create EventEmitter** — at the top of `activate()`, after creating platform/reader/imageStore:

```typescript
const pasteEmitter = new vscode.EventEmitter<PasteResult>();
context.subscriptions.push(pasteEmitter);
```

b. **Create and return API** — at the end of `activate()`:

```typescript
import { createApi, type PasteResult } from './api';

// ... existing activate code ...

const api = createApi(platform, reader, imageStore, pasteEmitter);
return api;
```

The `activate()` function currently returns `void` — change it to return `TerminalImgPasteApi`.

c. **Fire the event in pasteImage command** — after successful save in the paste command handler (around line 88-92 where the path is inserted into terminal):

```typescript
pasteEmitter.fire({ path: savedPath, format: finalFormat });
```

This means the event fires for BOTH API-initiated pastes (via `pasteFromClipboard()`) and user-initiated pastes (via Ctrl+Alt+V). The event should NOT fire when paste is cancelled via preview.

d. **Avoid mutex contention** — The `pasteFromClipboard()` API method should NOT acquire the paste mutex (the mutex protects the UI command). API consumers are responsible for their own concurrency. The internal `pasteImage` command handler should still use the mutex.

#### 3. Update `package.json`

No changes needed to `package.json` — the API is returned from `activate()` and doesn't require any manifest contributions. Other extensions access it via:

```typescript
const ext = vscode.extensions.getExtension('your-publisher.terminal-img-paste');
const api = await ext?.activate();
if (api) {
  api.onImagePasted(({ path, format }) => {
    console.log(`Image pasted: ${path} (${format})`);
  });
}
```

### Subagent 2: Tests

#### 1. Create `test/api.test.ts`

Test the `createApi` function and the API object it returns.

**Mock setup:**
- Mock `vscode` module (via existing `test/__mocks__/vscode.ts`)
- Mock `src/clipboard/types.ts` reader — controlled `hasImage()`, `readImage()`, `detectFormat()`
- Mock `src/storage/imageStore.ts` — controlled `save()`, `cleanup()`
- Mock `src/terminal/insertPath.ts` — verify `insertPathToTerminal()` calls
- Mock `src/image/convert.ts` — controlled `convertImage()`
- Create a real `vscode.EventEmitter<PasteResult>` mock for event testing

**Test cases (~18 tests):**

**pasteFromClipboard():**
1. **Returns path and format** — Reader has PNG image → returns `{ path: '/some/path.png', format: 'png' }`
2. **Returns undefined when no image** — `hasImage()` returns false → returns `undefined`
3. **Calls save and cleanup** — Verify `imageStore.save()` and `imageStore.cleanup()` are called
4. **Fires onImagePasted event** — Subscribe to event, paste, verify event fires with correct payload
5. **Does not fire event when no image** — `hasImage()` returns false → event not fired
6. **Format conversion** — `saveFormat` config set to `"png"`, clipboard has JPEG → converts before save
7. **No conversion when auto** — `saveFormat` is `"auto"` → saves in native format
8. **Throws on reader error** — `readImage()` throws → error propagates to caller
9. **Throws on save error** — `imageStore.save()` throws → error propagates to caller

**sendPathToTerminal():**
10. **Calls insertPathToTerminal** — Verify the function is called with the correct path
11. **Handles paths with special characters** — Path with spaces and quotes → passed through correctly

**getImageFolder():**
12. **Returns resolved path** — Workspace open → returns absolute path
13. **Returns undefined without workspace** — No workspace folders → returns `undefined`
14. **Uses folderName config** — Custom `folderName` setting → reflected in returned path

**onImagePasted event:**
15. **Multiple subscribers** — Two subscribers both receive the event
16. **Unsubscribe works** — Subscribe, dispose, paste again → disposed handler not called
17. **Event includes format** — JPEG paste → event has `format: 'jpeg'`

**Integration with extension.ts:**
18. **activate() returns API** — Call activate, verify return value has all API methods

#### 2. Add tests to `test/extension.test.ts`

Add 3 tests for the API integration in the activation flow:

1. **activate returns API object** — Verify `activate()` returns an object with `pasteFromClipboard`, `sendPathToTerminal`, `getImageFolder`, `onImagePasted`
2. **Paste command fires onImagePasted** — Execute the paste command via the registered handler, verify the event fires
3. **EventEmitter disposed on deactivation** — Verify the emitter is pushed to context.subscriptions

**Mock approach:** The existing test infrastructure in `test/extension.test.ts` already mocks all the modules needed. The API tests verify the return value and event wiring.

## File Summary

| File | Action |
|------|--------|
| `src/api.ts` | Create — API interface definition and factory |
| `src/extension.ts` | Modify — create EventEmitter, return API from activate(), fire event on paste |
| `test/api.test.ts` | Create — unit tests for API module |
| `test/extension.test.ts` | Modify — add API integration tests |

## Parallelization Strategy

Use **two subagents** running in parallel:

1. **Implementation subagent**: Creates `src/api.ts`, modifies `src/extension.ts` (EventEmitter creation, API return, event firing in paste handler)
2. **Test subagent**: Creates `test/api.test.ts` and adds API tests to `test/extension.test.ts`

The test subagent can work from the interface/contract defined above without needing the implementation to exist first. Both subagents can run concurrently.

After both complete, run `npm run compile && npm test` to verify everything works together.

## Verification

1. `npm run compile` — no errors
2. `npm test` — all tests pass including new API tests
3. Manual: Write a small test extension that calls `vscode.extensions.getExtension('terminal-img-paste')?.activate()` and logs the API methods
4. Manual: Subscribe to `onImagePasted`, do Ctrl+Alt+V, confirm event fires

## Resolution (Agent 19b21726, Task 0ce55344)

### Implementation

1. **Created `src/api.ts`**: Defines `TerminalImgPasteApi` interface and `createApi()` factory with:
   - `pasteFromClipboard()`: Reads clipboard image, converts, saves, fires event, returns `{ path, format }`
   - `sendPathToTerminal(filePath)`: Delegates to `insertPathToTerminal()`
   - `getImageFolder()`: Resolves workspace folder path from config
   - `onImagePasted`: Event subscription via `vscode.EventEmitter`

2. **Modified `src/extension.ts`**:
   - Changed `activate()` return type from `void` to `TerminalImgPasteApi`
   - Created `EventEmitter<PasteResult>` and pushed to `context.subscriptions` for disposal
   - Fires `pasteEmitter.fire()` after successful paste in the command handler
   - Returns `createApi(...)` at the end of activate

3. **Added `EventEmitter` mock to `test/__mocks__/vscode.ts`**: Full implementation supporting `event`, `fire`, `dispose`

4. **Created `test/api.test.ts`** (17 tests):
   - pasteFromClipboard: success, no image, save/format, event firing, conversion, error propagation
   - sendPathToTerminal: correct delegation, special characters
   - getImageFolder: workspace path, no workspace, custom folderName
   - onImagePasted: multiple subscribers, unsubscribe, format propagation

5. **Updated `test/extension.test.ts`**:
   - Updated subscription count from 3 to 4 (added EventEmitter)
   - Added test verifying activate() returns API object with all methods

### Test Results
- All 534 tests pass across 20 test files
- Compilation: successful
