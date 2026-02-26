# Phase 3: Clipboard Readers

## Overview

Implement all platform-specific clipboard readers that detect whether the clipboard contains an image and read the image data as a `Buffer`. Each reader wraps a platform-native CLI tool via the existing `exec`/`execBuffer` utilities from `src/util/exec.ts` and conforms to a shared `ClipboardReader` interface. A factory function selects the correct reader based on the `PlatformInfo` from `src/platform/detect.ts`.

## Files to Create

### 1. `src/clipboard/types.ts` — ClipboardReader interface

```ts
export interface ClipboardReader {
  /** Human-readable name of the required CLI tool (e.g. "pngpaste", "xclip") */
  requiredTool(): string;

  /** Check whether the required CLI tool is installed and accessible */
  isToolAvailable(): Promise<boolean>;

  /** Check whether the clipboard currently contains image data */
  hasImage(): Promise<boolean>;

  /** Read image data from the clipboard and return it as a PNG Buffer.
   *  Throws if no image is available. */
  readImage(): Promise<Buffer>;
}
```

### 2. `src/clipboard/macosClipboard.ts` — macOS reader (pngpaste)

- `requiredTool()` → `"pngpaste"`
- `isToolAvailable()` → run `which pngpaste`, return true if exit 0
- `hasImage()` → run `osascript -e 'clipboard info'`, check if output contains `«class PNGf»` or `«class TIFF»`
- `readImage()` → run `pngpaste -` (outputs PNG to stdout), use `execBuffer` to capture the binary data

### 3. `src/clipboard/linuxClipboard.ts` — Linux reader (X11 + Wayland)

Takes `displayServer` from `PlatformInfo` to branch behavior:

**X11 path (`xclip`):**
- `requiredTool()` → `"xclip"`
- `isToolAvailable()` → run `which xclip`
- `hasImage()` → run `xclip -selection clipboard -t TARGETS -o`, check if output contains `image/png`
- `readImage()` → run `xclip -selection clipboard -t image/png -o`, capture with `execBuffer`

**Wayland path (`wl-paste`):**
- `requiredTool()` → `"wl-clipboard (wl-paste)"`
- `isToolAvailable()` → run `which wl-paste`
- `hasImage()` → run `wl-paste --list-types`, check if output contains `image/png`
- `readImage()` → run `wl-paste --type image/png`, capture with `execBuffer`

Implementation: single class `LinuxClipboardReader` that accepts the `displayServer` value and branches internally. Constructor should default to X11 if `displayServer` is `"unknown"`.

### 4. `src/clipboard/windowsClipboard.ts` — Windows reader (PowerShell)

- `requiredTool()` → `"PowerShell (built-in)"`
- `isToolAvailable()` → run `powershell.exe -Command "echo ok"`, return true if succeeds
- `hasImage()` → run PowerShell script:
  ```powershell
  Add-Type -AssemblyName System.Windows.Forms; if ([System.Windows.Forms.Clipboard]::ContainsImage()) { echo 'yes' } else { echo 'no' }
  ```
- `readImage()` → run PowerShell script that gets the clipboard image, saves to a temp file as PNG, then outputs the temp file path. Read the file from Node.js and return as Buffer. Clean up the temp file after reading.

PowerShell script for readImage:
```powershell
Add-Type -AssemblyName System.Windows.Forms
$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($img -eq $null) { exit 1 }
$tmp = [System.IO.Path]::GetTempFileName() + '.png'
$img.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output $tmp
```

### 5. `src/clipboard/wslClipboard.ts` — WSL2 reader

Similar to Windows, but invokes PowerShell from WSL. Uses `powershellPath` from `PlatformInfo`.

- `requiredTool()` → `"PowerShell (via WSL interop)"`
- `isToolAvailable()` → run `<powershellPath> -Command "echo ok"`
- `hasImage()` → same PowerShell script as Windows, invoked via `powershellPath`
- `readImage()` → same PowerShell script as Windows. The output path will be a Windows path (e.g. `C:\Users\...\tmp.png`). Convert it to a WSL path using `wslpath -u <windowsPath>`, then read the file, then clean up.

Constructor takes the full `PlatformInfo` to get `powershellPath`.

### 6. `src/clipboard/index.ts` — Factory / dispatcher

```ts
import { PlatformInfo } from '../platform/detect';
import { ClipboardReader } from './types';

export function createClipboardReader(platform: PlatformInfo): ClipboardReader {
  if (platform.isWSL) {
    return new WslClipboardReader(platform);
  }
  switch (platform.os) {
    case 'macos':
      return new MacosClipboardReader();
    case 'windows':
      return new WindowsClipboardReader();
    case 'linux':
      return new LinuxClipboardReader(platform.displayServer);
  }
}
```

