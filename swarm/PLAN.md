# Plan: Terminal Image Paste — VS Code Extension

## Context

There's no easy way to paste clipboard images (screenshots, copied images) into a VS Code terminal. VS Code's clipboard API is text-only, and there's no terminal drop API for image data. This extension bridges that gap: it reads image data from the clipboard using platform-native tools, saves it to disk, and inserts the file path into the active terminal. This makes it trivial to feed images to CLI tools like Claude Code, which accept file paths.

## Architecture

**Core mechanism:** Clipboard image → save to file → `terminal.sendText(path)`.

**Zero runtime dependencies.** All clipboard access uses platform-native CLI tools via `child_process.execFile`. The extension itself is pure TypeScript + VS Code API.

### Platform Strategy

| Platform | Clipboard Tool | Install |
|----------|---------------|---------|
| macOS | `pngpaste` | `brew install pngpaste` |
| Linux (X11) | `xclip` | `sudo apt install xclip` |
| Linux (Wayland) | `wl-paste` | `sudo apt install wl-clipboard` |
| Windows | PowerShell (built-in) | — |
| WSL2 | PowerShell via `/mnt/c/...` | — |

WSL2 is the trickiest: the clipboard lives on the Windows side, so we invoke `powershell.exe` from WSL, save to a Windows temp path, then convert with `wslpath -u`.

### Features

1. **Ctrl+Alt+V** (Cmd+Alt+V on mac) — paste clipboard image into terminal
2. **Explorer context menu** — right-click any image file → "Send Image Path to Terminal"
3. **Sidebar drop zone** — webview panel where users can drag images from browser/OS; path gets sent to active terminal
4. **Auto-cleanup** — oldest images pruned when count exceeds configurable max (default 20)
5. **Auto .gitignore** — image folder automatically added to `.gitignore`

## Project Structure

```
terminal-img-paste/
├── .vscode/
│   ├── launch.json
│   └── tasks.json
├── assets/
│   └── icon.svg
├── media/
│   ├── dropZone.css
│   └── dropZone.js
├── src/
│   ├── extension.ts              # activate/deactivate, wires everything
│   ├── clipboard/
│   │   ├── types.ts              # ClipboardReader interface
│   │   ├── index.ts              # Platform dispatcher
│   │   ├── macosClipboard.ts     # pngpaste
│   │   ├── linuxClipboard.ts     # xclip / wl-paste
│   │   ├── windowsClipboard.ts   # PowerShell
│   │   └── wslClipboard.ts       # PowerShell from WSL
│   ├── platform/
│   │   └── detect.ts             # OS/WSL/Wayland detection
│   ├── storage/
│   │   └── imageStore.ts         # Save, name, cleanup, gitignore
│   ├── terminal/
│   │   └── insertPath.ts         # sendText to active terminal
│   ├── views/
│   │   └── dropZoneProvider.ts   # WebviewViewProvider for sidebar
│   └── util/
│       ├── exec.ts               # Promisified execFile with timeout
│       └── logger.ts             # OutputChannel logger
├── test/
│   └── suite/
│       ├── clipboard.test.ts
│       ├── imageStore.test.ts
│       └── platform.test.ts
├── package.json
├── tsconfig.json
├── esbuild.js
├── eslint.config.mjs
└── .vscodeignore
```

## Implementation Steps

### Phase 1: Project scaffold
- Initialize `package.json` with extension manifest (commands, keybindings, configuration, views)
- Create `tsconfig.json`, `esbuild.js`, `.vscode/launch.json`, `.vscode/tasks.json`
- Set up ESLint flat config

### Phase 2: Platform detection + utility layer
- `src/platform/detect.ts` — detect OS, WSL (via `/proc/version`), display server (`$XDG_SESSION_TYPE`), PowerShell path
- `src/util/exec.ts` — promisified `execFile` with 10s timeout, separate `execBuffer` for binary stdout
- `src/util/logger.ts` — OutputChannel wrapper

### Phase 3: Clipboard readers
- `src/clipboard/types.ts` — `ClipboardReader` interface: `hasImage()`, `readImage()`, `requiredTool()`, `isToolAvailable()`
- `src/clipboard/macosClipboard.ts` — `pngpaste -` for reading, `osascript clipboard info` for checking
- `src/clipboard/linuxClipboard.ts` — branches on X11 (`xclip`) vs Wayland (`wl-paste`)
- `src/clipboard/windowsClipboard.ts` — PowerShell `System.Windows.Forms.Clipboard`
- `src/clipboard/wslClipboard.ts` — invokes PowerShell from WSL, saves to Windows temp, converts path with `wslpath`
- `src/clipboard/index.ts` — `createClipboardReader(platform)` factory

### Phase 4: Storage + terminal insertion
- `src/storage/imageStore.ts` — saves to `.tip-images/` with timestamp names (`img-2026-02-26T21-30-45-123.png`), auto-cleanup, auto-gitignore
- `src/terminal/insertPath.ts` — `sendText(quotedPath, false)` to active terminal (no newline by default, so user can add context before hitting Enter)

### Phase 5: Extension entry point + commands
- `src/extension.ts` — activate: detect platform, create reader, check tool availability, register commands
- `terminalImgPaste.pasteImage` command — read clipboard → save → insert path
- `terminalImgPaste.sendPathToTerminal` command — explorer context menu handler
- Keybinding: `Ctrl+Alt+V` / `Cmd+Alt+V` when `terminalFocus`

### Phase 6: Sidebar drop zone
- `src/views/dropZoneProvider.ts` — `WebviewViewProvider`, listens for `files-dropped` and `image-data-dropped` messages from webview
- `media/dropZone.js` — HTML5 drag-and-drop listeners, posts file URIs / base64 image data to extension
- `media/dropZone.css` — minimal styling with drag-over visual feedback
- Register as a panel view in `package.json` contributions

### Phase 7: Tests + polish
- Unit tests for platform detection, image store, gitignore logic
- Integration tests with mocked `execFile` for clipboard readers
- README with usage instructions and platform requirements

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `folderName` | `.tip-images` | Image storage folder relative to workspace |
| `maxImages` | `20` | Auto-delete oldest beyond this count |
| `autoGitIgnore` | `true` | Add folder to .gitignore automatically |
| `sendNewline` | `false` | Auto-press Enter after inserting path |

## Verification

1. **Build**: `npm run compile` should produce `dist/extension.js` with no errors
2. **Manual test (WSL2)**: Copy a screenshot → open terminal → Ctrl+Alt+V → confirm `.tip-images/img-*.png` appears in terminal and on disk
3. **Manual test (context menu)**: Right-click a PNG in explorer → "Send Image Path to Terminal" → confirm path appears in terminal
4. **Manual test (drop zone)**: Drag an image from file explorer into the sidebar panel → confirm path appears in terminal
5. **Claude CLI test**: Paste an image path, then type a question about the image — confirm Claude processes it
6. **Cleanup test**: Paste 25 images → confirm only 20 remain in `.tip-images/`
7. **Run tests**: `npm test` passes
