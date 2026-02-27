/**
 * Generate minimal valid test images for integration tests.
 */

/** Minimal valid 1x1 pixel PNG (89 bytes) */
export function createTestPng(): Buffer {
  // Minimal PNG: signature + IHDR + IDAT + IEND
  // 1x1 pixel, 8-bit RGB, no interlace
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk: width=1, height=1, bit depth=8, color type=2 (RGB)
  const ihdrData = Buffer.from([
    0x00, 0x00, 0x00, 0x01, // width = 1
    0x00, 0x00, 0x00, 0x01, // height = 1
    0x08,                   // bit depth = 8
    0x02,                   // color type = 2 (RGB)
    0x00,                   // compression = deflate
    0x00,                   // filter = adaptive
    0x00,                   // interlace = none
  ]);
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk: zlib-compressed scanline (filter byte 0 + 3 bytes RGB)
  // Raw: [0x00, 0xff, 0x00, 0x00] (filter=none, red pixel)
  // zlib compressed with deflate
  const idatData = Buffer.from([
    0x78, 0x01, 0x62, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x04, 0x00, 0x01,
  ]);
  const idat = createChunk('IDAT', idatData);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

/** Minimal valid JPEG (smallest valid JFIF) */
export function createTestJpeg(): Buffer {
  // SOI + APP0 (JFIF) + minimal SOS + EOI
  // This creates a minimal but technically valid JPEG
  return Buffer.from([
    0xff, 0xd8,             // SOI
    0xff, 0xe0,             // APP0
    0x00, 0x10,             // Length = 16
    0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x01,             // Version 1.1
    0x00,                   // Aspect ratio units (0 = no units)
    0x00, 0x01,             // X density = 1
    0x00, 0x01,             // Y density = 1
    0x00, 0x00,             // No thumbnail
    0xff, 0xd9,             // EOI
  ]);
}

/** PNG magic bytes for validation */
export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** JPEG SOI marker for validation */
export const JPEG_SOI = Buffer.from([0xff, 0xd8]);

function createChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

/** CRC32 implementation for PNG chunks */
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
