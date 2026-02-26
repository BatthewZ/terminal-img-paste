# Phase 1: Project Scaffold

## Goal
Set up the complete project scaffold for the `terminal-img-paste` VS Code extension. This creates all build tooling, configuration files, and the `package.json` extension manifest with all commands, keybindings, configuration, and view contributions declared.

## Dependencies
None — this is the foundation phase.

## Tasks

Use subagents in parallel for independent tasks where noted.

### 1. Initialize `package.json` with full extension manifest

Create `package.json` with:
- **Extension metadata**: name `terminal-img-paste`, display name "Terminal Image Paste", description, version `0.0.1`, publisher placeholder, engines `^1.85.0`, categories `["Other"]`
- **Main entry**: `./dist/extension.js`
- **Activation events**: `onStartupFinished`
- **Commands** (under `contributes.commands`):
  - `terminalImgPaste.pasteImage` — "Paste Clipboard Image to Terminal"
  - `terminalImgPaste.sendPathToTerminal` — "Send Image Path to Terminal"
- **Keybindings** (under `contributes.keybindings`):
  - `Ctrl+Alt+V` (Windows/Linux), `Cmd+Alt+V` (Mac) → `terminalImgPaste.pasteImage`, when `terminalFocus`
- **Menus** (under `contributes.menus`):
  - `explorer/context`: `terminalImgPaste.sendPathToTerminal`, when `resourceExtname =~ /\.(png|jpg|jpeg|gif|bmp|webp|svg)/i`
- **Views** (under `contributes.views`):
  - A view container in the activity bar with id `terminalImgPaste`, title "Image Paste", icon `assets/icon.svg`
  - A view `terminalImgPaste.dropZone` with name "Drop Zone" in that container
- **Configuration** (under `contributes.configuration`):
  - `terminalImgPaste.folderName` — string, default `.tip-images`, description "Image storage folder relative to workspace"
  - `terminalImgPaste.maxImages` — number, default `20`, description "Auto-delete oldest images beyond this count"
  - `terminalImgPaste.autoGitIgnore` — boolean, default `true`, description "Automatically add image folder to .gitignore"
  - `terminalImgPaste.sendNewline` — boolean, default `false`, description "Auto-press Enter after inserting path into terminal"
- **Scripts**:
  - `compile`: `node esbuild.js`
  - `watch`: `node esbuild.js --watch`
  - `lint`: `eslint src/`
  - `test`: `vitest run`
  - `package`: `vsce package`
- **Dev dependencies**: `@types/vscode`, `@types/node`, `typescript`, `esbuild`, `eslint`, `@eslint/js`, `typescript-eslint`, `vitest`, `@vscode/vsce`

### 2. Create `tsconfig.json`

**Can run in parallel with tasks 1, 3, 4, 5, 6.**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

### 3. Create `esbuild.js`

**Can run in parallel with tasks 1, 2, 4, 5, 6.**

Build script that:
- Bundles `src/extension.ts` → `dist/extension.js`
- Format: `cjs`, platform: `node`, target: `node18`
- Externals: `vscode`
- Sourcemap: `true`
- Supports `--watch` flag for development
- Minify in production (non-watch) mode

### 4. Create `.vscode/launch.json`

**Can run in parallel with tasks 1, 2, 3, 5, 6.**

Extension Host launch configuration:
- Type: `extensionHost`
- Request: `launch`
- Args: `--extensionDevelopmentPath=${workspaceFolder}`
- OutFiles: `${workspaceFolder}/dist/**/*.js`
- Pre-launch task: `npm: compile`

### 5. Create `.vscode/tasks.json`

**Can run in parallel with tasks 1, 2, 3, 4, 6.**

Tasks for compile and watch:
- `npm: compile` — build task
- `npm: watch` — background watch task with appropriate problem matchers

### 6. Create ESLint flat config (`eslint.config.mjs`)

**Can run in parallel with tasks 1, 2, 3, 4, 5.**

ESLint flat config using `typescript-eslint`:
- Extend recommended configs from `@eslint/js` and `typescript-eslint`
- Parser: `typescript-eslint/parser`
- Source includes: `src/**/*.ts`
- Reasonable rules — no suppression of useful signals

### 7. Create `.vscodeignore`

**Can run in parallel with all tasks above.**

Ignore patterns for extension packaging:
```
.vscode/**
.vscode-test/**
src/**
test/**
node_modules/**
.gitignore
tsconfig.json
esbuild.js
eslint.config.mjs
**/*.map
```

### 8. Create `assets/icon.svg`

**Can run in parallel with all tasks above.**

A simple SVG icon for the extension — a clipboard with an image/picture symbol. Keep it minimal and recognizable.

### 9. Create stub `src/extension.ts`

Create a minimal but real `src/extension.ts` that exports `activate` and `deactivate` functions so the project compiles. The activate function should register the two commands as no-ops initially (they'll be implemented in Phase 5).

### 10. Install dependencies and verify build

**Must run AFTER all other tasks are complete.**

- Run `npm install`
- Run `npm run compile` — must succeed with no errors
- Run `npm run lint` — must succeed with no errors
- Fix any issues found

## Verification

- `npm run compile` produces `dist/extension.js` with no errors
- `npm run lint` passes with no errors
- All files from the project structure exist
- `package.json` has all commands, keybindings, menus, views, and configuration declared correctly

## Parallelization Notes

Tasks 1-8 are completely independent and should be done using **parallel subagents** (up to 8 subagents). Task 9 depends on the tsconfig and package.json existing. Task 10 must run last after everything else is done.

---

## Completion Notes (Agent d5c46fe8, Task cbf78d0a)

All 10 tasks completed successfully:

1. **package.json** — Created with full extension manifest including commands, keybindings, menus, views, viewsContainers, configuration, scripts, and devDependencies.
2. **tsconfig.json** — Created exactly as specified with strict mode and all compiler options.
3. **esbuild.js** — Created with CJS format, node18 target, vscode external, sourcemaps, minify in production, --watch support.
4. **.vscode/launch.json** — Extension Host launch configuration with preLaunchTask.
5. **.vscode/tasks.json** — Compile (default build) and watch (background) tasks.
6. **eslint.config.mjs** — Flat config with @eslint/js + typescript-eslint recommended, scoped to src/**/*.ts.
7. **.vscodeignore** — All specified ignore patterns.
8. **assets/icon.svg** — Clipboard+image icon with VS Code dark theme colors.
9. **src/extension.ts** — Stub with activate/deactivate, registers both commands as info-message stubs.
10. **npm install + compile + lint** — All passed with zero errors.

### Verification
- `npm run compile` → `dist/extension.js` produced (1144 bytes) + sourcemap
- `npm run lint` → 0 errors, 0 warnings
- All required files exist and are correctly structured
