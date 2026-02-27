# Phase 24: Configurable Filename Patterns

## Priority: P2 — Nice UX improvement
## Dependencies: None (all prerequisite phases completed)

## Overview

Let users control how pasted images are named via a configurable pattern string with placeholders. Currently all images use a hardcoded `img-{timestamp}` pattern. This phase adds a `terminalImgPaste.filenamePattern` setting that supports multiple placeholder types.

## New Setting

```
terminalImgPaste.filenamePattern: string
Default: "img-{timestamp}"
```

Available placeholders:
- `{timestamp}` — ISO-like timestamp, e.g. `2026-02-27T14-30-45-123` (current behavior)
- `{date}` — Date only, e.g. `2026-02-27`
- `{time}` — Time only, e.g. `14-30-45`
- `{n}` — Auto-incrementing sequential number (scans existing files in the image folder)
- `{hash}` — First 8 characters of image content SHA-256 hash

## Implementation Tasks

### Task 1: Add configuration schema to package.json

**File:** `package.json`

Add the new setting to `contributes.configuration.properties`:

```json
"terminalImgPaste.filenamePattern": {
  "type": "string",
  "default": "img-{timestamp}",
  "description": "Filename pattern for saved images. Placeholders: {timestamp}, {date}, {time}, {n}, {hash}"
}
```

### Task 2: Implement filename pattern resolution in imageStore

**File:** `src/storage/imageStore.ts`

Refactor the filename generation logic:

1. Add a new function `resolveFilenamePattern(pattern: string, imageBuffer: Buffer, existingFiles: string[]): string` that:
   - Replaces `{timestamp}` with the current ISO-like timestamp (existing logic)
   - Replaces `{date}` with `YYYY-MM-DD` format
   - Replaces `{time}` with `HH-mm-ss` format
   - Replaces `{n}` with the next sequential number by scanning `existingFiles` for the highest existing number matching the pattern prefix
   - Replaces `{hash}` with first 8 chars of `crypto.createHash('sha256').update(imageBuffer).digest('hex')`

2. Add pattern validation: if pattern contains none of `{timestamp}`, `{n}`, or `{hash}`, log a warning that filenames may collide (since `{date}` and `{time}` alone are not granular enough for rapid pastes).

3. Update the `save()` method to:
   - Read the `filenamePattern` setting from `vscode.workspace.getConfiguration('terminalImgPaste')`
   - List existing files in the target directory
   - Call `resolveFilenamePattern()` with the pattern, image buffer, and existing file list
   - Append the correct file extension based on the format parameter

4. Handle edge cases:
   - Empty pattern string: fall back to default `"img-{timestamp}"`
   - Pattern with no placeholders at all: append a timestamp to avoid collisions
   - `{n}` collision: if the computed filename already exists, increment `{n}` until a unique name is found

### Task 3: Update tests

**File:** `test/imageStore.test.ts` (update existing)

Add test cases for the new filename pattern logic:

- Default pattern produces same behavior as before (backward compatibility)
- `{date}` placeholder resolves to correct date format
- `{time}` placeholder resolves to correct time format
- `{n}` placeholder auto-increments based on existing files
- `{n}` handles gaps in sequence (e.g., files 1, 2, 5 → next is 6)
- `{hash}` placeholder produces consistent 8-char hex string for same content
- `{hash}` produces different values for different content
- Combined pattern like `screenshot-{date}-{n}` works correctly
- Warning logged when pattern lacks uniqueness placeholders
- Empty pattern falls back to default
- Pattern with no placeholders gets timestamp appended
- File extension is correctly appended after pattern resolution

**File:** `test/imageStore.integration.test.ts` (update existing)

Add an integration test:
- Save multiple images with `{n}` pattern, verify sequential numbering on real filesystem
- Save with `{hash}` pattern, verify content-addressed naming

### Task 4: Build verification

Run `npm run compile` and `npm test` to verify everything passes.

## Suggested Subagent Strategy

This phase is small enough to be done by a single agent, but if parallelization is desired:

- **Subagent A:** Implement Task 1 (package.json) + Task 2 (imageStore.ts changes)
- **Subagent B:** Implement Task 3 (tests) — can start in parallel since the test structure is well-defined from the spec above
- **Main agent:** Run Task 4 (build verification) after both subagents complete, then fix any integration issues

## Verification Checklist

- [x] `npm run compile` succeeds with no errors
- [x] `npm test` passes all existing tests (no regressions)
- [x] New tests for filename patterns pass
- [x] Default behavior unchanged (backward compatible)
- [x] `{n}` auto-increment works correctly with existing files
- [x] `{hash}` produces stable, correct hashes
- [x] Warning logged for collision-prone patterns

## Completion Notes (Agent 1d839138)

**Completed all 4 tasks:**

1. **package.json**: Added `terminalImgPaste.filenamePattern` setting with default `"img-{timestamp}"`.

2. **src/storage/imageStore.ts**:
   - Added exported `resolveFilenamePattern()` function supporting all 5 placeholders: `{timestamp}`, `{date}`, `{time}`, `{n}`, `{hash}`
   - Extracted `formatTimestamp()`, `formatDate()`, `formatTime()` helper functions
   - Added `resolveSequentialNumber()` for `{n}` placeholder (scans existing files via regex matching)
   - Updated `generateFileName()` to accept `imageBuffer` and `existingFiles` params
   - Updated `save()` to read existing files and pass them through
   - Edge cases: empty pattern falls back to default, no-placeholder patterns get timestamp appended, collision warning for patterns without uniqueness placeholders

3. **test/imageStore.test.ts**: Added 15 new unit tests covering:
   - All placeholder types individually and combined
   - Hash consistency and correctness
   - Sequential numbering with gaps
   - Edge cases (empty pattern, no placeholders, collision warnings)
   - Integration with save() method

4. **test/imageStore.integration.test.ts**: Added 2 integration tests:
   - Sequential `{n}` numbering on real filesystem (3 saves → shot-1, shot-2, shot-3)
   - Content-addressed `{hash}` naming with different content

**Results**: Build passes, lint passes, 436 tests pass (up from 419 — 17 new tests added).
