# Terminal Image Paste

Paste clipboard images into VS Code terminal as file paths — works with CLI tools like Claude Code that accept image paths.

## Features

- **Keyboard shortcut** — `Ctrl+Alt+V` (macOS: `Cmd+Alt+V`) pastes a clipboard image and inserts the saved file path into the active terminal
- **Explorer context menu** — right-click any image file and select "Send Image Path to Terminal"
- **Auto-cleanup** — keeps at most N images in the storage folder, deleting the oldest automatically
- **Auto-gitignore** — optionally adds the image folder to `.gitignore`

## Platform Requirements

| Platform | Required Tool |
|----------|---------------|
| macOS | [pngpaste](https://github.com/jcsalterego/pngpaste) (`brew install pngpaste`) |
| Linux (X11) | `xclip` (`apt install xclip`) |
| Linux (Wayland) | `wl-clipboard` (`apt install wl-clipboard`) |
| Windows | PowerShell (built-in) |
| WSL2 | PowerShell via WSL interop (built-in) |

## Usage

1. Copy an image or take a screenshot (it lands on your clipboard)
2. Focus a VS Code terminal
3. Press `Ctrl+Alt+V` — the image is saved to your workspace and the quoted path appears at the cursor

## Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `terminalImgPaste.folderName` | string | `.tip-images` | Image storage folder relative to workspace |
| `terminalImgPaste.maxImages` | number | `20` | Auto-delete oldest images beyond this count |
| `terminalImgPaste.autoGitIgnore` | boolean | `true` | Automatically add image folder to `.gitignore` |
| `terminalImgPaste.sendNewline` | boolean | `false` | Auto-press Enter after inserting path into terminal |
