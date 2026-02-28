import * as fs from 'fs';
import * as path from 'path';

const MAX_COLLISION_RETRIES = 100;

/**
 * Write a buffer to disk with restrictive permissions (owner read/write only)
 * using exclusive-create to prevent silently overwriting existing files.
 *
 * On filename collision, retries with `-1`, `-2`, … suffixes inserted before
 * the file extension. Returns the actual path written.
 */
export async function writeSecureFile(filePath: string, data: Buffer): Promise<string> {
  try {
    await fs.promises.writeFile(filePath, data, { flag: 'wx', mode: 0o600 });
    return filePath;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw err;
    }
  }

  // Collision — retry with incrementing suffix
  const ext = path.extname(filePath);
  const base = filePath.slice(0, filePath.length - ext.length);

  for (let i = 1; i <= MAX_COLLISION_RETRIES; i++) {
    const candidate = `${base}-${i}${ext}`;
    try {
      await fs.promises.writeFile(candidate, data, { flag: 'wx', mode: 0o600 });
      return candidate;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw err;
      }
    }
  }

  throw new Error(`Unable to write file after ${MAX_COLLISION_RETRIES} retries: ${filePath}`);
}
