# Phase 25: Image Preview Before Save

## Completion Notes (Agent cfa81115)

All 4 tasks implemented and verified:

1. **package.json** — Added `terminalImgPaste.showPreview` boolean setting (default `false`)
2. **src/views/previewPanel.ts** — Created webview preview module with:
   - Base64 data URI image display with dimensions
   - Paste/Cancel buttons
   - 10-second countdown auto-cancel timer
   - Content Security Policy (only allows data: URIs for images)
   - Promise-based API resolving true (paste) or false (cancel/close/timeout)
3. **src/extension.ts** — Integrated preview step between readImage() and save(), inside the mutex lock
4. **test/previewPanel.test.ts** — 11 unit tests for the preview panel
5. **test/extension.test.ts** — 4 integration tests for the preview flow
6. **test/__mocks__/vscode.ts** — Added createWebviewPanel mock with message simulation helpers

Verification: `npm run compile` succeeds, `npm test` passes all 486 tests (18 test files).

## Summary

Show the user a preview of the clipboard image before saving it, so they can confirm or cancel the paste operation. This is opt-in (default `false`) to preserve the fast path for power users.

## Why

Users sometimes paste the wrong image (stale clipboard, accidental copy) and only discover the mistake after the path is already in the terminal. A quick preview step lets them verify before committing the image to disk.

## New Setting

- `terminalImgPaste.showPreview`: `boolean` (default `false`)
  - Add to `package.json` under `contributes.configuration.properties`

## Implementation

### Task 1: Add preview setting to package.json

Add the new `terminalImgPaste.showPreview` boolean setting with default `false` to the configuration contributions.

**File:** `package.json`

### Task 2: Create preview webview module

Create `src/views/previewPanel.ts` — a module that:

1. Accepts a `Buffer` of image data and a format string
2. Creates a temporary webview panel (`vscode.window.createWebviewPanel`) with:
   - Title: "Image Preview — Terminal Image Paste"
   - The image displayed using a base64 data URI (`<img src="data:image/png;base64,...">`)
   - Two buttons: **"Paste"** (confirm) and **"Cancel"**
   - Image dimensions displayed below the preview
3. Returns a `Promise<boolean>` — resolves `true` on "Paste", `false` on "Cancel" or panel close
4. Auto-cancels after 10 seconds with a visible countdown timer to avoid blocking the mutex indefinitely
5. Uses a Content Security Policy that only allows the data URI image source

**Key design decisions:**
- Use `createWebviewPanel` (not QuickPick) since we need to display an actual image
- The webview HTML should be minimal — just the image, dimensions info, two buttons, and a countdown
- Panel appears in the editor area (not sidebar) for visibility
- Panel auto-disposes after resolution

### Task 3: Integrate preview into paste flow

Modify `src/extension.ts` to check the `showPreview` setting in the paste command handler:

```
readImage() → [if showPreview: show preview → if cancelled: return early] → save() → insertPath()
```

- Read the `terminalImgPaste.showPreview` setting via `vscode.workspace.getConfiguration()`
- If enabled, call the preview function with the image buffer
- If the user cancels (or timeout), show a status bar message "Image paste cancelled" and return without saving
- If the user confirms, proceed with save and insert as normal
- The preview step happens **inside** the mutex lock (between read and save) so no race conditions

### Task 4: Write tests

**File:** `test/previewPanel.test.ts`

Tests to write:
- Preview resolves `true` when user clicks "Paste" (simulate webview message)
- Preview resolves `false` when user clicks "Cancel"
- Preview resolves `false` when panel is closed without action
- Preview auto-cancels (resolves `false`) after timeout
- Preview panel disposes itself after resolution
- In extension.ts flow: preview enabled + confirmed → image saved
- In extension.ts flow: preview enabled + cancelled → image NOT saved, status message shown
- In extension.ts flow: preview disabled → image saved immediately (no preview)

**Mocking:** Mock `vscode.window.createWebviewPanel` to return a fake panel object with an `onDidReceiveMessage` event that can be triggered in tests.

## Parallelization

Tasks 1 and 2 can be done in parallel (setting addition and module creation are independent). Task 3 depends on Task 2. Task 4 can begin in parallel with Task 3 for the unit tests of the preview module itself, but the integration tests need Task 3 to be complete.

**Recommended subagent strategy:**
- **Subagent A:** Task 1 (package.json setting) + Task 2 (preview module) — these are independent files
- **Subagent B:** Task 4 unit tests for the preview module (can start once Task 2 is done)
- **Main agent:** Task 3 (integration into extension.ts) + remaining Task 4 integration tests

## Verification

1. `npm run compile` — no errors
2. `npm test` — all tests pass including new preview tests
3. Manual: Enable `showPreview`, copy a screenshot, Ctrl+Alt+V → preview panel appears with image, click Paste → path inserted
4. Manual: Same but click Cancel → nothing saved, status message shown
5. Manual: Same but wait 10s → auto-cancels
6. Manual: With `showPreview: false` (default) → fast path, no preview shown
