import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { window } from 'vscode';

vi.unmock('../src/util/logger');

import { createLogger } from '../src/util/logger';

let mockChannel: {
  appendLine: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.restoreAllMocks();

  mockChannel = {
    appendLine: vi.fn(),
    show: vi.fn(),
    dispose: vi.fn(),
  };
  vi.mocked(window.createOutputChannel).mockReturnValue(mockChannel as any);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// createLogger
// ---------------------------------------------------------------------------
describe('createLogger', () => {
  it('creates an OutputChannel with the given name', () => {
    createLogger('Test Channel');
    expect(window.createOutputChannel).toHaveBeenCalledWith('Test Channel');
  });

  it('returns object with info, warn, error, show methods', () => {
    const log = createLogger('Test');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
    expect(typeof log.show).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// info
// ---------------------------------------------------------------------------
describe('info', () => {
  it('appends line with [INFO] level and timestamp', () => {
    vi.setSystemTime(new Date('2026-03-15T10:30:45.123Z'));
    const log = createLogger('Test');
    log.info('hello world');
    expect(mockChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('[INFO] hello world'),
    );
  });
});

// ---------------------------------------------------------------------------
// warn
// ---------------------------------------------------------------------------
describe('warn', () => {
  it('appends line with [WARN] level and timestamp', () => {
    vi.setSystemTime(new Date('2026-03-15T10:30:45.123Z'));
    const log = createLogger('Test');
    log.warn('something is off');
    expect(mockChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('[WARN] something is off'),
    );
  });
});

// ---------------------------------------------------------------------------
// error
// ---------------------------------------------------------------------------
describe('error', () => {
  it('appends line with [ERROR] level and message', () => {
    const log = createLogger('Test');
    log.error('bad thing happened');
    expect(mockChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR] bad thing happened'),
    );
  });

  it('appends error stack when err is an Error with stack', () => {
    const log = createLogger('Test');
    const err = new Error('boom');
    err.stack = 'Error: boom\n    at test.ts:1:1';
    log.error('failed', err);
    const line = mockChannel.appendLine.mock.calls[0][0] as string;
    expect(line).toContain('[ERROR] failed');
    expect(line).toContain('Error: boom\n    at test.ts:1:1');
  });

  it('appends String(err) when err is not an Error', () => {
    const log = createLogger('Test');
    log.error('failed', 'string error');
    const line = mockChannel.appendLine.mock.calls[0][0] as string;
    expect(line).toContain('[ERROR] failed');
    expect(line).toContain('string error');
  });

  it('does not append extra info when err is undefined', () => {
    const log = createLogger('Test');
    log.error('just a message');
    const line = mockChannel.appendLine.mock.calls[0][0] as string;
    expect(line).toMatch(/\[ERROR\] just a message$/);
  });
});

// ---------------------------------------------------------------------------
// show
// ---------------------------------------------------------------------------
describe('show', () => {
  it('calls channel.show()', () => {
    const log = createLogger('Test');
    log.show();
    expect(mockChannel.show).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// timestamp format
// ---------------------------------------------------------------------------
describe('timestamp format', () => {
  it('formats as [HH:MM:SS.mmm]', () => {
    vi.setSystemTime(new Date('2026-01-02T08:05:03.007Z'));
    const log = createLogger('Test');
    log.info('test');
    const line = mockChannel.appendLine.mock.calls[0][0] as string;
    // The timestamp uses local time, so extract whatever the format produces
    const match = line.match(/^\[(\d{2}:\d{2}:\d{2}\.\d{3})\]/);
    expect(match).not.toBeNull();
  });
});
