import * as fs from 'fs';

/**
 * Write a buffer to disk with restrictive permissions (owner read/write only).
 * All image-writing code should use this to ensure consistent 0o600 permissions.
 */
export async function writeSecureFile(filePath: string, data: Buffer): Promise<void> {
  await fs.promises.writeFile(filePath, data, { mode: 0o600 });
}
