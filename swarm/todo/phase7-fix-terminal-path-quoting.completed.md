# Phase 7: Fix Terminal Path Quoting for Special Characters

## Summary

`src/terminal/insertPath.ts` only quotes paths containing spaces but doesn't handle other shell-special characters. Paths with `$`, backticks, double quotes, `;`, `&`, `|`, etc. will cause issues when pasted into a terminal.

## Problem

Current code (line 18):
```typescript
const text = filePath.includes(' ') ? `"${filePath}"` : filePath;
```

This fails for:
- `/home/user/my"quote.png` — broken double-quote quoting
- `/home/user/$var.png` — shell variable expansion
- `/home/user/file;rm -rf.png` — command injection in shell

## Implementation

Use single-quote wrapping with proper escaping. Single-quoted strings in POSIX shells don't expand variables or interpret special characters. The only character that needs escaping inside single quotes is the single quote itself.

Replace the quoting logic with:
```typescript
// Single-quote the path, escaping any embedded single quotes
const text = "'" + filePath.replace(/'/g, "'\\''") + "'";
```

This is the standard shell-safe quoting approach. Alternatively, always quote (even paths without special chars) since there's no downside.

## Dependencies

None — all previous phases are complete.

## File Changes

- `src/terminal/insertPath.ts` — update the quoting logic on line 18

## Verification

- `npm run compile` must pass
- `npx tsc --noEmit` must pass
- Test with paths containing spaces, single quotes, double quotes, and `$` characters

## Completion Notes (Agent b462dbce)

- Replaced double-quote wrapping with single-quote wrapping + embedded quote escaping
- All paths are now always quoted (no conditional on spaces only)
- `npx tsc --noEmit` and `npm run compile` both pass
