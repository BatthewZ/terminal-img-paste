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
      const buf = Buffer.from('fake-png-data');

      await store.save(buf);

      expect(fs.promises.mkdir).toHaveBeenCalledWith(IMAGE_FOLDER, {
        recursive: true,
      });
    });

    it('writes the image buffer to a timestamped .png file', async () => {
      const store = createImageStore();
      const buf = Buffer.from('fake-png-data');

      await store.save(buf);

      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(
          /\.tip-images[/\\]img-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}\.png$/,
        ),
        buf,
      );
    });

    it('returns the absolute file path', async () => {
      const store = createImageStore();
      const buf = Buffer.from('fake-png-data');

      const result = await store.save(buf);

      expect(result).toMatch(
        /^\/test\/workspace\/\.tip-images\/img-.*\.png$/,
      );
    });

    it('logs the saved image path', async () => {
      const store = createImageStore();
      const buf = Buffer.from('fake-png-data');

      await store.save(buf);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Saved image:'),
      );
    });

    it('calls cleanup after saving', async () => {
      const store = createImageStore();
      const cleanupSpy = vi.spyOn(store, 'cleanup');
      const buf = Buffer.from('fake-png-data');

      await store.save(buf);

      expect(cleanupSpy).toHaveBeenCalled();
    });

    it('calls ensureGitIgnored after saving', async () => {
      const store = createImageStore();
      const gitIgnoreSpy = vi.spyOn(store, 'ensureGitIgnored');
      const buf = Buffer.from('fake-png-data');

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

    it('is a no-op when maxImages is 0', async () => {
      setConfig('maxImages', 0);

      const store = createImageStore();
      await store.cleanup();

      expect(fs.promises.readdir).not.toHaveBeenCalled();
      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });

    it('is a no-op when maxImages is negative', async () => {
      setConfig('maxImages', -1);

      const store = createImageStore();
      await store.cleanup();

      expect(fs.promises.readdir).not.toHaveBeenCalled();
      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });

    it('is a no-op when the image folder does not exist (readdir throws)', async () => {
      vi.mocked(fs.promises.readdir).mockRejectedValue(
        new Error('ENOENT'),
      );

      const store = createImageStore();
      await store.cleanup();

      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });

    it('only considers .png files when counting', async () => {
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
