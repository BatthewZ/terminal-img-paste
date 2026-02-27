# README & Marketplace Polish — Completed

## Changes Made

### README.md (rewritten)
- Full feature list: clipboard paste, explorer context menu, drag-and-drop, multi-format, format conversion, configurable filenames, folder organization, auto-cleanup, auto-gitignore, image preview, shell-aware quoting, remote terminal awareness, diagnostics, extension API
- Platform prerequisites table with fallback chain details (osascript on macOS, WSLg native tools)
- All 10 configuration settings documented in table
- Filename pattern placeholders table
- Extension API section with TypeScript usage example
- Updated troubleshooting with diagnostics command reference, remote terminal section
- Development section with all npm scripts including integration tests

### package.json
- Added: `license`, `repository`, `keywords`, `galleryBanner`
- Note: `icon` is still SVG — needs PNG conversion for Marketplace

### .vscodeignore
- Added: `swarm/**`, `.github/**`, `.claude/**`, `vitest.config.ts`, `vitest.integration.config.ts`, `CLAUDE.md`

### LICENSE
- Created MIT LICENSE file

## Remaining Issue
- `assets/icon.svg` should be converted to PNG (128x128 or 256x256) for VS Code Marketplace publication. SVG is not supported as a Marketplace icon.

## Verification
- `npm run compile` — passes
- `npm test` — 559/559 tests pass
- `npm run lint` — clean
