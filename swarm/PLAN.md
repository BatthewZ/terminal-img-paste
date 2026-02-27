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

### Phase 8: Test hardening

Harden the test suite for production quality. Covers 0% coverage modules, missing error paths, edge cases, and integration tests.

**Infrastructure:**
- Extended `test/__mocks__/vscode.ts` with `commands.registerCommand` (stores handlers in a map), `window.setStatusBarMessage`, and helpers `__getRegisteredCommand`/`__clearRegisteredCommands`
- Added V8 coverage config to `vitest.config.ts`

**New test files:**
- `test/extension.test.ts` (~19 tests) — activate, pasteImage command handler, sendPathToTerminal command handler, deactivate. Tests command registration, the full paste flow, mutex serialization, status bar messages, and all error branches.
- `test/logger.test.ts` (~10 tests) — createLogger, info/warn/error/show methods, timestamp format, error stack handling.
- `test/imageStore.integration.test.ts` (~8 tests) — Real filesystem tests against temp directories. Covers save, cleanup, ensureGitIgnored, and consecutive filename uniqueness.

**Error paths added to existing tests:**
- `test/clipboard.test.ts` (+7) — readImage throws when execBuffer rejects (pngpaste/xclip/wl-paste crash), wslpath failures, empty PowerShell stdout
- `test/imageStore.test.ts` (+5) — undefined/empty workspaceFolders, mkdir/writeFile propagation, ensureGitIgnored writeFile failure
- `test/exec.test.ts` (+4) — ETIMEDOUT and ERR_CHILD_PROCESS_STDIO_MAXBUFFER for both exec and execBuffer

**Edge cases added:**
- `test/insertPath.test.ts` (+3) — empty string, unicode characters, single-quote-only path
- `test/mutex.test.ts` (+2) — double-release safety, rapid acquire-release stress test (50 cycles)

---

## V2 Roadmap — Feature Expansion

Everything above (Phases 1–16) constitutes the V1 foundation. The phases below address gaps in format support, platform resilience, UX, extensibility, and test confidence. They are grouped into four macro-phases ordered by user impact.

---

### Macro-Phase A: Multi-Format Clipboard Support

The single biggest limitation is PNG-only clipboard handling. Browsers copy JPEG/WebP, macOS copies TIFF, and Wayland exposes MIME-negotiated types. This macro-phase makes the extension format-aware.

#### Phase 17: Clipboard format detection

Detect the MIME type of the clipboard content before reading it, so we can branch on format.

- **`src/clipboard/types.ts`** — Add `ClipboardFormat` type (`'png' | 'jpeg' | 'tiff' | 'bmp' | 'webp' | 'unknown'`) and add `detectFormat(): Promise<ClipboardFormat>` to the `ClipboardReader` interface.
- **macOS** — Parse `osascript -e 'clipboard info'` output; it already reports `«class PNGf»`, `«class TIFF»`, `«class JPEG»`, etc. Map each to `ClipboardFormat`.
- **Linux X11** — Run `xclip -selection clipboard -t TARGETS -o` to list available MIME types. Prefer `image/png`, fall back to `image/jpeg`, `image/bmp`, etc.
- **Linux Wayland** — Run `wl-paste --list-types` to enumerate MIME types. Same preference order.
- **Windows/WSL (PowerShell)** — The current PowerShell script uses `ContainsImage()` which always saves as PNG via `System.Drawing`. Format detection here returns `'png'` always since .NET re-encodes. No change needed.
- **Tests** — Unit tests for each platform's `detectFormat()` with mocked tool output for each format.

#### Phase 18: Multi-format clipboard reading

Read non-PNG formats from the clipboard and save them in their native format (no unnecessary transcoding).

- **macOS** — `pngpaste` already handles TIFF→PNG conversion internally. For JPEG, detect format first; if JPEG, use `osascript` with `write (the clipboard as JPEG picture) to` to extract raw JPEG bytes.
- **Linux X11** — Pass the detected MIME type to `xclip -selection clipboard -t <mime> -o` instead of hardcoding `image/png`.
- **Linux Wayland** — Pass the detected MIME type to `wl-paste --type <mime>` instead of hardcoding `image/png`.
- **`src/storage/imageStore.ts`** — Accept a `format` parameter in `save()`. Use the correct file extension (`.png`, `.jpg`, `.bmp`, `.webp`). Update the PNG-signature validation to be format-aware (validate JPEG SOI marker `0xFFD8`, BMP `BM` header, WebP `RIFF...WEBP`, etc., or skip validation for unknown formats).
- **`src/extension.ts`** — Thread the detected format through the save pipeline.
- **Tests** — Mock each format's binary header and verify correct extension and validation behavior.

