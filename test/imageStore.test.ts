import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { workspace } from 'vscode';

vi.mock('fs');
vi.mock('../src/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createImageStore } from '../src/storage/imageStore';
import { logger } from '../src/util/logger';

const WORKSPACE_ROOT = '/test/workspace';
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
        { mode: 0o600 },
      );
    });

    it('returns the absolute file path', async () => {
      const store = createImageStore();
      const buf = FAKE_PNG;

      const result = await store.save(buf);

      expect(result).toMatch(
        /^\/test\/workspace\/\.tip-images\/img-.*\.png$/,
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
        'Clipboard data is not a valid PNG image',
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
});
