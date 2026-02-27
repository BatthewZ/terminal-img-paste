# Phase 32: Drag-and-Drop Support (COMPLETED)

## Completion Notes (Agent 00353b2b)

**All acceptance criteria met.** Implementation completed with:

### Files Created
- `media/dropZone.css` — Theme-aware CSS using VS Code CSS variables, with drag-over/success/error states
- `media/dropZone.js` — HTML5 drag-and-drop frontend with FileReader, MIME validation, size limits, and status feedback
- `src/views/dropZoneProvider.ts` — WebviewViewProvider handling message routing, image validation, format conversion, save, and terminal insertion
- `test/dropZone.test.ts` — 25 tests covering: provider setup, drop handling, MIME validation, size limits, error handling, multiple files, all 6 MIME types

### Files Modified
- `package.json` — Added `viewsContainers` and `views` contributions
- `src/extension.ts` — Registered DropZoneProvider
- `test/extension.test.ts` — Updated subscription count (4→5), added DropZoneProvider mock, extensionUri to context
- `test/__mocks__/vscode.ts` — Added WebviewView mocking support, Uri.joinPath, registerWebviewViewProvider

### Test Results
- `npm run compile` — succeeds
- `npm test` — 559 tests pass (21 test files), including 25 new drop zone tests

---

## Overview

Enable dragging images from the OS file manager, browser, or VS Code explorer into a sidebar drop zone. The dropped image path gets inserted into the active terminal. This resurrects the original sidebar webview concept from Phase 6 (which was removed as unimplemented) and adds the modern VS Code Drop API.

## Why

Currently users can only get images into the terminal via clipboard paste (Ctrl+Alt+V) or explorer context menu. Drag-and-drop is a natural interaction pattern — dragging an image from a browser, file manager, or desktop directly into a VS Code sidebar panel should "just work." This closes a significant UX gap.

## Implementation

### 1. Sidebar WebviewViewProvider (`src/views/dropZoneProvider.ts`)

Create a `WebviewViewProvider` that renders a drop zone panel in the VS Code sidebar.

```typescript
// Key responsibilities:
// - Implements vscode.WebviewViewProvider
// - Renders HTML with drag-and-drop listeners
// - Receives messages from webview: 'files-dropped' (file URIs) and 'image-data-dropped' (base64 data)
// - On file drop: validate it's an image, copy to image folder via ImageStore.save(), insert path to terminal
// - On image data drop (e.g., from browser): decode base64, save via ImageStore, insert path to terminal
// - Show visual feedback for drag-over state
```

**Message protocol from webview → extension:**
- `{ type: 'files-dropped', files: Array<{ name: string, data: string }> }` — base64-encoded file data from `FileReader`
- `{ type: 'image-data-dropped', data: string, mimeType: string }` — raw image data from `DataTransfer` items

**Validation:**
- Only accept image MIME types: `image/png`, `image/jpeg`, `image/gif`, `image/bmp`, `image/webp`, `image/svg+xml`
- Reject non-image files with an error message sent back to the webview
- Size limit: reject files > 50MB with a meaningful error

### 2. Webview HTML/CSS/JS (`media/dropZone.js`, `media/dropZone.css`)

**`media/dropZone.js`:**
- HTML5 `dragover`, `dragleave`, `drop` event listeners on the drop zone element
- On `drop`: iterate `event.dataTransfer.files`, read each via `FileReader.readAsDataURL()`, post to extension
- Also handle `event.dataTransfer.items` for image data (browser-copied images produce `DataTransferItem` with `kind: 'file'`)
- Use `acquireVsCodeApi()` for extension communication
- Show upload state feedback (processing spinner, success checkmark, error message)

**`media/dropZone.css`:**
- Minimal styling using VS Code CSS variables for theme compatibility (`--vscode-editor-background`, `--vscode-editor-foreground`, `--vscode-focusBorder`)
- Default state: dashed border area with "Drop images here" text and an icon
- Drag-over state: highlighted border, background color change
- Success state: brief green flash / checkmark animation
- Error state: brief red flash / error message

### 3. Package.json Contributions

Add webview view container and view registration:

```jsonc
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "terminalImgPaste",
          "title": "Terminal Image Paste",
          "icon": "assets/icon.svg"
        }
      ]
    },
    "views": {
      "terminalImgPaste": [
        {
          "type": "webview",
          "id": "terminalImgPaste.dropZone",
          "name": "Drop Zone"
        }
      ]
    }
  }
}
```

### 4. Extension Integration (`src/extension.ts`)

- Import and instantiate `DropZoneProvider`
- Register the webview view provider in `activate()`:
  ```typescript
  const dropZoneProvider = new DropZoneProvider(imageStore);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('terminalImgPaste.dropZone', dropZoneProvider)
  );
  ```
- The provider needs access to `ImageStore` and `insertPathToTerminal` to complete the save-and-insert flow

### 5. API Integration

- Fire the existing `onImagePasted` event from `api.ts` when an image is dropped (same as clipboard paste)
- Respect the `notifications` setting for success/error messages
- Respect `saveFormat`, `filenamePattern`, `organizeFolders` settings

### 6. Tests (`test/dropZone.test.ts`)

- **Provider registration** — verify `resolveWebviewView` is called with correct options
- **File drop handling** — mock webview message with file data, verify ImageStore.save() called with correct buffer and format
- **Image data drop** — mock webview message with base64 image data, verify save and terminal insert
- **Non-image rejection** — send a non-image MIME type, verify error response posted back to webview
- **Size limit** — send data > 50MB, verify rejection
- **Terminal insert** — verify `insertPathToTerminal` called with saved file path
- **Settings respected** — verify saveFormat conversion applied, organizeFolders used
- **Event fired** — verify `onImagePasted` event emitter fires on successful drop

## Parallelization Strategy

Use subagents for parallel work:

1. **Subagent A** — Create `media/dropZone.js` and `media/dropZone.css` (the webview frontend assets). These are standalone HTML/CSS/JS files with no TypeScript dependencies.

2. **Subagent B** — Create `src/views/dropZoneProvider.ts` (the extension-side WebviewViewProvider). This handles message routing, image validation, and integration with ImageStore.

3. **Subagent C** — Update `package.json` with view container/view contributions, update `src/extension.ts` to register the provider, and update `src/api.ts` if needed for drop event support.

4. **After A+B+C complete** — Create `test/dropZone.test.ts` with comprehensive tests, then run `npm run compile && npm test` to verify.

## Key Files to Read Before Implementing

- `src/extension.ts` — understand activation flow and how to register the provider
- `src/storage/imageStore.ts` — understand the `save()` method signature and format parameter
- `src/terminal/insertPath.ts` — understand how paths are sent to terminal
- `src/views/previewPanel.ts` — reference for how webview panels work in this codebase
- `src/api.ts` — understand the event emitter pattern for `onImagePasted`
- `src/util/notify.ts` — use for user-facing messages
- `package.json` — current contribution points to extend
- `test/previewPanel.test.ts` — reference for testing webview-based features

## Acceptance Criteria

1. `npm run compile` succeeds with no errors
2. `npm test` passes with all existing + new tests
3. VS Code activity bar shows a "Terminal Image Paste" icon
4. Clicking the icon opens a sidebar with a drop zone
5. Dragging an image file into the drop zone saves it and inserts the path into the active terminal
6. Non-image files are rejected with a user-facing error
7. The drop zone respects VS Code themes (light/dark)
8. All existing settings (saveFormat, filenamePattern, organizeFolders, notifications) are respected