#### Phase 19: Image format conversion option

Let users force a target format (e.g., always save as PNG regardless of clipboard content). This is useful for consistency and for tools that only accept PNG.

- **New setting** — `terminalImgPaste.saveFormat`: `"auto" | "png" | "jpeg"` (default `"auto"`).
- **`src/image/convert.ts`** (new module) — Thin wrapper that uses platform-native tools for conversion:
  - macOS: `sips --setProperty format png input.jpg --out output.png`
  - Linux: `convert` (ImageMagick) or `ffmpeg` as fallback
  - Windows/WSL: PowerShell `System.Drawing` re-encode
- **Graceful fallback** — If the conversion tool isn't available, save in native format and log a warning.
- **Tests** — Conversion with mocked tool output, fallback behavior when tool is missing.

---

### Macro-Phase B: Platform Resilience & Edge Cases

Make the extension robust in non-standard environments: mixed display servers, WSL quirks, tool fallback chains, and shell-aware path insertion.

#### Phase 20: Clipboard tool fallback chains

When the preferred tool fails, try an alternative before giving up.

- **Linux** — If `wl-paste` fails on Wayland, try `xclip` (XWayland is common). If `xclip` fails on X11, check if `wl-paste` works (some sessions report X11 but run under Wayland).
- **WSL** — If PowerShell interop fails, try `xclip`/`wl-paste` if an X server or Wayland compositor is running (WSLg scenarios).
- **macOS** — If `pngpaste` is missing, fall back to `osascript` for basic clipboard reading (less reliable but zero-install).
- **Implementation** — Add a `FallbackClipboardReader` wrapper in `src/clipboard/fallback.ts` that accepts an ordered list of readers and tries each in sequence. Update `createClipboardReader()` to return a fallback chain instead of a single reader.
- **Tests** — First reader fails → second reader succeeds. All readers fail → meaningful aggregate error.

#### Phase 21: Shell-aware path insertion

Different shells need different quoting. Fish doesn't use backslash escaping the same way, PowerShell uses backticks, etc.

- **`src/terminal/shellDetect.ts`** (new module) — Detect the active terminal's shell type by inspecting `terminal.creationOptions.shellPath` or the `SHELL` env var. Return `'bash' | 'zsh' | 'fish' | 'powershell' | 'cmd' | 'unknown'`.
- **`src/terminal/insertPath.ts`** — Branch quoting logic by shell type:
  - bash/zsh: existing single-quote + `'\''` escape (no change)
  - fish: single-quote with `\'` escape (fish supports this directly)
  - PowerShell: wrap in double quotes, escape `$` and `` ` ``
  - cmd: wrap in double quotes, escape `%` and `"`
  - unknown: fall back to bash-style (current behavior)
- **Tests** — Verify correct quoting output for each shell type with special-character paths.

#### Phase 22: Remote terminal awareness

Detect when the user is in a remote context (SSH, Docker, devcontainer) and warn or adapt.

- **Detection** — Check `vscode.env.remoteName` (set to `"ssh-remote"`, `"dev-container"`, `"wsl"`, etc. when connected).
- **Behavior** — When remote:
  - The clipboard lives on the **local** machine, but the terminal runs on the **remote** machine.
  - Show a warning: "Clipboard images are saved locally. The pasted path may not be accessible from the remote terminal."
  - If `remoteName === 'wsl'`, the existing WSL flow already handles this — no warning needed.
- **Future hook** — Prepare an extension point for remote file transfer (scp/docker cp) but don't implement the transfer itself yet. Add a `// TODO: remote file transfer` placeholder.
- **Tests** — Mock `vscode.env.remoteName` and verify warning behavior.

#### Phase 23: WSL hardening

Address WSL-specific edge cases that can cause silent failures.

- **WSL version detection** — Read `/proc/version` or check for `/mnt/wslg/` to distinguish WSL1 vs WSL2. WSL1 doesn't support `wslpath` reliably and has no WSLg.
- **WSLg clipboard** — When WSLg is available (WSL2 with GUI support), offer `xclip`/`wl-paste` as alternatives to PowerShell interop since they may be faster and more reliable.
- **PowerShell path robustness** — Instead of only checking two hardcoded paths, also try `command -v powershell.exe` and `which pwsh.exe` to find PowerShell anywhere on the Windows PATH.
- **Error context** — When WSL clipboard operations fail, include the specific failure stage in the error message (PowerShell execution, temp file read, or wslpath conversion).
- **Tests** — WSL1 vs WSL2 detection, WSLg detection, PowerShell discovery variations.

