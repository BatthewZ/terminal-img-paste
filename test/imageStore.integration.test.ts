import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { workspace } from 'vscode';

import { createImageStore } from '../src/storage/imageStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let tmpDir: string;
let configValues: Record<string, unknown>;

function resetConfig(): void {
  configValues = {
    folderName: '.tip-images',
    maxImages: 20,
    autoGitIgnore: true,
    sendNewline: false,
    filenamePattern: 'img-{timestamp}',
  };
}

function setConfig(key: string, value: unknown): void {
  configValues[key] = value;
}

function setupVscodeMock(): void {
  (workspace as any).workspaceFolders = [{ uri: { fsPath: tmpDir } }];
  vi.mocked(workspace.getConfiguration).mockImplementation(
    () =>
      ({
        get: vi.fn(<T>(key: string, defaultValue?: T): T => {
          const val = configValues[key];
          return (val !== undefined ? val : defaultValue) as T;
        }),
      }) as any,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tip-integration-'));
  resetConfig();
  setupVscodeMock();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Integration tests — real filesystem
// ---------------------------------------------------------------------------
/** A minimal buffer that passes PNG magic-byte validation. */
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function fakePng(body: string): Buffer {
  return Buffer.concat([PNG_HEADER, Buffer.from(body)]);
}

describe('imageStore integration (real fs)', () => {
  it('save creates the image directory if it does not exist', async () => {
    const store = createImageStore();
    await store.save(fakePng('fake-png'));

    const imageDir = path.join(tmpDir, '.tip-images');
    expect(fs.existsSync(imageDir)).toBe(true);
  });

  it('save writes a real file with correct contents', async () => {
    const store = createImageStore();
    const data = fakePng('PNG-DATA-12345');
    const filePath = await store.save(data);

    const contents = fs.readFileSync(filePath);
    expect(contents).toEqual(data);
  });

  it('save returns an absolute path that exists on disk', async () => {
    const store = createImageStore();
    const filePath = await store.save(fakePng('img'));

    expect(path.isAbsolute(filePath)).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('cleanup deletes oldest files when exceeding maxImages', async () => {
    setConfig('maxImages', 2);
    const store = createImageStore();

    // Create 4 files manually with known sorted names
    const imageDir = path.join(tmpDir, '.tip-images');
    fs.mkdirSync(imageDir, { recursive: true });
    fs.writeFileSync(path.join(imageDir, 'img-2026-01-01T00-00-00-000.png'), 'old1');
    fs.writeFileSync(path.join(imageDir, 'img-2026-01-02T00-00-00-000.png'), 'old2');
    fs.writeFileSync(path.join(imageDir, 'img-2026-01-03T00-00-00-000.png'), 'new1');

    // Save one more → triggers cleanup, now 4 png files total, maxImages=2
    await store.save(fakePng('newest'));

    const remaining = fs.readdirSync(imageDir).filter((f) => f.endsWith('.png'));
    expect(remaining).toHaveLength(2);

    // The two oldest should be gone
    expect(fs.existsSync(path.join(imageDir, 'img-2026-01-01T00-00-00-000.png'))).toBe(false);
    expect(fs.existsSync(path.join(imageDir, 'img-2026-01-02T00-00-00-000.png'))).toBe(false);
  });

  it('cleanup does not delete non-png files', async () => {
    setConfig('maxImages', 1);
    const store = createImageStore();

    const imageDir = path.join(tmpDir, '.tip-images');
    fs.mkdirSync(imageDir, { recursive: true });
    fs.writeFileSync(path.join(imageDir, 'readme.txt'), 'keep me');
    fs.writeFileSync(path.join(imageDir, 'img-2026-01-01T00-00-00-000.png'), 'old');

    await store.save(fakePng('new'));

    // readme.txt should still exist
    expect(fs.existsSync(path.join(imageDir, 'readme.txt'))).toBe(true);
  });

  it('ensureGitIgnored creates .gitignore with folder name', async () => {
    const store = createImageStore();
    await store.save(fakePng('img'));

    const gitignorePath = path.join(tmpDir, '.gitignore');
    expect(fs.existsSync(gitignorePath)).toBe(true);
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('.tip-images');
  });

  it('ensureGitIgnored appends to existing .gitignore', async () => {
    // Pre-create a .gitignore
    const gitignorePath = path.join(tmpDir, '.gitignore');
    fs.writeFileSync(gitignorePath, 'node_modules\n', 'utf-8');

    const store = createImageStore();
    await store.save(fakePng('img'));

    const content = fs.readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('node_modules');
    expect(content).toContain('.tip-images');
  });

  it('save with jpeg format writes a .jpg file', async () => {
    const store = createImageStore();
    const jpegData = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const filePath = await store.save(jpegData, 'jpeg');

    expect(filePath).toMatch(/\.jpg$/);
    expect(path.isAbsolute(filePath)).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
    const contents = fs.readFileSync(filePath);
    expect(contents).toEqual(jpegData);
  });

  it('cleanup includes non-png image files in count', async () => {
    setConfig('maxImages', 2);
    const store = createImageStore();

    const imageDir = path.join(tmpDir, '.tip-images');
    fs.mkdirSync(imageDir, { recursive: true });
    fs.writeFileSync(path.join(imageDir, 'img-2026-01-01T00-00-00-000.jpg'), 'old-jpeg');
    fs.writeFileSync(path.join(imageDir, 'img-2026-01-02T00-00-00-000.webp'), 'old-webp');
    fs.writeFileSync(path.join(imageDir, 'img-2026-01-03T00-00-00-000.png'), 'newer-png');

    // Save one more → 4 image files total, maxImages=2 → delete 2 oldest
    await store.save(fakePng('newest'));

    const remaining = fs.readdirSync(imageDir);
    const imageFiles = remaining.filter((f) =>
      ['.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.webp'].some((ext) => f.endsWith(ext)),
    );
    expect(imageFiles).toHaveLength(2);
    expect(fs.existsSync(path.join(imageDir, 'img-2026-01-01T00-00-00-000.jpg'))).toBe(false);
    expect(fs.existsSync(path.join(imageDir, 'img-2026-01-02T00-00-00-000.webp'))).toBe(false);
  });

  it('consecutive saves generate distinct filenames', async () => {
    const store = createImageStore();
    const path1 = await store.save(fakePng('img1'));

    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 5));

    const path2 = await store.save(fakePng('img2'));

    expect(path1).not.toBe(path2);
    expect(fs.existsSync(path1)).toBe(true);
    expect(fs.existsSync(path2)).toBe(true);
  });

  it('save with {n} pattern produces sequential numbering on real filesystem', async () => {
    setConfig('filenamePattern', 'shot-{n}');
    const store = createImageStore();

    const p1 = await store.save(fakePng('first'));
    const p2 = await store.save(fakePng('second'));
    const p3 = await store.save(fakePng('third'));

    expect(p1).toMatch(/shot-1\.png$/);
    expect(p2).toMatch(/shot-2\.png$/);
    expect(p3).toMatch(/shot-3\.png$/);
    expect(fs.existsSync(p1)).toBe(true);
    expect(fs.existsSync(p2)).toBe(true);
    expect(fs.existsSync(p3)).toBe(true);
  });

  it('save with {hash} pattern produces content-addressed naming', async () => {
    setConfig('filenamePattern', 'img-{hash}');
    const store = createImageStore();

    const data1 = fakePng('content-aaa');
    const data2 = fakePng('content-bbb');

    const p1 = await store.save(data1);
    const p2 = await store.save(data2);

    expect(p1).toMatch(/img-[0-9a-f]{8}\.png$/);
    expect(p2).toMatch(/img-[0-9a-f]{8}\.png$/);
    expect(p1).not.toBe(p2);
    expect(fs.existsSync(p1)).toBe(true);
    expect(fs.existsSync(p2)).toBe(true);
  });
});

describe('imageStore integration — organizeFolders (real fs)', () => {
  it('daily mode creates YYYY-MM-DD subdirectory and file inside it', async () => {
    setConfig('organizeFolders', 'daily');
    const store = createImageStore();

    const filePath = await store.save(fakePng('daily-img'));

    expect(path.isAbsolute(filePath)).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);

    // File should be inside a date subdirectory
    const relPath = path.relative(tmpDir, filePath);
    expect(relPath).toMatch(/^\.tip-images[/\\]\d{4}-\d{2}-\d{2}[/\\]img-.*\.png$/);
  });

  it('monthly mode creates YYYY-MM subdirectory and file inside it', async () => {
    setConfig('organizeFolders', 'monthly');
    const store = createImageStore();

    const filePath = await store.save(fakePng('monthly-img'));

    expect(fs.existsSync(filePath)).toBe(true);
    const relPath = path.relative(tmpDir, filePath);
    expect(relPath).toMatch(/^\.tip-images[/\\]\d{4}-\d{2}[/\\]img-.*\.png$/);
  });

  it('flat mode does not create subdirectories', async () => {
    setConfig('organizeFolders', 'flat');
    const store = createImageStore();

    const filePath = await store.save(fakePng('flat-img'));

    const relPath = path.relative(tmpDir, filePath);
    expect(relPath).toMatch(/^\.tip-images[/\\]img-.*\.png$/);
    // No subdirectory — the parent should be .tip-images directly
    expect(path.dirname(relPath)).toBe('.tip-images');
  });

  it('cleanup scans across subdirectories and deletes oldest globally', async () => {
    setConfig('maxImages', 2);
    setConfig('organizeFolders', 'daily');

    const imageDir = path.join(tmpDir, '.tip-images');

    // Create subdirectories with images
    const dir1 = path.join(imageDir, '2026-01-01');
    const dir2 = path.join(imageDir, '2026-01-02');
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });

    fs.writeFileSync(path.join(dir1, 'img-2026-01-01T00-00-00-000.png'), 'old1');
    fs.writeFileSync(path.join(dir1, 'img-2026-01-01T12-00-00-000.png'), 'old2');
    fs.writeFileSync(path.join(dir2, 'img-2026-01-02T00-00-00-000.png'), 'newer');

    // Save one more → triggers cleanup. 4 total, maxImages=2 → delete 2 oldest
    const store = createImageStore();
    await store.save(fakePng('newest'));

    // The two oldest images from dir1 should be gone
    expect(fs.existsSync(path.join(dir1, 'img-2026-01-01T00-00-00-000.png'))).toBe(false);
    expect(fs.existsSync(path.join(dir1, 'img-2026-01-01T12-00-00-000.png'))).toBe(false);
    // The newer ones should remain
    expect(fs.existsSync(path.join(dir2, 'img-2026-01-02T00-00-00-000.png'))).toBe(true);
  });

  it('cleanup removes empty subdirectories after deletion', async () => {
    setConfig('maxImages', 1);
    setConfig('organizeFolders', 'daily');

    const imageDir = path.join(tmpDir, '.tip-images');
    const dir1 = path.join(imageDir, '2026-01-01');
    const dir2 = path.join(imageDir, '2026-01-02');
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });

    fs.writeFileSync(path.join(dir1, 'img-2026-01-01T00-00-00-000.png'), 'old');
    fs.writeFileSync(path.join(dir2, 'img-2026-01-02T00-00-00-000.png'), 'newer');

    const store = createImageStore();
    // Save triggers cleanup: 3 images, maxImages=1, delete 2 oldest
    await store.save(fakePng('newest'));

    // dir1 should have been removed (all its images were deleted)
    expect(fs.existsSync(dir1)).toBe(false);
    // Root image folder should still exist
    expect(fs.existsSync(imageDir)).toBe(true);
  });

  it('cleanup preserves non-empty subdirectories', async () => {
    setConfig('maxImages', 2);
    setConfig('organizeFolders', 'daily');

    const imageDir = path.join(tmpDir, '.tip-images');
    const dir1 = path.join(imageDir, '2026-01-01');
    const dir2 = path.join(imageDir, '2026-01-02');
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });

    fs.writeFileSync(path.join(dir1, 'img-2026-01-01T00-00-00-000.png'), 'old');
    fs.writeFileSync(path.join(dir2, 'img-2026-01-02T00-00-00-000.png'), 'keep');
    fs.writeFileSync(path.join(dir2, 'img-2026-01-02T12-00-00-000.png'), 'keep2');

    const store = createImageStore();
    // Save triggers cleanup: 4 images, maxImages=2, delete 2 oldest
    await store.save(fakePng('newest'));

    // dir1 emptied → removed
    expect(fs.existsSync(dir1)).toBe(false);
    // dir2 still has images → preserved
    expect(fs.existsSync(dir2)).toBe(true);
  });

  it('cleanup does not follow symlinks to directories', async () => {
    setConfig('maxImages', 2);
    setConfig('organizeFolders', 'daily');

    const imageDir = path.join(tmpDir, '.tip-images');

    // Create a real subdirectory with images
    const realDir = path.join(imageDir, '2026-01-01');
    fs.mkdirSync(realDir, { recursive: true });
    fs.writeFileSync(path.join(realDir, 'img-2026-01-01T00-00-00-000.png'), 'real-img');

    // Create an external directory with images that should NOT be touched
    const externalDir = path.join(tmpDir, 'external-photos');
    fs.mkdirSync(externalDir, { recursive: true });
    fs.writeFileSync(path.join(externalDir, 'img-2025-01-01T00-00-00-000.png'), 'external-old');
    fs.writeFileSync(path.join(externalDir, 'img-2025-01-02T00-00-00-000.png'), 'external-old2');

    // Create a symlink inside the image folder pointing to external directory
    fs.symlinkSync(externalDir, path.join(imageDir, 'link-to-external'));

    const store = createImageStore();
    // Save enough images to trigger cleanup (maxImages=2, already have 1 + save 2 more = 3 total)
    await store.save(fakePng('new1'));
    await new Promise((r) => setTimeout(r, 5));
    await store.save(fakePng('new2'));

    // External images should NOT have been deleted
    expect(fs.existsSync(path.join(externalDir, 'img-2025-01-01T00-00-00-000.png'))).toBe(true);
    expect(fs.existsSync(path.join(externalDir, 'img-2025-01-02T00-00-00-000.png'))).toBe(true);
  });

  it('cleanup does not include symlinked image files', async () => {
    setConfig('maxImages', 2);
    setConfig('organizeFolders', 'daily');

    const imageDir = path.join(tmpDir, '.tip-images');
    const dateDir = path.join(imageDir, '2026-01-01');
    fs.mkdirSync(dateDir, { recursive: true });

    // Create a real image
    fs.writeFileSync(path.join(dateDir, 'img-2026-01-01T00-00-00-000.png'), 'real');

    // Create an external file and symlink to it
    const externalFile = path.join(tmpDir, 'external.png');
    fs.writeFileSync(externalFile, 'external-content');
    fs.symlinkSync(externalFile, path.join(dateDir, 'img-2025-12-01T00-00-00-000.png'));

    const store = createImageStore();
    await store.save(fakePng('new'));

    // The external file should not be affected by cleanup
    expect(fs.existsSync(externalFile)).toBe(true);
    expect(fs.readFileSync(externalFile, 'utf-8')).toBe('external-content');
  });

  it('sequential {n} pattern works within subdirectories', async () => {
    setConfig('filenamePattern', 'shot-{n}');
    setConfig('organizeFolders', 'daily');
    const store = createImageStore();

    const p1 = await store.save(fakePng('first'));
    const p2 = await store.save(fakePng('second'));

    expect(p1).toMatch(/shot-1\.png$/);
    expect(p2).toMatch(/shot-2\.png$/);
    // Both should be in the same date subdirectory
    expect(path.dirname(p1)).toBe(path.dirname(p2));
  });
});
