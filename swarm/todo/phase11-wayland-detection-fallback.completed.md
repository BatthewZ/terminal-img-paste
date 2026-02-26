# Phase 11: Wayland Detection Fallback

## Problem

The current `detectDisplayServer()` in `src/platform/detect.ts` only checks `XDG_SESSION_TYPE` to determine if the user is on Wayland. However, some Wayland environments (e.g., GNOME on Wayland in containers, some compositors, or when launching VS Code from a different session context) may not have `XDG_SESSION_TYPE` set. In these cases, `displayServer` falls back to `"unknown"`, and `LinuxClipboardReader` defaults to `xclip`, which **will not work on Wayland**.

This is a real usability bug: users on Wayland with unset `XDG_SESSION_TYPE` silently get the wrong clipboard tool, see "xclip not found" or get empty reads, with no indication that they should install `wl-clipboard` instead.

## Solution

Add a fallback check for the `WAYLAND_DISPLAY` environment variable. This variable is set by Wayland compositors (Sway, GNOME/Mutter, KDE/KWin) and is a reliable indicator that the session is running under Wayland.

## Implementation

### Task 1: Update `detectDisplayServer()` in `src/platform/detect.ts`

**File:** `src/platform/detect.ts` — `detectDisplayServer()` function (lines 32-49)

Change the logic to:
```typescript
function detectDisplayServer(
  os: PlatformInfo["os"],
  isWSL: boolean
): PlatformInfo["displayServer"] {
  if (os !== "linux" || isWSL) {
    return "unknown";
  }

  const sessionType = process.env.XDG_SESSION_TYPE;

  if (sessionType === "wayland") {
    return "wayland";
  }
  if (sessionType === "x11") {
    return "x11";
  }

  // Fallback: WAYLAND_DISPLAY is set by Wayland compositors even when
  // XDG_SESSION_TYPE is absent (containers, some desktop environments, etc.)
  if (process.env.WAYLAND_DISPLAY) {
    return "wayland";
  }

  return "unknown";
}
```

### Task 2: Update tests in `test/platform.test.ts`

Add new test cases to the `detectDisplayServer` describe block. These can be implemented in parallel with Task 1:

**New tests to add:**
1. `"returns 'wayland' when XDG_SESSION_TYPE is unset but WAYLAND_DISPLAY is set"` — Set `WAYLAND_DISPLAY=wayland-0`, delete `XDG_SESSION_TYPE`, expect `displayServer === "wayland"`
2. `"prefers XDG_SESSION_TYPE=x11 over WAYLAND_DISPLAY"` — Set both `XDG_SESSION_TYPE=x11` and `WAYLAND_DISPLAY=wayland-0`, expect `displayServer === "x11"` (XDG_SESSION_TYPE should take priority)
3. `"returns 'unknown' when neither XDG_SESSION_TYPE nor WAYLAND_DISPLAY is set"` — Delete both env vars, expect `displayServer === "unknown"`
4. `"ignores WAYLAND_DISPLAY on WSL"` — Set `WAYLAND_DISPLAY=wayland-0` with WSL proc version, expect `displayServer === "unknown"`

**Important:** Tests must also save/restore `WAYLAND_DISPLAY` in `beforeEach`/`afterEach`, similar to how `XDG_SESSION_TYPE` is currently handled.

### Task 3: Rebuild the dist bundle

After making changes, run:
```bash
npm run compile
```

### Task 4: Run tests

Verify all existing + new tests pass:
```bash
npm test
```

## Notes for implementer

- Tasks 1 and 2 can be done in parallel using subagents, since they edit different files.
- Task 3 and 4 must run sequentially after Tasks 1 and 2 complete.
- The `PlatformInfo shape` tests may also need updating — the "native linux with wayland" test currently sets `XDG_SESSION_TYPE`, which is fine, but consider adding a shape test for "native linux with WAYLAND_DISPLAY fallback".

## Completion Notes (agent b47bc2a3)

All 4 tasks completed successfully:

1. **detect.ts updated** — Added `WAYLAND_DISPLAY` fallback check after the `XDG_SESSION_TYPE` checks, before the final `return "unknown"`.
2. **Tests added** — 5 new test cases in `test/platform.test.ts`:
   - `"returns 'wayland' when XDG_SESSION_TYPE is unset but WAYLAND_DISPLAY is set"`
   - `"prefers XDG_SESSION_TYPE=x11 over WAYLAND_DISPLAY"`
   - `"returns 'unknown' when neither XDG_SESSION_TYPE nor WAYLAND_DISPLAY is set"`
   - `"ignores WAYLAND_DISPLAY on WSL"`
   - `"returns a complete PlatformInfo object for native linux with WAYLAND_DISPLAY fallback"` (shape test)
   - Also updated `beforeEach`/`afterEach` to save/restore `WAYLAND_DISPLAY`, and ensured existing tests that expect `"unknown"` explicitly clear `WAYLAND_DISPLAY`.
3. **Dist bundle rebuilt** — `npm run compile` succeeded.
4. **All 151 tests pass** — including 34 platform tests (up from 29).
