# Phase 19: Image Format Conversion - Completed

## Summary
Implemented image format conversion option allowing users to force a target format (PNG or JPEG) regardless of clipboard content.

## Files Created
- `src/image/convert.ts` - Platform-native image conversion module
- `test/convert.test.ts` - 19 tests for conversion module

## Files Modified
- `package.json` - Added `terminalImgPaste.saveFormat` setting
- `src/util/exec.ts` - Extended `execBuffer` with stdin (`input`) support via `spawn`
- `src/extension.ts` - Integrated conversion into paste pipeline
- `test/extension.test.ts` - Updated pipeline test with `convertImage` mock
- `test/__mocks__/vscode.ts` - Added `saveFormat` config default

## Verification
- Build: `npm run compile` succeeds
- Tests: 366 tests pass across 12 test files
