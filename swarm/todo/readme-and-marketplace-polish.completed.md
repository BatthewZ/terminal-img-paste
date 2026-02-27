# Feature: README & Marketplace Polish

## Problem

The project has **no README.md** file. Phase 7 of the plan called for "README with usage instructions and platform requirements" but it was never created. This is a blocking gap for VS Code Marketplace publication — the README is the primary content displayed on the extension listing page and is required by `vsce package`.

Additionally, the `package.json` is missing several fields recommended for Marketplace publication (repository, license, keywords, badges, etc.), and the `.vscodeignore` doesn't exclude the `swarm/` directory.

## Tasks

### 1. Create README.md

Write a comprehensive README.md for the project root. It should include:

**Sections:**
- **Hero banner / title** — Extension name, one-line description
- **Features** — Bullet list with descriptions:
  - Clipboard paste (Ctrl+Alt+V / Cmd+Alt+V)
  - Explorer context menu ("Send Image Path to Terminal")
  - Sidebar drop zone (drag-and-drop from OS/browser)
  - Multi-format support (PNG, JPEG, BMP, WebP, TIFF)
  - Auto-cleanup (configurable max images)
  - Auto .gitignore
  - Image preview before save (opt-in)
  - Shell-aware path quoting (bash, zsh, fish, PowerShell, cmd)
  - Remote terminal awareness
  - Diagnostic debug mode
  - Public extension API for other extensions
- **Platform Requirements** — Table showing:
  - macOS: `pngpaste` (brew install pngpaste), or falls back to `osascript`
  - Linux X11: `xclip` (apt install xclip)
  - Linux Wayland: `wl-paste` (apt install wl-clipboard)
  - Windows: PowerShell (built-in)
  - WSL2: PowerShell interop (built-in), or native tools via WSLg
- **Quick Start** — 3-step guide (install, copy image, Ctrl+Alt+V)
- **Configuration** — Table of all settings from package.json with descriptions:
  - `folderName`, `maxImages`, `autoGitIgnore`, `sendNewline`
  - `saveFormat`, `filenamePattern`, `organizeFolders`
  - `showPreview`, `notifications`, `warnOnRemote`
- **Commands** — List of registered commands
- **Extension API** — Brief docs on the `TerminalImgPasteApi` interface for extension consumers
- **Filename Pattern Placeholders** — `{timestamp}`, `{date}`, `{time}`, `{n}`, `{hash}`
- **Troubleshooting** — Common issues (tool not found, WSL clipboard issues, remote terminal warnings) and the `Show Diagnostics` command
- **Development** — Build, test, lint commands
- **License** — MIT (or whatever is chosen)

**Sources to draw from:**
- `swarm/PLAN.md` — Feature descriptions, platform table, configuration table
- `package.json` — All settings, commands, keybindings
- `src/api.ts` — Public API interface
- `src/storage/imageStore.ts` — Filename pattern logic
- `src/commands/diagnostics.ts` — Diagnostics command

### 2. Polish package.json for Marketplace

Add missing fields:
- `"repository"` — GitHub URL (use placeholder if not known)
- `"license"` — "MIT"
- `"keywords"` — ["clipboard", "image", "terminal", "paste", "screenshot", "vscode"]
- `"badges"` — CI status badge (optional)
- `"galleryBanner"` — color for Marketplace listing
- Verify `"icon"` points to a valid file (currently `assets/icon.svg` — Marketplace requires PNG, not SVG; this may need conversion or a note)

### 3. Update .vscodeignore

Add exclusions for files that shouldn't be in the published `.vsix`:
- `swarm/**`
- `test/**` (already present)
- `.github/**`
- `vitest.config.ts`
- `vitest.integration.config.ts`
- `CLAUDE.md` (if it exists)
- `.claude/**`

### 4. Create LICENSE file

Add an MIT LICENSE file (standard for VS Code extensions).

## Implementation Notes

- Use subagents where appropriate: one agent can write the README while another handles package.json/vscodeignore/LICENSE in parallel.
- The README should be factual and based on actual code, not aspirational. Reference the source files to ensure accuracy.
- Keep the README concise but complete — marketplace users need to understand what the extension does and how to set it up on their platform.

## Verification

1. `vsce package --no-dependencies` should succeed without warnings about missing README
2. README renders correctly in VS Code's Markdown preview
3. All configuration settings in README match `package.json`
4. All commands in README match `package.json` contributions
5. Platform requirements table is accurate per `src/clipboard/index.ts` and platform readers

## Completion Notes (agent b92bb1fe)

All 4 tasks completed:

1. **README.md** — Rewrote with all features: drag-and-drop, multi-format, format conversion, configurable filenames, folder organization, preview, shell-aware quoting, remote terminal awareness, diagnostics, extension API. All 10 configuration settings documented. Filename placeholders table added. Extension API usage example included. Troubleshooting updated with diagnostics command and remote terminal section.

2. **package.json** — Added `license: "MIT"`, `repository` (placeholder URL), `keywords` (clipboard, image, terminal, paste, screenshot, vscode, claude-code), `galleryBanner` (dark theme). Note: `icon` remains SVG — convert to 128x128+ PNG before Marketplace publication.

3. **.vscodeignore** — Added exclusions for `swarm/**`, `.github/**`, `.claude/**`, `vitest.config.ts`, `vitest.integration.config.ts`, `CLAUDE.md`.

4. **LICENSE** — Created MIT LICENSE file.

Build, tests (559/559 pass), and lint all verified.
