# Phase 27: Storage Organization — Date Subdirectories

## Overview

Allow images to be organized into subdirectories by date instead of all being flat in the root image folder. Adds a new `organizeFolders` configuration setting with three modes: `flat` (current behavior), `daily`, and `monthly`.

## Motivation

As users accumulate images over time, a flat folder becomes unwieldy. Date-based subdirectories keep things organized and make it easier to find or clean up images from specific time periods.

## Implementation

### 1. New Configuration Setting

**File:** `package.json`

Add to `contributes.configuration.properties`:

```json
"terminalImgPaste.organizeFolders": {
  "type": "string",
  "enum": ["flat", "daily", "monthly"],
  "default": "flat",
  "description": "How to organize saved images. 'flat' puts all images in the root folder. 'daily' creates YYYY-MM-DD subdirectories. 'monthly' creates YYYY-MM subdirectories."
}
```

### 2. Storage Logic Changes

**File:** `src/storage/imageStore.ts`

#### 2a. Add subdirectory resolution

Add a function that determines the subdirectory path based on the `organizeFolders` setting:

```typescript
type OrganizeFolders = 'flat' | 'daily' | 'monthly';

function getSubdirectory(organize: OrganizeFolders): string {
  const now = new Date();
  switch (organize) {
    case 'daily': {
      const y = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      return `${y}-${mo}-${d}`;
    }
    case 'monthly': {
      const y = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, '0');
      return `${y}-${mo}`;
    }
    case 'flat':
    default:
      return '';
  }
}
```

Note: reuse the existing `formatDate()` helper for the `daily` case if the format matches exactly (`YYYY-MM-DD`). For `monthly`, extract the date portion. The existing `formatDate()` returns `YYYY-MM-DD` so for daily we can reuse it directly, and for monthly slice off the day part.

#### 2b. Update `save()` method

In the `save()` method, after computing `folder` from `getImageFolderPath()`:

1. Read the `organizeFolders` setting
2. If not `flat`, compute the subdirectory name and append it to `folder`
3. Create the subdirectory with `mkdir({ recursive: true })`
4. Run `assertInsideWorkspace` on the final subdirectory path
5. Read files from the **subdirectory** for `{n}` placeholder resolution
6. Save the file into the subdirectory

```typescript
const organize = getConfig().get<string>('organizeFolders', 'flat') as OrganizeFolders;
const subdir = getSubdirectory(organize);
const saveFolder = subdir ? path.join(folder, subdir) : folder;
await fs.promises.mkdir(saveFolder, { recursive: true });
await assertInsideWorkspace(saveFolder, root);
```

#### 2c. Update `cleanup()` method

When `organizeFolders` is not `flat`, cleanup must:

1. **Scan recursively** — collect all image files across all subdirectories
2. **Sort globally** — sort all found image files by name (timestamps ensure chronological order)
3. **Delete excess** — remove oldest files until count is at or below `maxImages`
4. **Remove empty subdirectories** — after deletion, check if any subdirectories are now empty and remove them

Implementation approach:

```typescript
async function collectImagesRecursive(folder: string): Promise<{ filePath: string; name: string }[]> {
  const results: { filePath: string; name: string }[] = [];
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(folder, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectImagesRecursive(fullPath)));
    } else if (IMAGE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      results.push({ filePath: fullPath, name: entry.name });
    }
  }
  return results;
}

async function removeEmptyDirs(folder: string, rootFolder: string): Promise<void> {
  // Don't delete the root image folder itself
  if (folder === rootFolder) return;
  try {
    const remaining = await fs.promises.readdir(folder);
    if (remaining.length === 0) {
      await fs.promises.rmdir(folder);
      logger.info(`Removed empty directory: ${folder}`);
    }
  } catch {
    // Ignore errors during cleanup
  }
}
```

Update the `cleanup()` method:

```typescript
async cleanup(): Promise<void> {
  const config = getConfig();
  const rawMaxImages = config.get<number>('maxImages', 20);
  const maxImages = Number.isInteger(rawMaxImages) && rawMaxImages > 0 ? rawMaxImages : 20;
  const organize = config.get<string>('organizeFolders', 'flat') as OrganizeFolders;
  const folder = getImageFolderPath();

  if (organize === 'flat') {
    // Existing flat cleanup logic (unchanged)
    ...
  } else {
    // Recursive cleanup
    const allImages = await collectImagesRecursive(folder);
    allImages.sort((a, b) => a.name.localeCompare(b.name));

    if (allImages.length <= maxImages) return;

    const toDelete = allImages.slice(0, allImages.length - maxImages);
    const affectedDirs = new Set<string>();

    for (const img of toDelete) {
      try {
        await fs.promises.unlink(img.filePath);
        logger.info(`Deleted old image: ${img.filePath}`);
        affectedDirs.add(path.dirname(img.filePath));
      } catch (err) {
        logger.warn(`Failed to delete old image: ${img.filePath}`, err);
      }
    }

    // Clean up empty subdirectories
    for (const dir of affectedDirs) {
      await removeEmptyDirs(dir, folder);
    }
  }
}
```

