# Terminal Image Paste

Paste clipboard images into your VS Code terminal as file paths. Designed for CLI tools like [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that accept image paths as input.

Copy a screenshot, press **Ctrl+Alt+V**, and the image is saved to your workspace with the path inserted at your terminal cursor — ready to send.

## Getting Started

### Install

Search for **Terminal Image Paste** in the VS Code Extensions panel, or install from the command line:

```
code --install-extension terminal-img-paste
```

### Platform Prerequisites

The extension uses native clipboard tools to read image data. Most platforms work out of the box — macOS and Linux need a small install:

| Platform | Required Tool | Install Command |
|---|---|---|
| macOS | [pngpaste](https://github.com/jcsalterego/pngpaste) | `brew install pngpaste` |
| Linux (X11) | xclip | `sudo apt install xclip` |
| Linux (Wayland) | wl-clipboard | `sudo apt install wl-clipboard` |
| Windows | PowerShell | Built-in, nothing to install |
| WSL2 | PowerShell via WSL interop | Built-in, nothing to install |

The extension checks for the required tool on startup and shows a warning if it's missing.

## Usage

### Paste a Clipboard Image

1. Copy an image to your clipboard (screenshot, right-click "Copy image", etc.)
2. Focus a VS Code terminal
3. Press **Ctrl+Alt+V** (macOS: **Cmd+Alt+V**)

The image is saved as a PNG to your workspace and the quoted file path appears at your terminal cursor. By default no newline is sent, so you can append additional text before pressing Enter.

**Example with Claude Code:**

```
> '/home/you/project/.tip-images/img-2026-02-27T14-30-45-123.png' what does this diagram show?
```

### Send an Existing Image

Right-click any image file (PNG, JPG, JPEG, GIF, BMP, WebP, SVG) in the VS Code Explorer and select **Send Image Path to Terminal**. The quoted path is inserted into the active terminal.

### Commands

| Command | Keybinding | Description |
|---|---|---|
| `Paste Clipboard Image to Terminal` | Ctrl+Alt+V / Cmd+Alt+V | Save clipboard image and insert path into terminal |
| `Send Image Path to Terminal` | — (explorer context menu) | Insert an existing file's path into terminal |

Both commands are also available from the Command Palette (`Ctrl+Shift+P`).

## Configuration

All settings live under the `terminalImgPaste` namespace. Open **Settings** and search for "Terminal Image Paste", or edit `settings.json` directly:

```jsonc
{
  // Folder for saved images, relative to workspace root
  "terminalImgPaste.folderName": ".tip-images",

  // Maximum number of images to keep (oldest are deleted first)
  "terminalImgPaste.maxImages": 20,

  // Automatically add the image folder to .gitignore
  "terminalImgPaste.autoGitIgnore": true,

  // Press Enter after inserting the path (send the command immediately)
  "terminalImgPaste.sendNewline": false
}
```

| Setting | Type | Default | Description |
|---|---|---|---|
| `folderName` | string | `.tip-images` | Image storage folder relative to workspace root |
| `maxImages` | number | `20` | Auto-delete oldest images when this count is exceeded |
| `autoGitIgnore` | boolean | `true` | Add the image folder to `.gitignore` automatically |
| `sendNewline` | boolean | `false` | Send a newline (Enter) after inserting the path |

## How It Works

1. **Clipboard read** — The extension invokes a platform-native CLI tool (`pngpaste`, `xclip`, `wl-paste`, or PowerShell) to read raw image data from the system clipboard.
2. **Save to disk** — The image buffer is written as a PNG to the configured folder (default `.tip-images/`) with a timestamped filename like `img-2026-02-27T14-30-45-123.png`.
3. **Insert path** — The absolute file path, wrapped in single quotes to handle spaces and special characters, is sent to the active terminal via `terminal.sendText()`.
4. **Auto-cleanup** — After each save, if the image count exceeds `maxImages`, the oldest files are deleted.
5. **Auto-gitignore** — On first save, the image folder is appended to `.gitignore` (unless disabled).

The extension has **zero runtime dependencies** — it ships as a single bundled JS file with no `node_modules`.

## Troubleshooting

### "Clipboard tool not found" warning

Install the required tool for your platform (see [Platform Prerequisites](#platform-prerequisites)), then reload VS Code.

### "No image found in clipboard"

Your clipboard contains text, not image data. Copy an image (screenshot, right-click → Copy Image) and try again.

### "No active terminal"

Open a terminal (`Ctrl+``) before pasting. The extension inserts the path into whichever terminal is currently focused.

### "No workspace folder is open"

The extension needs an open workspace to save images. Open a folder or workspace in VS Code first.

### Images aren't being cleaned up

Check that `terminalImgPaste.maxImages` is set to a positive integer. Only `.png` files in the image folder are counted and cleaned up.

### WSL2-specific issues

The extension accesses the Windows clipboard from WSL by invoking `powershell.exe` through WSL interop. If this fails:
- Verify WSL interop is enabled: `cat /proc/sys/fs/binfmt_misc/WSLInterop` should exist
- Check that `powershell.exe` is accessible from your WSL shell

## Development

```bash
# Install dev dependencies
npm install

# Build the extension
npm run compile

# Watch for changes during development
npm run watch

# Run tests
npm test

# Lint
npm run lint

# Package as .vsix
npm run package
```

## License

MIT
