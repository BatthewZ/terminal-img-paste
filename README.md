# Terminal Image Paste

Paste clipboard images into your VS Code terminal as file paths. Designed for CLI tools like [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that accept image paths as input.

Copy a screenshot, press **Ctrl+Alt+V**, and the image is saved to your workspace with the path inserted at your terminal cursor — ready to send.

## Features

- **Clipboard paste** — Press Ctrl+Alt+V (Cmd+Alt+V on macOS) to save a clipboard image and insert its path into the active terminal
- **Explorer context menu** — Right-click any image file and select "Send Image Path to Terminal"
- **Drag-and-drop sidebar** — Drop images from your OS or browser onto the Drop Zone panel in the activity bar
- **Multi-format support** — Reads PNG, JPEG, BMP, WebP, and TIFF from the clipboard; auto-detects format
- **Format conversion** — Optionally convert all images to PNG or JPEG on save
- **Configurable filenames** — Use patterns with `{timestamp}`, `{date}`, `{time}`, `{n}`, `{hash}` placeholders
- **Folder organization** — Store images flat, or in daily/monthly subdirectories
- **Auto-cleanup** — Oldest images are automatically deleted when the count exceeds `maxImages`
- **Auto .gitignore** — The image folder is added to `.gitignore` on first save
- **Image preview** — Optionally preview clipboard images before saving (opt-in)
- **Shell-aware quoting** — Paths are quoted correctly for bash, zsh, fish, PowerShell, and cmd
- **Remote terminal awareness** — Warns when pasting in SSH/container terminals where local paths may not be accessible
- **Diagnostic debug mode** — Run "Show Diagnostics" to inspect platform, clipboard, storage, and terminal state
- **Public extension API** — Other extensions can call `pasteFromClipboard()`, `sendPathToTerminal()`, and subscribe to `onImagePasted`

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

On macOS, `osascript` is used as a fallback if `pngpaste` is unavailable. On WSL2 with WSLg, native Linux tools (xclip/wl-paste) are preferred with PowerShell as fallback. On Linux, the extension tries both X11 and Wayland tools with automatic fallback.

The extension checks for the required tool on startup and shows a warning if it's missing.

## Usage

### Paste a Clipboard Image

1. Copy an image to your clipboard (screenshot, right-click "Copy image", etc.)
2. Focus a VS Code terminal
3. Press **Ctrl+Alt+V** (macOS: **Cmd+Alt+V**)

The image is saved to your workspace and the quoted file path appears at your terminal cursor. By default no newline is sent, so you can append additional text before pressing Enter.

**Example with Claude Code:**

```
> '/home/you/project/.tip-images/img-2026-02-27T14-30-45-123.png' what does this diagram show?
```

### Drag and Drop

Open the **Terminal Image Paste** panel from the activity bar. Drop image files from your OS file manager or browser directly onto the Drop Zone. The image is saved and the path is inserted into the active terminal.

### Send an Existing Image

Right-click any image file (PNG, JPG, JPEG, GIF, BMP, WebP, SVG) in the VS Code Explorer and select **Send Image Path to Terminal**. The quoted path is inserted into the active terminal.

### Commands

| Command | Keybinding | Description |
|---|---|---|
| `Paste Clipboard Image to Terminal` | Ctrl+Alt+V / Cmd+Alt+V | Save clipboard image and insert path into terminal |
| `Send Image Path to Terminal` | — (explorer context menu) | Insert an existing file's path into terminal |
| `Terminal Image Paste: Show Diagnostics` | — | Show diagnostic report with platform, clipboard, and storage info |

All commands are available from the Command Palette (`Ctrl+Shift+P`).

## Configuration

All settings live under the `terminalImgPaste` namespace. Open **Settings** and search for "Terminal Image Paste", or edit `settings.json` directly:

| Setting | Type | Default | Description |
|---|---|---|---|
| `folderName` | string | `.tip-images` | Image storage folder relative to workspace root |
| `maxImages` | number | `20` | Auto-delete oldest images when this count is exceeded |
| `autoGitIgnore` | boolean | `true` | Add the image folder to `.gitignore` automatically |
| `sendNewline` | boolean | `false` | Send a newline (Enter) after inserting the path |
| `saveFormat` | `"auto"` \| `"png"` \| `"jpeg"` | `auto` | Image save format. `auto` preserves the native clipboard format |
| `filenamePattern` | string | `img-{timestamp}` | Filename pattern (see [Filename Placeholders](#filename-pattern-placeholders) below) |
| `organizeFolders` | `"flat"` \| `"daily"` \| `"monthly"` | `flat` | How to organize saved images into subdirectories |
| `showPreview` | boolean | `false` | Show a preview of the clipboard image before saving |
| `warnOnRemote` | boolean | `true` | Warn when pasting in remote terminals (SSH, containers) |
| `notifications` | `"all"` \| `"errors"` \| `"none"` | `all` | Notification verbosity. `errors` suppresses info/warnings; `none` routes all to the output channel |

### Filename Pattern Placeholders

| Placeholder | Description | Example |
|---|---|---|
| `{timestamp}` | Full timestamp with milliseconds | `2026-02-27T14-30-45-123` |
| `{date}` | Date only | `2026-02-27` |
| `{time}` | Time only | `14-30-45` |
| `{n}` | Auto-incrementing sequential number | `1`, `2`, `3` |
| `{hash}` | First 8 characters of SHA-256 hash of image data | `a1b2c3d4` |

If the pattern contains no uniqueness placeholder (`{timestamp}`, `{n}`, or `{hash}`), a timestamp is appended automatically to prevent filename collisions.

## Extension API

Other VS Code extensions can consume the Terminal Image Paste API:

```typescript
const tipExtension = vscode.extensions.getExtension('terminal-img-paste.terminal-img-paste');
const api = tipExtension?.exports;

if (api) {
  // Paste from clipboard and get the saved path
  const result = await api.pasteFromClipboard();
  if (result) {
    console.log(`Saved to: ${result.path} (${result.format})`);
  }

  // Send a path to the active terminal
  api.sendPathToTerminal('/path/to/image.png');

  // Get the image storage folder
  const folder = api.getImageFolder();

  // Subscribe to paste events
  api.onImagePasted((result) => {
    console.log(`Image pasted: ${result.path}`);
  });
}
```

## How It Works

1. **Clipboard read** — The extension invokes a platform-native CLI tool (`pngpaste`, `xclip`, `wl-paste`, or PowerShell) to read raw image data from the system clipboard.
2. **Format detection** — The clipboard format is auto-detected from magic bytes (PNG, JPEG, BMP, WebP, TIFF).
3. **Optional preview** — If `showPreview` is enabled, a webview panel shows the image with Paste/Cancel buttons.
4. **Optional conversion** — If `saveFormat` is set to `png` or `jpeg`, the image is converted before saving.
5. **Save to disk** — The image buffer is written to the configured folder with a filename generated from the `filenamePattern` setting.
6. **Insert path** — The absolute file path, quoted for the active terminal's shell type, is sent to the terminal via `terminal.sendText()`.
7. **Auto-cleanup** — If the image count exceeds `maxImages`, the oldest files are deleted. Empty subdirectories are removed.
8. **Auto-gitignore** — On first save, the image folder is appended to `.gitignore` (unless disabled).

The extension has **zero runtime dependencies** — it ships as a single bundled JS file with no `node_modules`.

## Troubleshooting

Run **Terminal Image Paste: Show Diagnostics** from the Command Palette to see a full report of your platform, clipboard tools, storage state, and terminal info. This is the best first step for debugging any issue.

### "Clipboard tool not found" warning

Install the required tool for your platform (see [Platform Prerequisites](#platform-prerequisites)), then reload VS Code.

### "No image found in clipboard"

Your clipboard contains text, not image data. Copy an image (screenshot, right-click → Copy Image) and try again.

### "No active terminal"

Open a terminal (`Ctrl+``) before pasting. The extension inserts the path into whichever terminal is currently focused.

### "No workspace folder is open"

The extension needs an open workspace to save images. Open a folder or workspace in VS Code first.

### Images aren't being cleaned up

Check that `terminalImgPaste.maxImages` is set to a positive integer. Image files (`.png`, `.jpg`, `.jpeg`, `.tiff`, `.bmp`, `.webp`) in the image folder are counted and cleaned up.

### WSL2-specific issues

The extension accesses the Windows clipboard from WSL by invoking `powershell.exe` through WSL interop. If this fails:
- Verify WSL interop is enabled: `cat /proc/sys/fs/binfmt_misc/WSLInterop` should exist
- Check that `powershell.exe` is accessible from your WSL shell
- With WSLg installed, the extension prefers native Linux tools (`xclip`/`wl-paste`) which are faster and more reliable

### Remote terminal warning

When connected to a remote workspace (SSH, container, WSL), images are saved on the local filesystem. The pasted path may not exist on the remote machine. Disable the warning with `terminalImgPaste.warnOnRemote: false` if you understand the limitation.

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

# Run integration tests
npm run test:integration

# Lint
npm run lint

# Package as .vsix
npm run package
```

## License

MIT
