# Bug: Empty buffer for unknown format bypasses validation and creates zero-byte file

## Severity
Low

## Description

In `src/storage/imageStore.ts`, the `validateImage()` function (lines 86-88) skips validation when `format` is `'unknown'`:

```typescript
case 'unknown':
  logger.warn('Skipping image validation for unknown format');
  break;
```

If a clipboard reader returns a zero-length buffer with `format: 'unknown'`, the flow continues to `imageStore.save()`, and a zero-byte file is written to disk. This is unlikely in practice but represents a gap in input validation.

## Affected code

- `src/storage/imageStore.ts` lines 86-88: `validateImage()` case for `unknown`
- `src/storage/imageStore.ts` line 310: `save()` calls `validateImage()` without additional size check

## Fix

Add a minimum buffer length check before the format-specific validation:

```typescript
async save(imageBuffer: Buffer, format: ClipboardFormat = 'png'): Promise<string> {
  if (imageBuffer.length === 0) {
    throw new Error('Cannot save empty image data');
  }
  validateImage(imageBuffer, format);
  // ...
}
```

## Tests to add

1. Test that `save()` throws when given a zero-length buffer with `unknown` format
2. Test that `save()` throws when given a zero-length buffer with any format

## Dependencies
None