Re-export `ClipboardReader` type from this module for convenience.

## Implementation Notes

- All readers must use `exec` or `execBuffer` from `src/util/exec.ts` — never `child_process` directly.
- All readers should catch errors from missing tools and throw descriptive messages telling the user how to install the required tool.
- The `hasImage()` method should never throw — return `false` if the tool is missing or the clipboard is empty.
- The `readImage()` method should throw a clear error if no image is in the clipboard.
- For Windows/WSL `readImage()`, use `fs.promises.readFile` to read the temp file, and `fs.promises.unlink` to clean up (in a finally block).

## Parallelization Strategy

**Use subagents for parallel implementation.** The clipboard readers for each platform are fully independent of each other. Spawn up to 4 subagents:

1. **Subagent A**: Create `src/clipboard/types.ts` and `src/clipboard/macosClipboard.ts`
2. **Subagent B**: Create `src/clipboard/linuxClipboard.ts`
3. **Subagent C**: Create `src/clipboard/windowsClipboard.ts` and `src/clipboard/wslClipboard.ts` (they share the PowerShell approach)
4. **Subagent D**: Create `src/clipboard/index.ts` (depends on the types file, but only needs the interface — can be written in parallel using the spec above)

After all subagents complete, verify the build compiles with `npm run compile`.

## Acceptance Criteria

- [ ] All 6 files exist under `src/clipboard/`
- [ ] `ClipboardReader` interface is properly defined with all 4 methods
- [ ] Each platform reader correctly implements the interface
- [ ] Factory function returns the correct reader for each platform
- [ ] `npm run compile` succeeds with no TypeScript errors
- [ ] No direct `child_process` imports — all execution goes through `src/util/exec.ts`

---

## Completion Notes (Agent 0e31cea0, Task a5dcade3)

All 6 files created successfully under `src/clipboard/`:

1. **src/clipboard/types.ts** — `ClipboardReader` interface with 4 methods: `requiredTool()`, `isToolAvailable()`, `hasImage()`, `readImage()`.

2. **src/clipboard/macosClipboard.ts** — `MacosClipboardReader` using `pngpaste`. Checks clipboard via `osascript` for `«class PNGf»`/`«class TIFF»`, reads image via `pngpaste -` (execBuffer).

3. **src/clipboard/linuxClipboard.ts** — `LinuxClipboardReader` supporting both X11 (xclip) and Wayland (wl-paste). Constructor takes `displayServer`, defaults to X11 for `"unknown"`. Branches internally via private `isWayland()` helper.

4. **src/clipboard/windowsClipboard.ts** — `WindowsClipboardReader` using PowerShell. Saves clipboard image to temp PNG file via PowerShell, reads with `fs.promises.readFile`, cleans up in `finally` block.

5. **src/clipboard/wslClipboard.ts** — `WslClipboardReader` taking `PlatformInfo`. Same PowerShell approach as Windows but uses configurable `powershellPath` and converts Windows paths to WSL paths via `wslpath -u`.

6. **src/clipboard/index.ts** — Factory function `createClipboardReader(platform)` that selects the correct reader. Checks `isWSL` first, then switches on `platform.os`. Re-exports `ClipboardReader` type.

### Issues Found and Fixed (Iteration 3)

On review, `tsc --noEmit` revealed 14 TypeScript errors that esbuild silently ignored:

1. **macosClipboard.ts & linuxClipboard.ts**: `exec()` and `execBuffer()` were called with a single string (e.g. `exec("which pngpaste")`) instead of the required `(command, args[])` signature. Since `execFile` is used (not shell), this would fail at runtime.

2. **macosClipboard.ts**: `output.includes(...)` was called on the `ExecResult` object instead of `output.stdout`.

3. **macosClipboard.ts & linuxClipboard.ts**: `execBuffer(...)` returns `ExecBufferResult` (with `.stdout: Buffer`), not `Buffer` directly. Fixed to destructure `{ stdout }`.

4. **windowsClipboard.ts**: Unused `execBuffer` import removed.

All issues fixed. Both files rewritten with correct `exec(command, args[])` signatures and proper destructuring.

### Verification
- `npx tsc --noEmit` → 0 errors (strict type checking)
- `npm run compile` → Build complete, no errors
- `npm run lint` → 0 errors, 0 warnings
- All 6 files exist under `src/clipboard/`
- No direct `child_process` imports in clipboard module — all execution goes through `src/util/exec.ts`
- All readers implement `ClipboardReader` interface correctly
- `hasImage()` methods never throw (catch errors, return false)
- `readImage()` methods throw descriptive errors when no image is available
- Windows/WSL readers use `fs.promises.readFile`/`unlink` with `finally` cleanup
