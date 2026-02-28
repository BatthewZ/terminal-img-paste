import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { workspace } from 'vscode';

vi.mock('fs');

import { createImageStore, resolveFilenamePattern, getSubdirectory } from '../src/storage/imageStore';
import { logger } from '../src/util/logger';

const WORKSPACE_ROOT = path.resolve('/test/workspace');
const DEFAULT_FOLDER = '.tip-images';
const IMAGE_FOLDER = path.join(WORKSPACE_ROOT, DEFAULT_FOLDER);
const GITIGNORE_PATH = path.join(WORKSPACE_ROOT, '.gitignore');

/** A minimal buffer that passes PNG magic-byte validation. */
const FAKE_PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake-png-body'),
]);

// Test-local configuration store used by the getConfiguration mock.
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

/**
 * Re-establish the vscode workspace mock after vitest's mockReset clears
 * vi.fn() implementations between tests.
 */
function setupVscodeMock(): void {
  (workspace as any).workspaceFolders = [{ uri: { fsPath: WORKSPACE_ROOT } }];
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
  resetConfig();
  setupVscodeMock();

  // Default fs mock implementations
  vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
  vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
  vi.mocked(fs.promises.readdir).mockResolvedValue([] as unknown as fs.Dirent[]);
  vi.mocked(fs.promises.unlink).mockResolvedValue(undefined);
  vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('ENOENT'));
  // realpath returns the input path by default (no symlinks)
  vi.mocked(fs.promises.realpath).mockImplementation(async (p) => String(p));
});