### 3. `.gitignore` — No Changes Needed

The existing `.gitignore` entry for the image folder (e.g., `.tip-images`) already covers all subdirectories. No changes needed.

### 4. Tests

**File:** `test/imageStore.test.ts` — add new describe block

Tests to add (spawn a subagent for test writing in parallel with implementation if appropriate):

#### Unit tests for `getSubdirectory`:
- `flat` mode returns empty string
- `daily` mode returns `YYYY-MM-DD` format
- `monthly` mode returns `YYYY-MM` format
- Invalid/unknown values fall back to flat behavior

#### Integration tests for `save()` with subdirectories:
- **`daily` mode**: saving creates the correct date subdirectory and file is inside it
- **`monthly` mode**: saving creates the correct month subdirectory and file is inside it
- **`flat` mode**: saving behaves as before (no subdirectory)
- Symlink escape check still applies to subdirectory paths

#### Integration tests for `cleanup()` with subdirectories:
- Cleanup scans across multiple subdirectories and deletes oldest globally
- After cleanup, empty subdirectories are removed
- Non-empty subdirectories are preserved
- Mixed flat and subdirectory files (shouldn't happen in practice, but defensive)

#### Integration tests for empty directory removal:
- Root image folder is never deleted even when empty
- Only leaf subdirectories that become empty are removed

**File:** `test/imageStore.integration.test.ts` — add real filesystem tests

- Create temp dirs with dated subdirectories, populate with dummy images, run cleanup, verify correct files remain and empty dirs removed

## Implementation Strategy

Use **two parallel subagents**:

1. **Subagent A: Core implementation**
   - Add `organizeFolders` setting to `package.json`
   - Implement `getSubdirectory()`, `collectImagesRecursive()`, `removeEmptyDirs()` in `imageStore.ts`
   - Update `save()` to use subdirectories
   - Update `cleanup()` to handle recursive scanning and empty dir removal

2. **Subagent B: Tests** (can start once interface is defined)
   - Add unit tests for subdirectory logic to `test/imageStore.test.ts`
   - Add integration tests to `test/imageStore.integration.test.ts`

After both complete, run full test suite and build to verify.

## Acceptance Criteria

1. `npm run compile` succeeds with no errors
2. All existing tests continue to pass (no regressions)
3. New tests pass for all three `organizeFolders` modes
4. Cleanup correctly scans subdirectories recursively and removes empty dirs
5. `npx eslint src/` reports no errors
6. Default behavior (`flat`) is unchanged — fully backward compatible

## Completion Notes (Agent 661b9b60)

All acceptance criteria verified:
- `npm run compile` → Build complete, no errors
- `npm run lint` → No lint errors
- 470 tests pass (all 436 existing + 34 new tests)
- All three modes work: `flat` (default, backward-compatible), `daily`, `monthly`

### Changes made:

**`package.json`** — Added `terminalImgPaste.organizeFolders` config setting (enum: flat/daily/monthly, default: flat)

**`src/storage/imageStore.ts`**:
- Added `OrganizeFolders` type export
- Added `getSubdirectory()` (exported for testing) — computes subdirectory name from date, reuses existing `formatDate()`
- Added `collectImagesRecursive()` — recursively collects all image files across subdirectories
- Added `removeEmptyDirs()` — removes empty subdirectories after cleanup (never removes root folder)
- Updated `save()` — creates date subdirectory when organize mode is not flat, reads files from subdirectory for `{n}` resolution, runs `assertInsideWorkspace` on subdirectory path
- Updated `cleanup()` — flat mode uses original logic; non-flat mode scans recursively, sorts globally, deletes oldest, and cleans up empty directories

**`test/imageStore.test.ts`** (unit tests added):
- `getSubdirectory()` — flat/daily/monthly modes, unknown value fallback, zero-padding
- `save()` with organizeFolders — daily/monthly/flat modes create correct paths
- `cleanup()` with organizeFolders — flat uses old logic, daily scans recursively, removes empty dirs, preserves root

**`test/imageStore.integration.test.ts`** (integration tests added):
- Real filesystem tests for daily/monthly/flat save modes
- Cleanup across subdirectories deletes oldest globally
- Empty subdirectory removal after cleanup
- Non-empty subdirectory preservation
- Sequential `{n}` pattern works within subdirectories
