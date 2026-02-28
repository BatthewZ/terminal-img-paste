import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
vi.mock('../src/util/exec', () => ({
  exec: vi.fn(),
  execBuffer: vi.fn(),
}));

vi.mock('fs', () => ({
  promises: {
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(Buffer.from('converted-data')),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}));

import { convertImage } from '../src/image/convert';
import { exec, execBuffer } from '../src/util/exec';
import { logger } from '../src/util/logger';
import * as fs from 'fs';
import type { PlatformInfo } from '../src/platform/detect';

const mockedExec = vi.mocked(exec);
const mockedExecBuffer = vi.mocked(execBuffer);

function makePlatform(overrides: Partial<PlatformInfo> = {}): PlatformInfo {
  return {
    os: 'linux',
    isWSL: false,
    displayServer: 'x11',
    powershellPath: null,
    ...overrides,
  };
}

describe('image/convert', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Re-establish default mocks
    vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.promises.readFile).mockResolvedValue(Buffer.from('converted-data') as any);
    vi.mocked(fs.promises.unlink).mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // No conversion needed
  // -------------------------------------------------------------------------
  describe('no conversion needed', () => {
    it('returns original data when saveFormat is "auto"', async () => {
      const data = Buffer.from('original-png-data');
      const result = await convertImage(data, 'png', 'auto', makePlatform());

      expect(result.data).toBe(data);
      expect(result.format).toBe('png');
      expect(mockedExec).not.toHaveBeenCalled();
      expect(mockedExecBuffer).not.toHaveBeenCalled();
    });

    it('returns original data when source format matches target', async () => {
      const data = Buffer.from('original-png-data');
      const result = await convertImage(data, 'png', 'png', makePlatform());

      expect(result.data).toBe(data);
      expect(result.format).toBe('png');
      expect(mockedExec).not.toHaveBeenCalled();
      expect(mockedExecBuffer).not.toHaveBeenCalled();
    });

    it('returns original data when source is jpeg and target is jpeg', async () => {
      const data = Buffer.from('original-jpeg-data');
      const result = await convertImage(data, 'jpeg', 'jpeg', makePlatform());

      expect(result.data).toBe(data);
      expect(result.format).toBe('jpeg');
    });
  });

  // -------------------------------------------------------------------------
  // macOS: sips conversion
  // -------------------------------------------------------------------------
  describe('macOS sips conversion', () => {
    const macPlatform = makePlatform({ os: 'macos' });

    it('converts JPEG to PNG using sips with temp files', async () => {
      const inputData = Buffer.from('jpeg-data');
      const convertedData = Buffer.from('png-data');

      vi.mocked(fs.promises.readFile).mockResolvedValue(convertedData as any);
      mockedExec.mockResolvedValue({ stdout: '', stderr: '' });

      const result = await convertImage(inputData, 'jpeg', 'png', macPlatform);

      expect(result.data).toEqual(convertedData);
      expect(result.format).toBe('png');

      // Verify temp file was written
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('tip-convert-in-'),
        inputData,
        { flag: 'wx', mode: 0o600 },
      );

      // Verify sips was called with correct arguments
      expect(mockedExec).toHaveBeenCalledWith('sips', [
        '--setProperty',
        'format',
        'png',
        expect.stringContaining('tip-convert-in-'),
        '--out',
        expect.stringContaining('tip-convert-out-'),
      ]);

      // Verify temp files were cleaned up
      expect(fs.promises.unlink).toHaveBeenCalledTimes(2);
    });

    it('converts PNG to JPEG using sips', async () => {
      const inputData = Buffer.from('png-data');
      const convertedData = Buffer.from('jpeg-data');

      vi.mocked(fs.promises.readFile).mockResolvedValue(convertedData as any);
      mockedExec.mockResolvedValue({ stdout: '', stderr: '' });

      const result = await convertImage(inputData, 'png', 'jpeg', macPlatform);

      expect(result.data).toEqual(convertedData);
      expect(result.format).toBe('jpeg');

      expect(mockedExec).toHaveBeenCalledWith('sips', [
        '--setProperty',
        'format',
        'jpeg',
        expect.any(String),
        '--out',
        expect.stringContaining('.jpg'),
      ]);
    });

    it('cleans up temp files even when sips fails', async () => {
      const inputData = Buffer.from('bad-data');
      mockedExec.mockRejectedValue(new Error('sips: could not open input'));

      const result = await convertImage(inputData, 'bmp', 'png', macPlatform);

      // Falls back to original data
      expect(result.data).toBe(inputData);
      expect(result.format).toBe('bmp');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('conversion from bmp to png failed'),
      );
      // Temp files still cleaned up
      expect(fs.promises.unlink).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // Linux: ImageMagick conversion
  // -------------------------------------------------------------------------
  describe('Linux ImageMagick conversion', () => {
    const linuxPlatform = makePlatform({ os: 'linux' });

    it('converts JPEG to PNG using ImageMagick convert', async () => {
      const inputData = Buffer.from('jpeg-data');
      const convertedData = Buffer.from('png-data');

      // which convert succeeds
      mockedExec.mockResolvedValue({ stdout: '/usr/bin/convert', stderr: '' });
      mockedExecBuffer.mockResolvedValue({ stdout: convertedData, stderr: '' });

      const result = await convertImage(inputData, 'jpeg', 'png', linuxPlatform);

      expect(result.data).toEqual(convertedData);
      expect(result.format).toBe('png');

      // Verify which was called
      expect(mockedExec).toHaveBeenCalledWith('which', ['convert']);

      // Verify convert was called with correct format specifiers
      expect(mockedExecBuffer).toHaveBeenCalledWith(
        'convert',
        ['jpeg:-', 'png:-'],
        { input: inputData },
      );
    });

    it('converts PNG to JPEG using ImageMagick convert', async () => {
      const inputData = Buffer.from('png-data');
      const convertedData = Buffer.from('jpeg-data');

      mockedExec.mockResolvedValue({ stdout: '/usr/bin/convert', stderr: '' });
      mockedExecBuffer.mockResolvedValue({ stdout: convertedData, stderr: '' });

      const result = await convertImage(inputData, 'png', 'jpeg', linuxPlatform);

      expect(result.data).toEqual(convertedData);
      expect(result.format).toBe('jpeg');

      expect(mockedExecBuffer).toHaveBeenCalledWith(
        'convert',
        ['png:-', 'jpeg:-'],
        { input: inputData },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Linux: ffmpeg fallback
  // -------------------------------------------------------------------------
  describe('Linux ffmpeg fallback', () => {
    const linuxPlatform = makePlatform({ os: 'linux' });

    it('falls back to ffmpeg when ImageMagick is not available', async () => {
      const inputData = Buffer.from('jpeg-data');
      const convertedData = Buffer.from('png-data');

      // which convert fails, which ffmpeg succeeds
      mockedExec
        .mockRejectedValueOnce(new Error('not found'))
        .mockResolvedValueOnce({ stdout: '/usr/bin/ffmpeg', stderr: '' });
      mockedExecBuffer.mockResolvedValue({ stdout: convertedData, stderr: '' });

      const result = await convertImage(inputData, 'jpeg', 'png', linuxPlatform);

      expect(result.data).toEqual(convertedData);
      expect(result.format).toBe('png');

      // Verify ffmpeg was called with correct codec
      expect(mockedExecBuffer).toHaveBeenCalledWith(
        'ffmpeg',
        [
          '-hide_banner', '-loglevel', 'error',
          '-f', 'image2pipe', '-i', '-',
          '-f', 'image2', '-c:v', 'png', '-',
        ],
        { input: inputData },
      );
    });

    it('uses mjpeg codec when converting to jpeg via ffmpeg', async () => {
      const inputData = Buffer.from('png-data');
      const convertedData = Buffer.from('jpeg-data');

      mockedExec
        .mockRejectedValueOnce(new Error('not found'))
        .mockResolvedValueOnce({ stdout: '/usr/bin/ffmpeg', stderr: '' });
      mockedExecBuffer.mockResolvedValue({ stdout: convertedData, stderr: '' });

      const result = await convertImage(inputData, 'png', 'jpeg', linuxPlatform);

      expect(result.data).toEqual(convertedData);
      expect(result.format).toBe('jpeg');

      expect(mockedExecBuffer).toHaveBeenCalledWith(
        'ffmpeg',
        expect.arrayContaining(['-c:v', 'mjpeg']),
        { input: inputData },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Graceful fallback: no tool available
  // -------------------------------------------------------------------------
  describe('graceful fallback when no tool is available', () => {
    it('returns original data with warning when no Linux tool is found', async () => {
      const inputData = Buffer.from('jpeg-data');
      const linuxPlatform = makePlatform({ os: 'linux' });

      // Both which calls fail
      mockedExec
        .mockRejectedValueOnce(new Error('not found'))
        .mockRejectedValueOnce(new Error('not found'));

      const result = await convertImage(inputData, 'jpeg', 'png', linuxPlatform);

      expect(result.data).toBe(inputData);
      expect(result.format).toBe('jpeg');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('conversion from jpeg to png failed'),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Graceful fallback: conversion error
  // -------------------------------------------------------------------------
  describe('graceful fallback on conversion error', () => {
    it('returns original data when conversion tool throws', async () => {
      const inputData = Buffer.from('bad-data');
      const linuxPlatform = makePlatform({ os: 'linux' });

      // which convert succeeds, but conversion fails
      mockedExec.mockResolvedValue({ stdout: '/usr/bin/convert', stderr: '' });
      mockedExecBuffer.mockRejectedValue(new Error('convert: corrupt image'));

      const result = await convertImage(inputData, 'jpeg', 'png', linuxPlatform);

      expect(result.data).toBe(inputData);
      expect(result.format).toBe('jpeg');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('saving in native format'),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Windows/WSL: PowerShell conversion
  // -------------------------------------------------------------------------
  describe('Windows/WSL PowerShell conversion', () => {
    it('converts using PowerShell on WSL', async () => {
      const inputData = Buffer.from('jpeg-data');
      const convertedData = Buffer.from('png-data');
      const wslPlatform = makePlatform({
        os: 'linux',
        isWSL: true,
        powershellPath: '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
      });

      mockedExecBuffer.mockResolvedValue({ stdout: convertedData, stderr: '' });

      const result = await convertImage(inputData, 'jpeg', 'png', wslPlatform);

      expect(result.data).toEqual(convertedData);
      expect(result.format).toBe('png');

      expect(mockedExecBuffer).toHaveBeenCalledWith(
        '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
        ['-NoProfile', '-EncodedCommand', expect.any(String)],
        { input: inputData },
      );
    });

    it('converts to JPEG using PowerShell with correct format enum', async () => {
      const inputData = Buffer.from('png-data');
      const convertedData = Buffer.from('jpeg-data');
      const winPlatform = makePlatform({
        os: 'windows',
        powershellPath: 'powershell.exe',
      });

      mockedExecBuffer.mockResolvedValue({ stdout: convertedData, stderr: '' });

      const result = await convertImage(inputData, 'png', 'jpeg', winPlatform);

      expect(result.data).toEqual(convertedData);
      expect(result.format).toBe('jpeg');

      expect(mockedExecBuffer).toHaveBeenCalledWith(
        'powershell.exe',
        ['-NoProfile', '-EncodedCommand', expect.any(String)],
        { input: inputData },
      );
    });

    it('falls back when WSL has no powershellPath', async () => {
      const inputData = Buffer.from('jpeg-data');
      const wslPlatform = makePlatform({
        os: 'linux',
        isWSL: true,
        powershellPath: null,
      });

      const result = await convertImage(inputData, 'jpeg', 'png', wslPlatform);

      expect(result.data).toBe(inputData);
      expect(result.format).toBe('jpeg');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('conversion from jpeg to png failed'),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Format returned correctly
  // -------------------------------------------------------------------------
  describe('returned format is correct', () => {
    it('JPEG to PNG conversion returns format "png"', async () => {
      const macPlatform = makePlatform({ os: 'macos' });
      mockedExec.mockResolvedValue({ stdout: '', stderr: '' });
      vi.mocked(fs.promises.readFile).mockResolvedValue(Buffer.from('png-out') as any);

      const result = await convertImage(Buffer.from('input'), 'jpeg', 'png', macPlatform);
      expect(result.format).toBe('png');
    });

    it('PNG to JPEG conversion returns format "jpeg"', async () => {
      const macPlatform = makePlatform({ os: 'macos' });
      mockedExec.mockResolvedValue({ stdout: '', stderr: '' });
      vi.mocked(fs.promises.readFile).mockResolvedValue(Buffer.from('jpeg-out') as any);

      const result = await convertImage(Buffer.from('input'), 'png', 'jpeg', macPlatform);
      expect(result.format).toBe('jpeg');
    });
  });

  // -------------------------------------------------------------------------
  // Unknown source format
  // -------------------------------------------------------------------------
  describe('unknown source format', () => {
    it('attempts conversion from unknown format; falls back on failure', async () => {
      const inputData = Buffer.from('mystery-data');
      const linuxPlatform = makePlatform({ os: 'linux' });

      mockedExec.mockResolvedValue({ stdout: '/usr/bin/convert', stderr: '' });
      mockedExecBuffer.mockRejectedValue(new Error('unknown format'));

      const result = await convertImage(inputData, 'unknown', 'png', linuxPlatform);

      expect(result.data).toBe(inputData);
      expect(result.format).toBe('unknown');
    });

    it('succeeds when converting from unknown format with ImageMagick', async () => {
      const inputData = Buffer.from('mystery-data');
      const convertedData = Buffer.from('png-data');
      const linuxPlatform = makePlatform({ os: 'linux' });

      mockedExec.mockResolvedValue({ stdout: '/usr/bin/convert', stderr: '' });
      mockedExecBuffer.mockResolvedValue({ stdout: convertedData, stderr: '' });

      const result = await convertImage(inputData, 'unknown', 'png', linuxPlatform);

      expect(result.data).toEqual(convertedData);
      expect(result.format).toBe('png');
    });
  });
});