---

### Macro-Phase C: User Experience & Configuration

Make the extension more pleasant to use with previews, richer configuration, and better status feedback.

#### Phase 24: Configurable filename patterns

Let users control how pasted images are named.

- **New setting** — `terminalImgPaste.filenamePattern`: string with placeholders. Default: `"img-{timestamp}"`. Available placeholders:
  - `{timestamp}` — ISO-like timestamp (current behavior)
  - `{date}` — `YYYY-MM-DD`
  - `{time}` — `HH-mm-ss`
  - `{n}` — auto-incrementing sequential number (scans existing files)
  - `{hash}` — first 8 chars of image content SHA-256
- **`src/storage/imageStore.ts`** — Refactor `generateFilename()` to accept a pattern string and resolve placeholders. Validate patterns (must produce unique names; warn if pattern lacks `{timestamp}`, `{n}`, or `{hash}`).
- **Tests** — Each placeholder resolves correctly, combined patterns, collision avoidance with `{n}`.

#### Phase 25: Image preview before save

Show the user what they're about to paste so they can confirm or cancel.

- **Flow change** — After `readImage()` but before `save()`, show a VS Code quick-pick or notification with a thumbnail.
- **Implementation** — Use `vscode.env.openExternal` with a temp data URI, or create a lightweight webview panel that displays the image and offers "Paste" / "Cancel" buttons.
- **New setting** — `terminalImgPaste.showPreview`: `boolean` (default `false`). Keep the fast path as default; preview is opt-in.
- **Timeout** — Auto-cancel after 10 seconds if the user doesn't respond, to avoid blocking the mutex.
- **Tests** — Preview shown when enabled, skipped when disabled, timeout triggers cancel.

#### Phase 26: Notification and status bar control

Give users fine-grained control over feedback verbosity.

- **New setting** — `terminalImgPaste.notifications`: `"all" | "errors" | "none"` (default `"all"`).
  - `"all"` — status bar messages on success, warning dialogs for missing tools, error dialogs on failure (current behavior).
  - `"errors"` — suppress success messages and tool warnings; only show errors.
  - `"none"` — all feedback goes to the output channel only; no popups or status bar messages.
- **Suppress startup tool warning** — Respect the notification setting during the `activate()` tool check.
- **`src/util/notify.ts`** (new module) — Centralize notification logic. All user-facing messages route through this module, which checks the setting before displaying.
- **Tests** — Each verbosity level correctly filters messages.

#### Phase 27: Storage organization — date subdirectories

Allow images to be organized into subdirectories by date.

- **New setting** — `terminalImgPaste.organizeFolders`: `"flat" | "daily" | "monthly"` (default `"flat"`).
  - `"flat"` — all images in the root folder (current behavior).
  - `"daily"` — `<folder>/2026-02-27/img-...png`
  - `"monthly"` — `<folder>/2026-02/img-...png`
- **`src/storage/imageStore.ts`** — When organizing, create the subdirectory on save. Update cleanup to scan recursively and remove empty subdirectories after pruning.
- **`.gitignore`** — The top-level folder entry already covers subdirectories; no change needed.
- **Tests** — Correct subdirectory creation, recursive cleanup, empty directory removal.

---

### Macro-Phase D: Extensibility, Testing & Security

Harden the extension for marketplace publication and third-party consumption.

#### Phase 28: Public extension API

Expose a programmatic API for other extensions to interact with Terminal Image Paste.

- **`src/api.ts`** (new module) — Define and export a public API object from `activate()`:
  ```typescript
  interface TerminalImgPasteApi {
    pasteFromClipboard(): Promise<string | undefined>; // returns saved path
    sendPathToTerminal(filePath: string): void;
    getImageFolder(): string;
    onImagePasted: vscode.Event<{ path: string; format: string }>;
  }
  ```
- **`src/extension.ts`** — Return the API object from `activate()` so other extensions can access it via `vscode.extensions.getExtension('terminal-img-paste').activate()`.
- **Event emitter** — Fire `onImagePasted` after every successful paste so consumers can react (e.g., auto-attach to a chat message).
- **Tests** — API methods callable, event fires with correct payload.

#### Phase 29: Diagnostic / debug mode

