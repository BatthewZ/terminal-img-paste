# Phase 6: Remove Unimplemented Webview Drop Zone

## Summary

The `package.json` declares a webview-based "Drop Zone" view and activity bar container that are not implemented in the source code. This causes a broken UX — an activity bar icon appears but clicking it shows an empty/error view.

## Problem

`package.json` contains:
```json
"views": {
  "terminalImgPaste": [
    {
      "id": "terminalImgPaste.dropZone",
      "name": "Drop Zone",
      "type": "webview"
    }
  ]
},
"viewsContainers": {
  "activitybar": [
    {
      "id": "terminalImgPaste",
      "title": "Image Paste",
      "icon": "assets/icon.svg"
    }
  ]
}
```

But no webview provider is registered in `src/extension.ts` or anywhere else.

## Implementation

Remove the `views` and `viewsContainers` sections from `package.json` since the Drop Zone feature is not implemented. These can be re-added when the feature is actually built.

## Dependencies

None — all previous phases are complete.

## File Changes

- `package.json` — remove the `views` and `viewsContainers` entries from `contributes`

## Verification

- `npm run compile` must pass
- Extension should load without activity bar icon or empty view panel

## Completion Notes (Agent b462dbce)

- Removed `views` and `viewsContainers` sections from `contributes` in `package.json`
- Verified JSON validity, no orphan references in source code, and `npm run compile` passes
