import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PlatformInfo } from '../platform/detect';
import { ClipboardFormat } from '../clipboard/types';
import { exec, execBuffer } from '../util/exec';
import { logger } from '../util/logger';

export type SaveFormat = 'auto' | 'png' | 'jpeg';

export interface ConversionResult {
  data: Buffer;
  format: ClipboardFormat;
}

type ConversionTool = 'sips' | 'magick' | 'ffmpeg' | 'powershell';

/**
 * If conversion is needed (saveFormat !== 'auto' and differs from source format),
 * convert using platform-native tools. Returns original data if:
 * - saveFormat is 'auto'
 * - source format already matches target
 * - conversion tool is unavailable (with a warning logged)
 */
export async function convertImage(
  data: Buffer,
  sourceFormat: ClipboardFormat,
  targetFormat: SaveFormat,
  platform: PlatformInfo,
): Promise<ConversionResult> {
  if (targetFormat === 'auto' || sourceFormat === targetFormat) {
    return { data, format: sourceFormat };
  }

  try {
    const converted = await convertWithPlatformTool(
      data,
      sourceFormat,
      targetFormat,
      platform,
    );
    return { data: converted, format: targetFormat };
  } catch (err) {
    logger.warn(
      `Image conversion from ${sourceFormat} to ${targetFormat} failed, saving in native format: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { data, format: sourceFormat };
  }
}

async function findConversionTool(
  platform: PlatformInfo,
): Promise<ConversionTool | null> {
  if (platform.os === 'macos') {
    return 'sips';
  }

  if (platform.os === 'windows' || platform.isWSL) {
    if (platform.powershellPath) {
      return 'powershell';
    }
    return null;
  }

  // Linux: try ImageMagick first, then ffmpeg
  try {
    await exec('which', ['convert']);
    return 'magick';
  } catch {
    /* not found */
  }
  try {
    await exec('which', ['ffmpeg']);
    return 'ffmpeg';
  } catch {
    /* not found */
  }
  return null;
}

async function convertWithPlatformTool(
  data: Buffer,
  sourceFormat: ClipboardFormat,
  targetFormat: SaveFormat,
  platform: PlatformInfo,
): Promise<Buffer> {
  const tool = await findConversionTool(platform);

  if (tool === null) {
    throw new Error('No conversion tool available');
  }

  switch (tool) {
    case 'sips':
      return convertWithSips(data, targetFormat);
    case 'magick':
      return convertWithMagick(data, sourceFormat, targetFormat);
    case 'ffmpeg':
      return convertWithFfmpeg(data, targetFormat);
    case 'powershell':
      return convertWithPowershell(data, targetFormat, platform.powershellPath!);
  }
}

async function convertWithSips(
  data: Buffer,
  targetFormat: SaveFormat,
): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `tip-convert-in-${Date.now()}`);
  const targetExt = targetFormat === 'jpeg' ? 'jpg' : 'png';
  const outputPath = path.join(tmpDir, `tip-convert-out-${Date.now()}.${targetExt}`);

  await fs.promises.writeFile(inputPath, data, { mode: 0o600 });
  try {
    const sipsFormat = targetFormat === 'jpeg' ? 'jpeg' : 'png';
    await exec('sips', [
      '--setProperty',
      'format',
      sipsFormat,
      inputPath,
      '--out',
      outputPath,
    ]);
    return await fs.promises.readFile(outputPath);
  } finally {
    await fs.promises.unlink(inputPath).catch(() => {});
    await fs.promises.unlink(outputPath).catch(() => {});
  }
}

async function convertWithMagick(
  data: Buffer,
  sourceFormat: ClipboardFormat,
  targetFormat: SaveFormat,
): Promise<Buffer> {
  const inputSpec = `${sourceFormat}:-`;
  const outputSpec = `${targetFormat}:-`;
  const result = await execBuffer('convert', [inputSpec, outputSpec], {
    input: data,
  });
  return result.stdout;
}

async function convertWithFfmpeg(
  data: Buffer,
  targetFormat: SaveFormat,
): Promise<Buffer> {
  const codec = targetFormat === 'png' ? 'png' : 'mjpeg';
  const result = await execBuffer(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'image2pipe',
      '-i',
      '-',
      '-f',
      'image2',
      '-c:v',
      codec,
      '-',
    ],
    { input: data },
  );
  return result.stdout;
}

async function convertWithPowershell(
  data: Buffer,
  targetFormat: SaveFormat,
  powershellPath: string,
): Promise<Buffer> {
  const formatEnum = targetFormat === 'png' ? 'Png' : 'Jpeg';
  const script = `
Add-Type -AssemblyName System.Drawing
$stdin = [Console]::OpenStandardInput()
$ms = New-Object System.IO.MemoryStream
$stdin.CopyTo($ms)
$ms.Position = 0
$img = [System.Drawing.Image]::FromStream($ms)
$outMs = New-Object System.IO.MemoryStream
$img.Save($outMs, [System.Drawing.Imaging.ImageFormat]::${formatEnum})
[Console]::OpenStandardOutput().Write($outMs.ToArray(), 0, $outMs.Length)
$img.Dispose()
$ms.Dispose()
$outMs.Dispose()
`;
  const result = await execBuffer(
    powershellPath,
    ['-NoProfile', '-Command', script],
    { input: data },
  );
  return result.stdout;
}