describe('createImageStore', () => {
  describe('save()', () => {
    it('creates the image directory recursively', async () => {
      const store = createImageStore();
      const buf = FAKE_PNG;

      await store.save(buf);

      expect(fs.promises.mkdir).toHaveBeenCalledWith(IMAGE_FOLDER, {
        recursive: true,
      });
    });

    it('writes the image buffer to a timestamped .png file', async () => {
      const store = createImageStore();
      const buf = FAKE_PNG;

      await store.save(buf);

      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(
          /\.tip-images[/\\]img-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}\.png$/,
        ),
        buf,
        { flag: 'wx', mode: 0o600 },
      );
    });

    it('returns the absolute file path', async () => {
      const store = createImageStore();
      const buf = FAKE_PNG;

      const result = await store.save(buf);

      expect(path.dirname(result)).toBe(IMAGE_FOLDER);
      expect(path.basename(result)).toMatch(
        /^img-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}\.png$/,
      );
    });

    it('logs the saved image path', async () => {
      const store = createImageStore();
      const buf = FAKE_PNG;

      await store.save(buf);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Saved image:'),
      );
    });

    it('calls cleanup after saving', async () => {
      const store = createImageStore();
      const cleanupSpy = vi.spyOn(store, 'cleanup');
      const buf = FAKE_PNG;

      await store.save(buf);

      expect(cleanupSpy).toHaveBeenCalled();
    });

    it('calls ensureGitIgnored after saving', async () => {
      const store = createImageStore();
      const gitIgnoreSpy = vi.spyOn(store, 'ensureGitIgnored');
      const buf = FAKE_PNG;

      await store.save(buf);

      expect(gitIgnoreSpy).toHaveBeenCalled();
    });
  });

  describe('cleanup()', () => {
    it('deletes oldest files when exceeding maxImages', async () => {
      setConfig('maxImages', 3);

      const files = [
        'img-2026-01-01T00-00-00-000.png',
        'img-2026-01-02T00-00-00-000.png',
        'img-2026-01-03T00-00-00-000.png',
        'img-2026-01-04T00-00-00-000.png',
        'img-2026-01-05T00-00-00-000.png',
      ];
      vi.mocked(fs.promises.readdir).mockResolvedValue(
        files as unknown as fs.Dirent[],
      );

      const store = createImageStore();
      await store.cleanup();

      // Should delete the 2 oldest (5 - 3 = 2)
      expect(fs.promises.unlink).toHaveBeenCalledTimes(2);
      expect(fs.promises.unlink).toHaveBeenCalledWith(
        path.join(IMAGE_FOLDER, 'img-2026-01-01T00-00-00-000.png'),
      );
      expect(fs.promises.unlink).toHaveBeenCalledWith(
        path.join(IMAGE_FOLDER, 'img-2026-01-02T00-00-00-000.png'),
      );
    });

    it('logs each deleted file', async () => {
      setConfig('maxImages', 1);

      const files = [
        'img-2026-01-01T00-00-00-000.png',
        'img-2026-01-02T00-00-00-000.png',
      ];
      vi.mocked(fs.promises.readdir).mockResolvedValue(
        files as unknown as fs.Dirent[],
      );

      const store = createImageStore();
      await store.cleanup();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Deleted old image:'),
      );
    });

    it('does not delete files when count is within maxImages limit', async () => {
      setConfig('maxImages', 5);

      const files = [
        'img-2026-01-01T00-00-00-000.png',
        'img-2026-01-02T00-00-00-000.png',
        'img-2026-01-03T00-00-00-000.png',
      ];
      vi.mocked(fs.promises.readdir).mockResolvedValue(
        files as unknown as fs.Dirent[],
      );

      const store = createImageStore();
      await store.cleanup();

      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });

    it('does not delete files when count equals maxImages', async () => {
      setConfig('maxImages', 3);

      const files = [
        'img-2026-01-01T00-00-00-000.png',
        'img-2026-01-02T00-00-00-000.png',
        'img-2026-01-03T00-00-00-000.png',
      ];
      vi.mocked(fs.promises.readdir).mockResolvedValue(
        files as unknown as fs.Dirent[],
      );

      const store = createImageStore();
      await store.cleanup();

      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });

    it('falls back to default (20) when maxImages is 0', async () => {
      setConfig('maxImages', 0);

      const store = createImageStore();
      await store.cleanup();

      // Should fall back to 20 and proceed with cleanup (readdir is called)
      expect(fs.promises.readdir).toHaveBeenCalled();
    });

    it('falls back to default (20) when maxImages is negative', async () => {
      setConfig('maxImages', -1);

      const store = createImageStore();
      await store.cleanup();

      // Should fall back to 20 and proceed with cleanup (readdir is called)
      expect(fs.promises.readdir).toHaveBeenCalled();
    });

    it('falls back to default (20) when maxImages is NaN', async () => {
      setConfig('maxImages', NaN);

      const store = createImageStore();
      await store.cleanup();

      expect(fs.promises.readdir).toHaveBeenCalled();
    });

    it('falls back to default (20) when maxImages is Infinity', async () => {
      setConfig('maxImages', Infinity);

      const store = createImageStore();
      await store.cleanup();

      expect(fs.promises.readdir).toHaveBeenCalled();
    });

    it('falls back to default (20) when maxImages is a decimal', async () => {
      setConfig('maxImages', 2.5);

      const store = createImageStore();
      await store.cleanup();

      expect(fs.promises.readdir).toHaveBeenCalled();
    });

    it('is a no-op when the image folder does not exist (readdir throws)', async () => {
      vi.mocked(fs.promises.readdir).mockRejectedValue(
        new Error('ENOENT'),
      );

      const store = createImageStore();
      await store.cleanup();

      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });

    it('only considers image files when counting', async () => {
      setConfig('maxImages', 2);

      const files = [
        'img-2026-01-01T00-00-00-000.png',
        'img-2026-01-02T00-00-00-000.png',
        'img-2026-01-03T00-00-00-000.png',
        'readme.txt',
        'notes.md',
      ];
      vi.mocked(fs.promises.readdir).mockResolvedValue(
        files as unknown as fs.Dirent[],
      );

      const store = createImageStore();
      await store.cleanup();

      // 3 png files, maxImages=2, so delete 1 oldest
      expect(fs.promises.unlink).toHaveBeenCalledTimes(1);
      expect(fs.promises.unlink).toHaveBeenCalledWith(
        path.join(IMAGE_FOLDER, 'img-2026-01-01T00-00-00-000.png'),
      );
    });

    it('includes all image extensions in cleanup counting', async () => {
      setConfig('maxImages', 2);

      const files = [
        'img-2026-01-01T00-00-00-000.png',
        'img-2026-01-02T00-00-00-000.jpg',
        'img-2026-01-03T00-00-00-000.webp',
      ];
      vi.mocked(fs.promises.readdir).mockResolvedValue(
        files as unknown as fs.Dirent[],
      );

      const store = createImageStore();
      await store.cleanup();

      // 3 image files, maxImages=2, so delete 1 oldest
      expect(fs.promises.unlink).toHaveBeenCalledTimes(1);
      expect(fs.promises.unlink).toHaveBeenCalledWith(
        path.join(IMAGE_FOLDER, 'img-2026-01-01T00-00-00-000.png'),
      );
    });

    it('continues deleting remaining files when one unlink fails', async () => {
      setConfig('maxImages', 1);

      const files = [
        'img-2026-01-01T00-00-00-000.png',
        'img-2026-01-02T00-00-00-000.png',
        'img-2026-01-03T00-00-00-000.png',
        'img-2026-01-04T00-00-00-000.png',
      ];
      vi.mocked(fs.promises.readdir).mockResolvedValue(
        files as unknown as fs.Dirent[],
      );

      // Make the second unlink fail
      vi.mocked(fs.promises.unlink)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValueOnce(undefined);

      const store = createImageStore();
      await store.cleanup();

      // All 3 files should have been attempted (4 files - 1 maxImages = 3 to delete)
      expect(fs.promises.unlink).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete old image:'),
        expect.any(Error),
      );
    });
  });

  describe('PNG validation', () => {
    it('rejects a buffer that is not a valid PNG', async () => {
      const store = createImageStore();
      await expect(store.save(Buffer.from('not-a-png'))).rejects.toThrow(
        'Clipboard data is not a valid PNG image',
      );
    });

    it('rejects an empty buffer', async () => {
      const store = createImageStore();
      await expect(store.save(Buffer.alloc(0))).rejects.toThrow(
        'Cannot save empty image data',
      );
    });

    it('rejects a buffer shorter than the PNG signature', async () => {
      const store = createImageStore();
      await expect(store.save(Buffer.from([0x89, 0x50]))).rejects.toThrow(
        'Clipboard data is not a valid PNG image',
      );
    });

    it('accepts a buffer with a valid PNG signature', async () => {
      const store = createImageStore();
      await expect(store.save(FAKE_PNG)).resolves.toBeDefined();
    });
  });

  describe('multi-format validation and saving', () => {
    const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const FAKE_BMP = Buffer.from([0x42, 0x4d, 0x00, 0x00, 0x00, 0x00]);
    const FAKE_WEBP = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('WEBP'),
    ]);
    const FAKE_TIFF_LE = Buffer.from([0x49, 0x49, 0x2a, 0x00]);
    const FAKE_TIFF_BE = Buffer.from([0x4d, 0x4d, 0x00, 0x2a]);

    it('saves JPEG with .jpg extension', async () => {
      const store = createImageStore();
      const result = await store.save(FAKE_JPEG, 'jpeg');
      expect(result).toMatch(/\.jpg$/);
    });

    it('saves WebP with .webp extension', async () => {
      const store = createImageStore();
      const result = await store.save(FAKE_WEBP, 'webp');
      expect(result).toMatch(/\.webp$/);
    });

    it('saves TIFF with .tiff extension', async () => {
      const store = createImageStore();
      const result = await store.save(FAKE_TIFF_LE, 'tiff');
      expect(result).toMatch(/\.tiff$/);
    });

    it('saves BMP with .bmp extension', async () => {
      const store = createImageStore();
      const result = await store.save(FAKE_BMP, 'bmp');
      expect(result).toMatch(/\.bmp$/);
    });

    it('saves unknown format with .png extension and skips validation', async () => {
      const store = createImageStore();
      const result = await store.save(Buffer.from('arbitrary-data'), 'unknown');
      expect(result).toMatch(/\.png$/);
    });

    it('rejects empty buffer even for unknown format', async () => {
      const store = createImageStore();
      await expect(store.save(Buffer.alloc(0), 'unknown')).rejects.toThrow(
        'Cannot save empty image data',
      );
    });

    it('rejects empty buffer for any format', async () => {
      const store = createImageStore();
      for (const fmt of ['png', 'jpeg', 'bmp', 'webp', 'tiff', 'unknown'] as const) {
        await expect(store.save(Buffer.alloc(0), fmt)).rejects.toThrow(
          'Cannot save empty image data',
        );
      }
    });

    it('validates JPEG magic bytes (accepts valid)', async () => {
      const store = createImageStore();
      await expect(store.save(FAKE_JPEG, 'jpeg')).resolves.toBeDefined();
    });

    it('validates JPEG magic bytes (rejects invalid)', async () => {
      const store = createImageStore();
      await expect(store.save(Buffer.from('not-jpeg'), 'jpeg')).rejects.toThrow(
        'Clipboard data is not a valid JPEG image',
      );
    });

    it('validates BMP magic bytes (accepts valid)', async () => {
      const store = createImageStore();
      await expect(store.save(FAKE_BMP, 'bmp')).resolves.toBeDefined();
    });

    it('validates BMP magic bytes (rejects invalid)', async () => {
      const store = createImageStore();
      await expect(store.save(Buffer.from('not-bmp'), 'bmp')).rejects.toThrow(
        'Clipboard data is not a valid BMP image',
      );
    });

    it('validates WebP magic bytes (accepts valid)', async () => {
      const store = createImageStore();
      await expect(store.save(FAKE_WEBP, 'webp')).resolves.toBeDefined();
    });

    it('validates WebP magic bytes (rejects invalid)', async () => {
      const store = createImageStore();
      await expect(store.save(Buffer.from('not-webp-data'), 'webp')).rejects.toThrow(
        'Clipboard data is not a valid WebP image',
      );
    });

    it('validates TIFF magic bytes little-endian (accepts valid)', async () => {
      const store = createImageStore();
      await expect(store.save(FAKE_TIFF_LE, 'tiff')).resolves.toBeDefined();
    });

    it('validates TIFF magic bytes big-endian (accepts valid)', async () => {
      const store = createImageStore();
      await expect(store.save(FAKE_TIFF_BE, 'tiff')).resolves.toBeDefined();
    });

    it('validates TIFF magic bytes (rejects invalid)', async () => {
      const store = createImageStore();
      await expect(store.save(Buffer.from('not-tiff'), 'tiff')).rejects.toThrow(
        'Clipboard data is not a valid TIFF image',
      );
    });
  });

  describe('folderName path traversal validation', () => {
    it('rejects folderName with ".." path traversal', async () => {
      setConfig('folderName', '../../../etc');

      const store = createImageStore();
      await expect(store.save(FAKE_PNG)).rejects.toThrow(
        /must resolve to a subdirectory of the workspace root/,
      );
    });

    it('rejects folderName with absolute path on Unix', async () => {
      setConfig('folderName', '/tmp/evil');

      const store = createImageStore();
      await expect(store.save(FAKE_PNG)).rejects.toThrow(
        /must resolve to a subdirectory of the workspace root/,
      );
    });

    it('rejects folderName that resolves to parent directory', async () => {
      setConfig('folderName', '.tip-images/../../outside');

      const store = createImageStore();
      await expect(store.save(FAKE_PNG)).rejects.toThrow(
        /must resolve to a subdirectory of the workspace root/,
      );
    });

    it('rejects folderName "." that resolves to workspace root', async () => {
      setConfig('folderName', '.');

      const store = createImageStore();
      await expect(store.save(FAKE_PNG)).rejects.toThrow(
        /must resolve to a subdirectory of the workspace root/,
      );
    });

    it('rejects empty folderName that resolves to workspace root', async () => {
      setConfig('folderName', '');

      const store = createImageStore();
      await expect(store.save(FAKE_PNG)).rejects.toThrow(
        /must resolve to a subdirectory of the workspace root/,
      );
    });

    it('allows valid subdirectory folderName', async () => {
      setConfig('folderName', 'images');

      const store = createImageStore();
      await expect(store.save(FAKE_PNG)).resolves.toBeDefined();
    });

    it('allows valid nested subdirectory folderName', async () => {
      setConfig('folderName', 'assets/images/paste');

      const store = createImageStore();
      await expect(store.save(FAKE_PNG)).resolves.toBeDefined();
    });

    it('allows default folderName (.tip-images)', async () => {
      const store = createImageStore();
      await expect(store.save(FAKE_PNG)).resolves.toBeDefined();
    });
  });

  describe('save() error paths', () => {
    it('throws when workspaceFolders is undefined', async () => {
      (workspace as any).workspaceFolders = undefined;

      const store = createImageStore();
      await expect(store.save(FAKE_PNG)).rejects.toThrow(
        'No workspace folder is open',
      );
    });

    it('throws when workspaceFolders is empty', async () => {
      (workspace as any).workspaceFolders = [];

      const store = createImageStore();
      await expect(store.save(FAKE_PNG)).rejects.toThrow(
        'No workspace folder is open',
      );
    });

    it('propagates mkdir errors', async () => {
      vi.mocked(fs.promises.mkdir).mockRejectedValue(new Error('EACCES: permission denied'));

      const store = createImageStore();
      await expect(store.save(FAKE_PNG)).rejects.toThrow(
        'EACCES: permission denied',
      );
    });

    it('propagates writeFile errors', async () => {
      vi.mocked(fs.promises.writeFile).mockRejectedValue(new Error('ENOSPC: no space left'));

      const store = createImageStore();
      await expect(store.save(FAKE_PNG)).rejects.toThrow(
        'ENOSPC: no space left',
      );
    });
  });

  describe('ensureGitIgnored() error paths', () => {
    it('propagates writeFile failure when creating new .gitignore', async () => {
      // readFile fails (no existing .gitignore)
      vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('ENOENT'));
      // writeFile also fails
      vi.mocked(fs.promises.writeFile).mockRejectedValue(new Error('EACCES: permission denied'));

      const store = createImageStore();
      await expect(store.ensureGitIgnored()).rejects.toThrow('EACCES: permission denied');
    });
  });

  describe('ensureGitIgnored()', () => {
    it('creates .gitignore with folder name if file does not exist', async () => {
      vi.mocked(fs.promises.readFile).mockRejectedValue(
        new Error('ENOENT'),
      );

      const store = createImageStore();
      await store.ensureGitIgnored();

      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        GITIGNORE_PATH,
        '.tip-images\n',
        'utf-8',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Created .gitignore'),
      );
    });

    it('appends folder name to existing .gitignore that ends with newline', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        'node_modules\ndist\n',
      );

      const store = createImageStore();
      await store.ensureGitIgnored();

      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        GITIGNORE_PATH,
        'node_modules\ndist\n.tip-images\n',
        'utf-8',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Added .tip-images to .gitignore'),
      );
    });

    it('appends folder name to existing .gitignore that does not end with newline', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        'node_modules\ndist',
      );

      const store = createImageStore();
      await store.ensureGitIgnored();

      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        GITIGNORE_PATH,
        'node_modules\ndist\n.tip-images\n',
        'utf-8',
      );
    });

    it('does not modify .gitignore if folder is already listed', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        'node_modules\n.tip-images\ndist\n',
      );

      const store = createImageStore();
      await store.ensureGitIgnored();

      expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });

    it('matches folder name even with surrounding whitespace in .gitignore lines', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        'node_modules\n  .tip-images  \ndist\n',
      );

      const store = createImageStore();
      await store.ensureGitIgnored();

      // The code trims each line before comparing, so it should match
      expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });

    it('is a no-op when autoGitIgnore is false', async () => {
      setConfig('autoGitIgnore', false);

      const store = createImageStore();
      await store.ensureGitIgnored();

      expect(fs.promises.readFile).not.toHaveBeenCalled();
      expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });

    it('uses the configured folder name', async () => {
      setConfig('folderName', '.my-images');
      vi.mocked(fs.promises.readFile).mockRejectedValue(
        new Error('ENOENT'),
      );

      const store = createImageStore();
      await store.ensureGitIgnored();

      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        GITIGNORE_PATH,
        '.my-images\n',
        'utf-8',
      );
    });
  });

  describe('resolveFilenamePattern()', () => {
    const BUF_A = Buffer.from('image-content-A');
    const BUF_B = Buffer.from('image-content-B');

    it('default pattern produces timestamp-based name (backward compatible)', () => {
      const result = resolveFilenamePattern('img-{timestamp}', BUF_A, []);
      expect(result).toMatch(/^img-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}$/);
    });

    it('{date} placeholder resolves to YYYY-MM-DD format', () => {
      const result = resolveFilenamePattern('shot-{date}', BUF_A, []);
      // also logs collision warning since {date} alone is not unique
      expect(result).toMatch(/^shot-\d{4}-\d{2}-\d{2}$/);
    });

    it('{time} placeholder resolves to HH-mm-ss format', () => {
      const result = resolveFilenamePattern('shot-{time}', BUF_A, []);
      expect(result).toMatch(/^shot-\d{2}-\d{2}-\d{2}$/);
    });

    it('{hash} produces consistent 8-char hex for same content', () => {
      const r1 = resolveFilenamePattern('img-{hash}', BUF_A, []);
      const r2 = resolveFilenamePattern('img-{hash}', BUF_A, []);
      expect(r1).toBe(r2);
      const hash = r1.replace('img-', '');
      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });

    it('{hash} produces different values for different content', () => {
      const r1 = resolveFilenamePattern('img-{hash}', BUF_A, []);
      const r2 = resolveFilenamePattern('img-{hash}', BUF_B, []);
      expect(r1).not.toBe(r2);
    });

    it('{hash} matches expected sha256 prefix', () => {
      const expected = crypto.createHash('sha256').update(BUF_A).digest('hex').slice(0, 8);
      const result = resolveFilenamePattern('img-{hash}', BUF_A, []);
      expect(result).toBe(`img-${expected}`);
    });

    it('{n} starts at 1 with no existing files', () => {
      const result = resolveFilenamePattern('shot-{n}', BUF_A, []);
      expect(result).toBe('shot-1');
    });

    it('{n} auto-increments based on existing files', () => {
      const existing = ['shot-1.png', 'shot-2.png', 'shot-3.png'];
      const result = resolveFilenamePattern('shot-{n}', BUF_A, existing);
      expect(result).toBe('shot-4');
    });

    it('{n} handles gaps in sequence', () => {
      const existing = ['shot-1.png', 'shot-2.png', 'shot-5.png'];
      const result = resolveFilenamePattern('shot-{n}', BUF_A, existing);
      expect(result).toBe('shot-6');
    });

    it('combined pattern like screenshot-{date}-{n} works', () => {
      const now = new Date();
      const y = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const today = `${y}-${mo}-${d}`;
      const existing = [`screenshot-${today}-1.png`, `screenshot-${today}-2.png`];
      const result = resolveFilenamePattern('screenshot-{date}-{n}', BUF_A, existing);
      expect(result).toMatch(/^screenshot-\d{4}-\d{2}-\d{2}-3$/);
    });

    it('warns when pattern lacks uniqueness placeholders', () => {
      resolveFilenamePattern('shot-{date}', BUF_A, []);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('lacks a uniqueness placeholder'),
      );
    });

    it('empty pattern falls back to default', () => {
      const result = resolveFilenamePattern('', BUF_A, []);
      expect(result).toMatch(/^img-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}$/);
    });

    it('pattern with no placeholders gets timestamp appended', () => {
      const result = resolveFilenamePattern('my-screenshot', BUF_A, []);
      expect(result).toMatch(/^my-screenshot-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}$/);
    });
  });

  describe('save() with filenamePattern', () => {
    it('uses configured filenamePattern for filenames', async () => {
      setConfig('filenamePattern', 'capture-{hash}');
      const store = createImageStore();
      const result = await store.save(FAKE_PNG);

      // Should use hash-based naming instead of timestamp
      expect(result).toMatch(/capture-[0-9a-f]{8}\.png$/);
    });

    it('file extension is correctly appended after pattern resolution', async () => {
      setConfig('filenamePattern', 'shot-{n}');
      const store = createImageStore();

      const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const result = await store.save(FAKE_JPEG, 'jpeg');

      expect(result).toMatch(/shot-1\.jpg$/);
    });
  });

  describe('getSubdirectory()', () => {
    const fixedDate = new Date(2026, 1, 27, 14, 30, 45); // Feb 27, 2026

    it('flat mode returns empty string', () => {
      expect(getSubdirectory('flat', fixedDate)).toBe('');
    });

    it('daily mode returns YYYY-MM-DD format', () => {
      expect(getSubdirectory('daily', fixedDate)).toBe('2026-02-27');
    });

    it('monthly mode returns YYYY-MM format', () => {
      expect(getSubdirectory('monthly', fixedDate)).toBe('2026-02');
    });

    it('unknown value falls back to flat (empty string)', () => {
      expect(getSubdirectory('bogus' as any, fixedDate)).toBe('');
    });

    it('daily mode zero-pads single-digit month and day', () => {
      const jan1 = new Date(2026, 0, 5);
      expect(getSubdirectory('daily', jan1)).toBe('2026-01-05');
    });

    it('monthly mode zero-pads single-digit month', () => {
      const mar = new Date(2026, 2, 15);
      expect(getSubdirectory('monthly', mar)).toBe('2026-03');
    });
  });

  describe('save() with organizeFolders', () => {
    it('daily mode creates date subdirectory and saves file inside it', async () => {
      setConfig('organizeFolders', 'daily');
      const store = createImageStore();

      const result = await store.save(FAKE_PNG);

      // File should be in a YYYY-MM-DD subdirectory
      expect(result).toMatch(
        /\.tip-images[/\\]\d{4}-\d{2}-\d{2}[/\\]img-.*\.png$/,
      );
      // mkdir should have been called for the subdirectory
      expect(fs.promises.mkdir).toHaveBeenCalledWith(
        expect.stringMatching(/\.tip-images[/\\]\d{4}-\d{2}-\d{2}$/),
        { recursive: true },
      );
    });

    it('monthly mode creates month subdirectory and saves file inside it', async () => {
      setConfig('organizeFolders', 'monthly');
      const store = createImageStore();

      const result = await store.save(FAKE_PNG);

      expect(result).toMatch(
        /\.tip-images[/\\]\d{4}-\d{2}[/\\]img-.*\.png$/,
      );
    });

    it('flat mode saves file in root folder (no subdirectory)', async () => {
      setConfig('organizeFolders', 'flat');
      const store = createImageStore();

      const result = await store.save(FAKE_PNG);

      // Should NOT have a subdirectory
      expect(result).toMatch(
        /\.tip-images[/\\]img-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}\.png$/,
      );
    });
  });

  describe('cleanup() with organizeFolders', () => {
    it('flat mode uses original flat cleanup logic', async () => {
      setConfig('maxImages', 1);
      setConfig('organizeFolders', 'flat');

      const files = [
        'img-2026-01-01T00-00-00-000.png',
        'img-2026-01-02T00-00-00-000.png',
      ];
      vi.mocked(fs.promises.readdir).mockResolvedValue(
        files as unknown as fs.Dirent[],
      );

      const store = createImageStore();
      await store.cleanup();

      expect(fs.promises.unlink).toHaveBeenCalledTimes(1);
      expect(fs.promises.unlink).toHaveBeenCalledWith(
        path.join(IMAGE_FOLDER, 'img-2026-01-01T00-00-00-000.png'),
      );
    });

    it('daily mode scans recursively and deletes oldest globally', async () => {
      setConfig('maxImages', 2);
      setConfig('organizeFolders', 'daily');

      // Mock readdir to return different results for different paths
      const rootEntries = [
        { name: '2026-01-01', isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false },
        { name: '2026-01-02', isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false },
      ];
      const dir1Entries = [
        { name: 'img-2026-01-01T00-00-00-000.png', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
        { name: 'img-2026-01-01T12-00-00-000.png', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
      ];
      const dir2Entries = [
        { name: 'img-2026-01-02T00-00-00-000.png', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
      ];

      vi.mocked(fs.promises.readdir).mockImplementation(async (p: any, opts?: any) => {
        const pStr = String(p);
        if (pStr.endsWith('2026-01-01')) return dir1Entries as any;
        if (pStr.endsWith('2026-01-02')) return dir2Entries as any;
        if (opts && typeof opts === 'object' && 'withFileTypes' in opts) return rootEntries as any;
        // flat readdir (non-withFileTypes) for the root — should not be called in non-flat mode
        return [] as any;
      });

      const store = createImageStore();
      await store.cleanup();

      // 3 images total, maxImages=2, delete 1 oldest
      expect(fs.promises.unlink).toHaveBeenCalledTimes(1);
      expect(fs.promises.unlink).toHaveBeenCalledWith(
        path.join(IMAGE_FOLDER, '2026-01-01', 'img-2026-01-01T00-00-00-000.png'),
      );
    });

    it('removes empty subdirectories after cleanup', async () => {
      setConfig('maxImages', 1);
      setConfig('organizeFolders', 'daily');

      const rootEntries = [
        { name: '2026-01-01', isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false },
        { name: '2026-01-02', isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false },
      ];
      const dir1Entries = [
        { name: 'img-2026-01-01T00-00-00-000.png', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
      ];
      const dir2Entries = [
        { name: 'img-2026-01-02T00-00-00-000.png', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
      ];

      let dir1Deleted = false;
      vi.mocked(fs.promises.readdir).mockImplementation(async (p: any, opts?: any) => {
        const pStr = String(p);
        if (pStr.endsWith('2026-01-01')) {
          if (dir1Deleted) return [] as any;
          return (opts && typeof opts === 'object' && 'withFileTypes' in opts) ? dir1Entries as any : ['img-2026-01-01T00-00-00-000.png'] as any;
        }
        if (pStr.endsWith('2026-01-02')) return (opts && typeof opts === 'object' && 'withFileTypes' in opts) ? dir2Entries as any : ['img-2026-01-02T00-00-00-000.png'] as any;
        return rootEntries as any;
      });

      vi.mocked(fs.promises.unlink).mockImplementation(async () => {
        dir1Deleted = true;
      });
      vi.mocked(fs.promises.rmdir).mockResolvedValue(undefined);

      const store = createImageStore();
      await store.cleanup();

      // Should delete the oldest file
      expect(fs.promises.unlink).toHaveBeenCalledTimes(1);
      // Should try to remove the now-empty dir
      expect(fs.promises.rmdir).toHaveBeenCalledWith(
        path.join(IMAGE_FOLDER, '2026-01-01'),
      );
    });

    it('does not remove the root image folder even if empty', async () => {
      setConfig('maxImages', 1);
      setConfig('organizeFolders', 'daily');

      // Root has one file directly (edge case)
      const rootEntries = [
        { name: 'img-stray.png', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
        { name: 'img-newer.png', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
      ];

      vi.mocked(fs.promises.readdir).mockImplementation(async (_p: any, opts?: any) => {
        if (opts && typeof opts === 'object' && 'withFileTypes' in opts) return rootEntries as any;
        return [] as any;
      });

      const store = createImageStore();
      await store.cleanup();

      // Should delete 1 image (2 - 1 = 1)
      expect(fs.promises.unlink).toHaveBeenCalledTimes(1);
      // Should NOT call rmdir on the root folder
      expect(fs.promises.rmdir).not.toHaveBeenCalled();
    });

    it('does not follow symlinks to directories during recursive cleanup', async () => {
      setConfig('maxImages', 10);
      setConfig('organizeFolders', 'daily');

      const rootEntries = [
        { name: '2026-01-01', isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false },
        { name: 'external-link', isDirectory: () => true, isFile: () => false, isSymbolicLink: () => true },
      ];
      const dir1Entries = [
        { name: 'img-2026-01-01T00-00-00-000.png', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
      ];

      vi.mocked(fs.promises.readdir).mockImplementation(async (p: any, opts?: any) => {
        const pStr = String(p);
        if (pStr.endsWith('2026-01-01')) return dir1Entries as any;
        if (pStr.endsWith('external-link')) throw new Error('Should not traverse symlink');
        if (opts && typeof opts === 'object' && 'withFileTypes' in opts) return rootEntries as any;
        return [] as any;
      });

      const store = createImageStore();
      await store.cleanup();

      // Only the real directory's image should be counted — no traversal into symlink
      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });

    it('does not include symlinked image files in cleanup candidates', async () => {
      setConfig('maxImages', 1);
      setConfig('organizeFolders', 'daily');

      const rootEntries = [
        { name: 'real-img.png', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
        { name: 'symlinked-img.png', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => true },
      ];

      vi.mocked(fs.promises.readdir).mockImplementation(async (_p: any, opts?: any) => {
        if (opts && typeof opts === 'object' && 'withFileTypes' in opts) return rootEntries as any;
        return [] as any;
      });

      const store = createImageStore();
      await store.cleanup();

      // Only 1 real image, maxImages=1, nothing to delete
      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });
  });
});
