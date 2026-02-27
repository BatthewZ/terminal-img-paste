# Phase 29: Diagnostic / Debug Mode

## Priority
P3 — Ecosystem & confidence

## Summary

Add a `terminalImgPaste.showDiagnostics` command that runs all platform checks and displays a structured diagnostic report in a new editor tab. This helps users and contributors troubleshoot clipboard/platform issues without digging into logs.

## Implementation

### 1. New command: `src/commands/diagnostics.ts` (new file)

Create a `runDiagnostics()` function that gathers all platform and extension state:

```typescript
interface DiagnosticReport {
  platform: {
    os: string;
    isWsl: boolean;
    wslVersion?: '1' | '2';
    hasWslg?: boolean;
    displayServer?: string;
    powershellPath?: string;
  };
  clipboard: {
    readerType: string;
    fallbackChain: string[];
    toolAvailability: Record<string, boolean>;
    detectedFormat?: string;
  };
  storage: {
    workspaceFolder: string | undefined;
    imageFolder: string;
    currentImageCount: number;
    organizeFolders: string;
    filenamePattern: string;
  };
  settings: {
    maxImages: number;
    autoGitIgnore: boolean;
    sendNewline: boolean;
    showPreview: boolean;
    notifications: string;
    saveFormat: string;
    folderName: string;
  };
  terminal: {
    activeShell?: string;
    isRemote: boolean;
    remoteName?: string;
  };
}
```

**Steps within `runDiagnostics()`:**

1. Call `detectPlatform()` to get OS, WSL status, display server, PowerShell path
2. For WSL, check WSL version (WSL1/WSL2) and WSLg availability using existing detection in `wslClipboard.ts`
3. Create a clipboard reader via `createClipboardReader()` and call `isToolAvailable()` on each reader in the fallback chain
4. Try `detectFormat()` on the active reader (catch errors gracefully)
5. Count existing images in the image folder (using `collectImagesRecursive` if available, or `fs.readdir`)
6. Read all extension settings from `vscode.workspace.getConfiguration('terminalImgPaste')`
7. Check `vscode.env.remoteName` for remote context
8. Detect active terminal shell type using existing `detectShellType()` from `src/terminal/shellDetect.ts`

**Output formatting:**

Format the report as Markdown and open in a new editor tab:

```typescript
const content = formatDiagnosticsMarkdown(report);
const doc = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
await vscode.window.showTextDocument(doc);
```

The Markdown output should look like:

```markdown
# Terminal Image Paste — Diagnostics

## Platform
| Property | Value |
|----------|-------|
| OS | linux |
| WSL | Yes (WSL2) |
| WSLg | Available |
| Display Server | wayland |
| PowerShell Path | /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe |

## Clipboard
| Reader | Available |
|--------|-----------|
| PowerShellClipboardReader (primary) | ✓ |
| LinuxClipboardReader (fallback) | ✗ — wl-paste not found |
| Detected Format | png |

## Storage
| Property | Value |
|----------|-------|
| Workspace Folder | /home/user/project |
| Image Folder | /home/user/project/.tip-images |
| Image Count | 3 / 20 |
| Organization | flat |
| Filename Pattern | img-{timestamp} |

## Settings
| Setting | Value |
|---------|-------|
| maxImages | 20 |
| autoGitIgnore | true |
| sendNewline | false |
| showPreview | false |
| notifications | all |
| saveFormat | auto |

## Terminal
| Property | Value |
|----------|-------|
| Active Shell | bash |
| Remote | No |

---
*Generated at 2026-02-27T10:30:00.000Z*
```

### 2. Register the command in `package.json`

Add to `contributes.commands`:

```json
{
  "command": "terminalImgPaste.showDiagnostics",
  "title": "Terminal Image Paste: Show Diagnostics"
}
```

### 3. Register the command in `src/extension.ts`

In `activate()`, register the diagnostics command:

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('terminalImgPaste.showDiagnostics', () =>
    runDiagnostics(platform, reader, imageStore)
  )
);
```

Pass the already-created `platform`, `reader`, and `imageStore` instances so diagnostics can inspect their state without recreating them.

### 4. Tests: `test/diagnostics.test.ts` (new file)

**Spawn a subagent for writing tests in parallel with the main implementation.**

Test cases:

1. **Basic report generation** — Mock platform as Linux/X11, verify report contains all sections
2. **WSL report** — Mock platform as WSL2 with WSLg, verify WSL-specific fields populated
3. **Remote context** — Mock `vscode.env.remoteName` as `'ssh-remote'`, verify terminal.isRemote is true
4. **Tool unavailable** — Mock `isToolAvailable()` returning false, verify availability shows ✗
5. **Format detection failure** — Mock `detectFormat()` throwing, verify report shows error gracefully instead of crashing
6. **Empty workspace** — Mock `vscode.workspace.workspaceFolders` as undefined, verify report handles gracefully
7. **Markdown output** — Verify the generated markdown contains expected table headers and structure
8. **Command opens editor** — Verify `vscode.workspace.openTextDocument` and `vscode.window.showTextDocument` are called

### 5. Expose diagnostic info from existing modules

Some modules may need minor additions to expose internal state for diagnostics:

- **`src/clipboard/fallback.ts`** — Add a `getReaders(): ClipboardReader[]` method to `FallbackClipboardReader` so diagnostics can iterate the chain and check each reader's tool availability
- **`src/clipboard/types.ts`** — Add optional `name` property to `ClipboardReader` interface (or use `constructor.name`) so the diagnostics report can label each reader

## Parallelization Strategy

Use subagents for parallel work:

1. **Subagent A**: Implement `src/commands/diagnostics.ts` and the `formatDiagnosticsMarkdown()` formatter
2. **Subagent B**: Write `test/diagnostics.test.ts` tests
3. **Main agent**: Wire up `package.json` command registration and `extension.ts` integration, add `getReaders()` to fallback reader

## Dependencies

- Requires: Phase 20 (fallback chains), Phase 21 (shell detection), Phase 22 (remote awareness), Phase 23 (WSL hardening) — all completed
- No blocking dependencies on other pending work

## Verification

1. `npm run compile` — no errors
2. `npm test` — all tests pass including new diagnostics tests
3. Manual: Run "Terminal Image Paste: Show Diagnostics" from command palette → verify markdown report opens with correct platform info

## Completion Notes

**Implemented by agent 7b5aa343 (task 916b30d6)**

### Files created:
- **`src/commands/diagnostics.ts`**: New file with `gatherDiagnostics()`, `formatDiagnosticsMarkdown()`, and `runDiagnostics()` functions
- **`test/diagnostics.test.ts`**: 23 tests covering report generation, formatting, error handling, and edge cases

### Files modified:
- **`src/clipboard/fallback.ts`**: Added `getReaders()` method to expose reader chain for diagnostics
- **`src/extension.ts`**: Registered `terminalImgPaste.showDiagnostics` command, imported `runDiagnostics`
- **`package.json`**: Added `terminalImgPaste.showDiagnostics` command to `contributes.commands`
- **`test/extension.test.ts`**: Updated subscription count test from 2 to 3

### Features:
- Reports platform info (OS, WSL version, WSLg, display server, PowerShell path)
- Reports clipboard reader availability for each reader in the fallback chain
- Reports detected clipboard format (with graceful error handling)
- Reports storage config (workspace folder, image folder, image count, organization mode)
- Reports all extension settings
- Reports terminal info (active shell type, remote context)
- Output as formatted Markdown opened in a new editor tab

### Test results: 516 tests pass across 19 test files. Compile succeeds.
