import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { workspace } from 'vscode';

vi.mock('../../src/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createImageStore } from '../../src/storage/imageStore';
import { createTestPng, createTestJpeg, PNG_SIGNATURE, JPEG_SOI } from './fixtures/testImages';

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
    organizeFolders: 'flat',
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tip-integration-adv-'));
  resetConfig();
  setupVscodeMock();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Advanced integration tests — real filesystem
// ---------------------------------------------------------------------------
describe('imageStore advanced integration (real fs)', () => {
  it('concurrent saves — 5 parallel save() calls all succeed', async () => {
    // Use {hash} pattern with distinct buffers so each save gets a unique filename
    setConfig('filenamePattern', 'img-{hash}');
    const store = createImageStore();

    // Create 5 distinct PNG buffers (PNG signature + unique payload)
    const buffers = Array.from({ length: 5 }, (_, i) =>
      Buffer.concat([PNG_SIGNATURE, Buffer.from(`unique-payload-${i}`)]),
    );

    const results = await Promise.all(buffers.map((buf) => store.save(buf)));

    // All 5 should return distinct absolute paths
    expect(new Set(results).size).toBe(5);

    // All 5 files should exist on disk
    for (const filePath of results) {
      expect(path.isAbsolute(filePath)).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });

  it('large file handling — 1 MB PNG-like buffer is saved correctly', async () => {
    const store = createImageStore();

    // Create a buffer starting with the PNG signature followed by 1 MB of random data
    const randomData = Buffer.alloc(1024 * 1024);
    for (let i = 0; i < randomData.length; i++) {
      randomData[i] = Math.floor(Math.random() * 256);
    }
    const largeBuffer = Buffer.concat([PNG_SIGNATURE, randomData]);

    const filePath = await store.save(largeBuffer);

    expect(fs.existsSync(filePath)).toBe(true);
    const stat = fs.statSync(filePath);
    expect(stat.size).toBe(largeBuffer.length);
  });

  it('filename pattern with {n} — sequential numbering', async () => {
    setConfig('filenamePattern', 'test-{n}');
    const store = createImageStore();
    const pngData = createTestPng();

    const p1 = await store.save(pngData);
    const p2 = await store.save(pngData);
    const p3 = await store.save(pngData);

    expect(path.basename(p1)).toBe('test-1.png');
    expect(path.basename(p2)).toBe('test-2.png');
    expect(path.basename(p3)).toBe('test-3.png');
  });

  it('save + heavy cleanup cycle — 25 saves with maxImages=20 leaves only 20', async () => {
    setConfig('maxImages', 20);
    const store = createImageStore();
    const pngData = createTestPng();

    // Save 25 images sequentially (each triggers cleanup)
    for (let i = 0; i < 25; i++) {
      await store.save(pngData);
    }

    const imageDir = path.join(tmpDir, '.tip-images');
    const remaining = fs.readdirSync(imageDir).filter((f) => f.endsWith('.png'));
    expect(remaining).toHaveLength(20);
  });

  it('JPEG format save — correct extension and SOI marker', async () => {
    const store = createImageStore();
    const jpegData = createTestJpeg();

    const filePath = await store.save(jpegData, 'jpeg');

    expect(filePath).toMatch(/\.jpg$/);
    expect(fs.existsSync(filePath)).toBe(true);

    const contents = fs.readFileSync(filePath);
    // Verify the JPEG SOI marker is present at the start
    expect(contents.subarray(0, JPEG_SOI.length).equals(JPEG_SOI)).toBe(true);
  });
});
