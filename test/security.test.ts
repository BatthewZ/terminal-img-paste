import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { workspace } from 'vscode';

vi.mock('../src/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createImageStore } from '../src/storage/imageStore';
import { writeSecureFile } from '../src/util/fs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let tmpDir: string;
let configValues: Record<string, unknown>;

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function fakePng(body: string): Buffer {
  return Buffer.concat([PNG_HEADER, Buffer.from(body)]);
}

function resetConfig(): void {
  configValues = {
    folderName: '.tip-images',
    maxImages: 20,
    autoGitIgnore: false, // disable for security tests
    sendNewline: false,
  };
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tip-security-'));
  resetConfig();
  setupVscodeMock();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('symlink escape detection', () => {
  it('saves to a normal directory successfully', async () => {
    const store = createImageStore();
    const filePath = await store.save(fakePng('ok'));

    expect(fs.existsSync(filePath)).toBe(true);
    expect(filePath).toContain(tmpDir);
  });

  it('throws when image folder is a symlink pointing outside workspace', async () => {
    // Create a directory outside the workspace
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tip-outside-'));

    try {
      // Create a symlink inside workspace pointing to outside
      const symlinkPath = path.join(tmpDir, '.tip-images');
      fs.symlinkSync(outsideDir, symlinkPath);

      const store = createImageStore();
      await expect(store.save(fakePng('escape'))).rejects.toThrow(
        /outside the workspace.*symlink escape/,
      );
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('allows saving when image folder is a symlink pointing within workspace', async () => {
    // Create a real subdirectory in workspace
    const realDir = path.join(tmpDir, 'real-images');
    fs.mkdirSync(realDir, { recursive: true });

    // Create a symlink pointing to it
    const symlinkPath = path.join(tmpDir, '.tip-images');
    fs.symlinkSync(realDir, symlinkPath);

    const store = createImageStore();
    const filePath = await store.save(fakePng('within'));

    expect(fs.existsSync(filePath)).toBe(true);
    // The file should actually be in the real directory
    const realFilePath = fs.realpathSync(filePath);
    expect(realFilePath.startsWith(realDir)).toBe(true);
  });
});

describe('writeSecureFile', () => {
  it('always sets 0o600 permissions', async () => {
    const filePath = path.join(tmpDir, 'secure-file.bin');
    await writeSecureFile(filePath, Buffer.from('secret'));

    const stat = fs.statSync(filePath);
    // On Unix, mode & 0o777 gives the permission bits
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('writes correct contents', async () => {
    const filePath = path.join(tmpDir, 'data.bin');
    const data = Buffer.from('hello-secure');
    await writeSecureFile(filePath, data);

    const contents = fs.readFileSync(filePath);
    expect(contents).toEqual(data);
  });
});

describe('file permissions after save', () => {
  it('saved image has 0o600 permissions', async () => {
    const store = createImageStore();
    const filePath = await store.save(fakePng('perms'));

    const stat = fs.statSync(filePath);
    expect(stat.mode & 0o777).toBe(0o600);
  });
});
