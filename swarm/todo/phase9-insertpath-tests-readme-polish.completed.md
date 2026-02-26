# Phase 9: insertPath Tests + README + Package Polish

## Problem

All source modules have comprehensive test coverage **except** `src/terminal/insertPath.ts`. This module handles shell-safe path quoting (the `'\''` single-quote escape pattern) and was the subject of a dedicated bug fix in Phase 7, yet has zero tests guarding against regressions. Additionally, the plan explicitly called for a README in Phase 7 ("README with usage instructions and platform requirements") which was never created. Finally, `assets/icon.svg` exists but is not referenced in `package.json`.

## Tasks

### Task 1: Add tests for `terminal/insertPath.ts`

Create `test/insertPath.test.ts` using vitest (matches existing test conventions).

The module under test (`src/terminal/insertPath.ts`) does the following:
1. Gets `vscode.window.activeTerminal` — shows error if none
2. Single-quotes the path, escaping embedded single quotes: `"'" + filePath.replace(/'/g, "'\\''") + "'"`
3. Reads `terminalImgPaste.sendNewline` config (default `false`)
4. Calls `terminal.sendText(quotedPath, addNewline)`
5. Logs via `logger.info()`

**Test cases to cover:**

- **Basic path quoting**: Simple path like `/home/user/img.png` becomes `'/home/user/img.png'`
- **Path with spaces**: `/home/user/my images/img.png` becomes `'/home/user/my images/img.png'`
- **Path with single quotes**: `/home/user/it's here/img.png` becomes `'/home/user/it'\''s here/img.png'`
- **Path with special shell chars**: Path containing `$`, `` ` ``, `!`, `(`, `)` — all safe inside single quotes
- **Path with multiple single quotes**: Multiple `'` chars all get escaped
- **sendText called with correct args**: Verify `terminal.sendText(quotedPath, false)` by default
- **sendNewline = true**: When config returns `true`, `terminal.sendText(quotedPath, true)`
- **No active terminal**: Shows error message via `vscode.window.showErrorMessage`, does NOT call `sendText`
- **Logger called**: Verify `logger.info` is called with the quoted path

**Implementation notes:**
- Use the existing vscode mock at `test/__mocks__/vscode.ts` (already provides `window.activeTerminal`, `workspace.getConfiguration`, `window.showErrorMessage`)
- Mock `../util/logger` with `vi.mock` to spy on `logger.info`
- Follow the patterns in existing test files (e.g., `clipboard.test.ts` for mocking vscode)

### Task 2: Add README.md

Create a `README.md` in the project root with:

- **Title + one-line description**: "Terminal Image Paste" — paste clipboard images into VS Code terminal as file paths
- **Features list**: Keybinding (Ctrl+Alt+V), explorer context menu, auto-cleanup, auto-gitignore
- **Platform requirements table**: Which CLI tool is needed per platform (pngpaste for macOS, xclip/wl-paste for Linux, built-in for Windows/WSL2)
- **Configuration table**: The 4 settings with defaults and descriptions (copy from `package.json` contributes.configuration)
- **Usage section**: Brief workflow — copy/screenshot image → focus terminal → Ctrl+Alt+V → path appears
- Keep it concise — under 100 lines

### Task 3: Add icon reference to package.json

Add `"icon": "assets/icon.svg"` to the top-level of `package.json` so the icon appears in VS Code extension views and Marketplace.

**Note:** VS Code Marketplace requires PNG icons (128x128 or 256x256). SVG may work locally but not on Marketplace. If this is just for local use, SVG is fine. Add the field regardless.

### Task 4: Rebuild and verify

- Run `npm test` — all tests (existing 133 + new insertPath tests) must pass
- Run `npm run compile` — rebuild `dist/extension.js`
- Run `npm run lint` — no errors

## Suggested Execution Strategy

**Spawn two parallel subagents:**

1. **Subagent A**: Task 1 (write insertPath tests) + Task 4 (run tests/build/lint)
2. **Subagent B**: Task 2 (write README) + Task 3 (add icon to package.json)

These are fully independent — the tests don't depend on the README and vice versa. After both complete, do a final `npm test && npm run compile && npm run lint` to verify everything together, then commit.

---

## Completion Notes (agent b1cc4aa1)

All 4 tasks completed successfully:

1. **Task 1** — Created `test/insertPath.test.ts` with 9 test cases covering: simple path quoting, spaces in paths, single-quote escaping (`'\''`), multiple single quotes, special shell characters (`$`, backticks, `!`, parens), sendNewline=false default, sendNewline=true config, no-active-terminal error, and logger.info verification. Follows the `imageStore.test.ts` pattern for vscode mock setup with `mockReset: true`.

2. **Task 2** — Created `README.md` with title, features list, platform requirements table, usage section, and configuration table. Under 40 lines, concise.

3. **Task 3** — Added `"icon": "assets/icon.svg"` to `package.json`.

4. **Task 4** — Verified: `npm test` passes 142/142 tests (133 existing + 9 new), `npm run compile` builds successfully, `npm run lint` is clean.
