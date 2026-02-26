# Phase 3: Clipboard Readers — Completed

## Files Created
- `src/clipboard/types.ts` — ClipboardReader interface
- `src/clipboard/macosClipboard.ts` — macOS reader (pngpaste)
- `src/clipboard/linuxClipboard.ts` — Linux reader (X11 xclip + Wayland wl-paste)
- `src/clipboard/windowsClipboard.ts` — Windows reader (PowerShell)
- `src/clipboard/wslClipboard.ts` — WSL2 reader (PowerShell via interop + wslpath)
- `src/clipboard/index.ts` — Factory function + re-exports

## Usage
```ts
import { createClipboardReader, ClipboardReader } from './clipboard';
import { detectPlatform } from './platform/detect';

const platform = detectPlatform();
const reader = createClipboardReader(platform);

if (await reader.hasImage()) {
  const buffer = await reader.readImage(); // PNG Buffer
}
```

## Status
- `tsc --noEmit`: 0 errors
- `npm run compile`: success
- `npm run lint`: 0 errors