Help users and contributors troubleshoot issues.

- **New command** — `terminalImgPaste.showDiagnostics`: Runs all platform checks and displays results in a new editor tab as structured text:
  - OS, WSL status, display server
  - PowerShell path (if applicable)
  - Tool availability for each clipboard reader
  - Clipboard format detection result
  - Workspace folder, image folder path, current image count
  - Extension settings dump
- **Output** — Use `vscode.workspace.openTextDocument({ content, language: 'markdown' })` for nice formatting.
- **Tests** — Command produces expected output for mocked platform scenarios.

#### Phase 30: Symlink and permission hardening

Close the security gaps around symlinks and file permissions.

- **Symlink detection** — Before saving, resolve the image folder path with `fs.realpath()` and verify it still falls within the workspace root. Reject if a symlink escapes the workspace.
- **Explicit permissions** — Set saved images to `0o600` (owner read/write only). Already done — verify this is consistent across all save paths including format conversion temp files.
- **PowerShell script hardening** — Avoid string interpolation for paths in PowerShell commands. Use `-EncodedCommand` with base64-encoded scripts, or pass paths as arguments rather than inline strings.
- **Tool path verification** — Resolve clipboard tool paths to absolute paths using `which`/`where` at startup and cache them. Prevents PATH manipulation attacks.
- **Tests** — Symlink escape detection, permission verification, tool path resolution.

#### Phase 31: Integration test harness

Add real-tool integration tests that run alongside the mocked unit tests (gated behind an environment flag so CI can skip them on platforms without the required tools).

- **`test/integration/`** directory — New test files that invoke real clipboard tools.
- **Gate** — `RUN_INTEGRATION=1 npm test` enables integration tests. Default: skipped.
- **Platform matrix** — Each test file checks `detectPlatform()` and skips irrelevant tests for the current OS.
- **Test scenarios:**
  - Write a known PNG to clipboard via platform tool, then `readImage()` and verify bytes match.
  - Save → cleanup cycle on real filesystem with real file counts.
  - `insertPathToTerminal` with a mock VS Code terminal API to verify sendText is called correctly.
- **CI** — Add a GitHub Actions matrix workflow (`.github/workflows/integration.yml`) that runs on macOS, Ubuntu (X11), and Windows runners.

#### Phase 32: Drag-and-drop support

Enable dragging images from the OS file manager or browser into a VS Code drop target.

- **VS Code Drop API** — Register a `DocumentDropEditProvider` for terminal URIs (VS Code 1.86+). When an image file is dropped onto the terminal, extract the file URI, save a copy to the image folder (or use the path directly), and insert the path.
- **Webview drop zone (resurrection)** — The V1 plan originally included a sidebar drop zone (Phase 6) that was removed. Re-implement it as a `WebviewViewProvider` sidebar panel:
  - HTML5 drag-and-drop listeners accept files and pasted image data
  - Posts file URIs / base64 data to the extension host
  - Extension saves and inserts the path
- **`media/dropZone.css`** + **`media/dropZone.js`** — Minimal UI with drag-over highlight, file type validation, and error feedback.
- **`package.json`** — Register the webview view contribution.
- **Tests** — Drop events with file URIs, drop events with image data, rejection of non-image files.

---

### Phase Dependency Graph

```
Macro-Phase A (Formats)        Macro-Phase B (Platform)
  17 → 18 → 19                   20 → (21, 22, 23)
                                       ↓
Macro-Phase C (UX)              Macro-Phase D (Extensibility)
  (24, 25, 26, 27)               28 → 29
  [independent of each other]     30 (independent)
                                  31 (independent, but benefits from all prior phases)
                                  32 (independent)
```

Phases within a macro-phase are ordered where there are dependencies. Across macro-phases, work can proceed in parallel — A and B have no mutual dependencies, C depends on A (format-aware filenames), and D can start at any time.

### Priority Ranking

| Priority | Phases | Rationale |
|----------|--------|-----------|
| **P0 — High impact, frequently requested** | 17, 18, 20 | Multi-format support and tool fallback chains fix the most common user complaints |
| **P1 — Important for reliability** | 21, 23, 30 | Shell quoting, WSL hardening, and symlink security prevent silent breakage |
| **P2 — Nice UX improvements** | 24, 25, 26, 27 | Filename patterns, preview, notification control, and folder organization |
| **P3 — Ecosystem & confidence** | 28, 29, 31, 32 | Public API, diagnostics, integration tests, and drag-and-drop |
