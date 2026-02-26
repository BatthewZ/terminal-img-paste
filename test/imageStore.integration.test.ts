import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { workspace } from 'vscode';

vi.mock('../src/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

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
describe('imageStore integration (real fs)', () => {
  it('save creates the image directory if it does not exist', async () => {
    const store = createImageStore();
    await store.save(Buffer.from('fake-png'));

    const imageDir = path.join(tmpDir, '.tip-images');
    expect(fs.existsSync(imageDir)).toBe(true);
  });

  it('save writes a real file with correct contents', async () => {
    const store = createImageStore();
    const data = Buffer.from('PNG-DATA-12345');
    const filePath = await store.save(data);

    const contents = fs.readFileSync(filePath);
    expect(contents).toEqual(data);
  });

  it('save returns an absolute path that exists on disk', async () => {
    const store = createImageStore();
    const filePath = await store.save(Buffer.from('img'));

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
    await store.save(Buffer.from('newest'));

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

    await store.save(Buffer.from('new'));

    // readme.txt should still exist
    expect(fs.existsSync(path.join(imageDir, 'readme.txt'))).toBe(true);
  });

  it('ensureGitIgnored creates .gitignore with folder name', async () => {
    const store = createImageStore();
    await store.save(Buffer.from('img'));

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
    await store.save(Buffer.from('img'));

    const content = fs.readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('node_modules');
    expect(content).toContain('.tip-images');
  });

  it('consecutive saves generate distinct filenames', async () => {
    const store = createImageStore();
    const path1 = await store.save(Buffer.from('img1'));

    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 5));

    const path2 = await store.save(Buffer.from('img2'));

    expect(path1).not.toBe(path2);
    expect(fs.existsSync(path1)).toBe(true);
    expect(fs.existsSync(path2)).toBe(true);
  });
});
