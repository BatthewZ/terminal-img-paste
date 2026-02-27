# Phase 20: Clipboard Tool Fallback Chains — Completed

## Summary
Implemented clipboard tool fallback chains so that when the preferred clipboard tool fails or is unavailable, the extension tries alternative readers in sequence.

## Changes Made

### New files:
- `src/clipboard/fallback.ts` — FallbackClipboardReader class
- `src/clipboard/macosOsascriptClipboard.ts` — macOS osascript fallback reader
- `test/fallback.test.ts` — 17 unit tests

### Modified files:
- `src/clipboard/index.ts` — Factory returns fallback chains
- `src/platform/detect.ts` — WSLg display server detection
- `test/clipboard.test.ts` — Updated factory + new osascript tests
- `test/platform.test.ts` — Updated WSL display server tests

## Fallback Chains:
- **macOS**: pngpaste → osascript (built-in)
- **Linux**: detected display server → opposite display server
- **WSL**: PowerShell → Linux reader (if WSLg detected)
- **Windows**: PowerShell only (no fallback needed)

## Test Results:
- 288 tests pass across 10 test files
- Lint passes
- Compile passes
