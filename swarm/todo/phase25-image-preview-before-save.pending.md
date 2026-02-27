# Phase 25: Image Preview Before Save

## Overview

Show the user a preview of the clipboard image before saving it, so they can confirm or cancel the paste. This is opt-in (default off) to preserve the fast-path experience.

## Priority

P2 — Nice UX improvement. Last remaining P2 phase after 24, 26, and 27 are complete.

## Dependencies

- Phase 18 (multi-format clipboard reading) — completed
- Phase 5 (extension entry point + commands) — completed

## New Configuration

Add to `package.json` contributions:

```json
"terminalImgPaste.showPreview": {
  "type": "boolean",
  "default": false,
  "description": "Show a preview of the clipboard image before saving. If enabled, a webview panel will display the image with Paste/Cancel buttons."
}
```

## Implementation Plan

### Subagent 1: Core Implementation (src changes)

#### 1. Create `src/views/previewPanel.ts`

New module that shows a lightweight webview panel with the image and Paste/Cancel buttons.

```typescript
interface PreviewResult {
  confirmed: boolean;
}

export async function showImagePreview(
  extensionUri: vscode.Uri,
  imageBuffer: Buffer,
  format: ClipboardFormat,
  timeoutMs?: number
): Promise<PreviewResult>
```

**Behavior:**
- Creates a `vscode.WebviewPanel` (not a sidebar view — a temporary editor-area panel)
- Displays the image as a base64 data URI (`data:image/<format>;base64,...`)
- Shows two buttons: "Paste" and "Cancel"
- Returns `{ confirmed: true }` when the user clicks Paste
- Returns `{ confirmed: false }` when the user clicks Cancel or closes the panel
- Auto-cancels after a configurable timeout (default 10 seconds) to avoid blocking the paste mutex indefinitely
- The panel auto-disposes after the user makes a choice

**Webview HTML structure:**
- Minimal inline HTML/CSS (no external media files needed)
- Image displayed centered with `max-width: 100%; max-height: 80vh` to fit the panel
- Image dimensions and file size shown as metadata text
- Two buttons at the bottom: "Paste" (primary, styled with VS Code theme colors) and "Cancel" (secondary)
- A countdown timer showing remaining seconds before auto-cancel
- Use VS Code's `webview.cspSource` for Content Security Policy
- Use `acquireVsCodeApi()` to post messages back to the extension

**Message protocol:**
- Webview → Extension: `{ type: 'confirm' }` or `{ type: 'cancel' }`
- Extension → Webview: `{ type: 'countdown', seconds: number }` (update timer display)

#### 2. Create `media/preview.css` (optional — can be inline)

Minimal styling using CSS custom properties from VS Code theme:
- `--vscode-button-background`, `--vscode-button-foreground` for the Paste button
- `--vscode-button-secondaryBackground` for Cancel
- Centered layout, responsive image sizing

#### 3. Modify `src/extension.ts`

In the `pasteImage` command handler, after `reader.readImage()` but before `imageStore.save()`:

```typescript
const showPreview = vscode.workspace.getConfiguration('terminalImgPaste').get<boolean>('showPreview', false);

if (showPreview) {
  const result = await showImagePreview(context.extensionUri, imageBuffer, format, 10000);
  if (!result.confirmed) {
    logger.info('Image paste cancelled by user');
    return; // Exit early — don't save or insert path
  }
}
```

**Important considerations:**
- The preview happens inside the mutex lock, so no concurrent pastes can occur while preview is shown
- The 10-second timeout prevents a forgotten preview from permanently blocking the mutex
- If `showPreview` is `false` (default), this code path is completely skipped — zero overhead

#### 4. Update `package.json`

Add the `showPreview` configuration property to the `terminalImgPaste` configuration section.

### Subagent 2: Tests

#### 1. Create `test/previewPanel.test.ts`

Test the `showImagePreview` function with mocked VS Code webview APIs.

**Mock setup:**
- Mock `vscode.window.createWebviewPanel` to return a mock panel object
- The mock panel should have:
  - `webview.html` setter (capture the HTML)
  - `webview.onDidReceiveMessage` (capture the message handler)
  - `onDidDispose` (capture the dispose handler)
  - `dispose()` method
  - `webview.postMessage()` mock

**Test cases (~12 tests):**

1. **Panel creation** — Verify `createWebviewPanel` is called with correct viewType, title, and options
2. **HTML content** — Verify the webview HTML contains the base64-encoded image data URI
3. **HTML content — format** — Verify correct MIME type in data URI (`image/png`, `image/jpeg`, etc.)
4. **Confirm message** — Simulate posting `{ type: 'confirm' }` → function resolves with `{ confirmed: true }`
5. **Cancel message** — Simulate posting `{ type: 'cancel' }` → function resolves with `{ confirmed: false }`
6. **Panel closed** — Simulate dispose callback firing → function resolves with `{ confirmed: false }`
7. **Panel disposed after confirm** — Verify `panel.dispose()` is called after confirm
8. **Panel disposed after cancel** — Verify `panel.dispose()` is called after cancel
9. **Timeout auto-cancel** — With a short timeout (50ms), verify function auto-resolves with `{ confirmed: false }` after timeout
10. **Timeout clears on confirm** — Confirm before timeout → timeout does not fire
11. **Countdown messages** — Verify `postMessage` is called with countdown updates
12. **CSP header present** — Verify the HTML includes a Content-Security-Policy meta tag

#### 2. Add tests to `test/extension.test.ts`

Add tests for the preview integration in the paste command:

1. **Preview enabled + confirmed** — Setting on, user confirms → image is saved and path inserted
2. **Preview enabled + cancelled** — Setting on, user cancels → image is NOT saved, no path inserted
3. **Preview disabled** — Setting off → preview not shown, image saved directly (existing behavior preserved)
4. **Preview timeout** — Setting on, timeout expires → image NOT saved

**Mock approach:** Mock the `showImagePreview` module import to control the return value without needing real webview creation.

## File Summary

| File | Action |
|------|--------|
| `src/views/previewPanel.ts` | Create — webview panel for image preview |
| `src/extension.ts` | Modify — add preview step in paste command |
| `package.json` | Modify — add `showPreview` configuration |
| `test/previewPanel.test.ts` | Create — unit tests for preview panel |
| `test/extension.test.ts` | Modify — add preview integration tests |

## Parallelization Strategy

Use **two subagents** running in parallel:

1. **Implementation subagent**: Creates `previewPanel.ts`, modifies `extension.ts` and `package.json`
2. **Test subagent**: Creates `test/previewPanel.test.ts` and adds tests to `test/extension.test.ts`

The test subagent can work from the interface/contract defined above without needing the implementation to exist first. Both subagents can run concurrently.

After both complete, run `npm run compile && npm test` to verify everything works together.
