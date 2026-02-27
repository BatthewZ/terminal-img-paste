import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window, __setConfig, __resetConfig } from 'vscode';

vi.mock('../src/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), show: vi.fn() },
}));

import { createNotifier, Notifier } from '../src/util/notify';
import { logger } from '../src/util/logger';

let notifier: Notifier;

beforeEach(() => {
  vi.restoreAllMocks();
  __resetConfig();
  notifier = createNotifier();
});

// ---------------------------------------------------------------------------
// statusBar()
// ---------------------------------------------------------------------------
describe('statusBar', () => {
  it('calls setStatusBarMessage when level is "all"', () => {
    __setConfig('notifications', 'all');
    notifier.statusBar('Saved!', 5000);

    expect(window.setStatusBarMessage).toHaveBeenCalledWith('Saved!', 5000);
    expect(logger.info).toHaveBeenCalledWith('Saved!');
  });

  it('uses default duration of 3000ms', () => {
    __setConfig('notifications', 'all');
    notifier.statusBar('Done');

    expect(window.setStatusBarMessage).toHaveBeenCalledWith('Done', 3000);
  });

  it('suppresses at "errors" but still logs', () => {
    __setConfig('notifications', 'errors');
    notifier.statusBar('Saved!');

    expect(window.setStatusBarMessage).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Saved!');
  });

  it('suppresses at "none" but still logs', () => {
    __setConfig('notifications', 'none');
    notifier.statusBar('Saved!');

    expect(window.setStatusBarMessage).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Saved!');
  });
});

// ---------------------------------------------------------------------------
// info()
// ---------------------------------------------------------------------------
describe('info', () => {
  it('calls showInformationMessage when level is "all"', () => {
    __setConfig('notifications', 'all');
    notifier.info('No image found');

    expect(window.showInformationMessage).toHaveBeenCalledWith('No image found');
    expect(logger.info).toHaveBeenCalledWith('No image found');
  });

  it('suppresses at "errors" but still logs', () => {
    __setConfig('notifications', 'errors');
    notifier.info('No image found');

    expect(window.showInformationMessage).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('No image found');
  });

  it('suppresses at "none" but still logs', () => {
    __setConfig('notifications', 'none');
    notifier.info('No image found');

    expect(window.showInformationMessage).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('No image found');
  });
});

// ---------------------------------------------------------------------------
// warning()
// ---------------------------------------------------------------------------
describe('warning', () => {
  it('calls showWarningMessage when level is "all"', async () => {
    __setConfig('notifications', 'all');
    vi.mocked(window.showWarningMessage).mockResolvedValue('OK' as any);

    const result = await notifier.warning('Watch out!', 'OK', 'Cancel');

    expect(window.showWarningMessage).toHaveBeenCalledWith('Watch out!', 'OK', 'Cancel');
    expect(result).toBe('OK');
    expect(logger.warn).toHaveBeenCalledWith('Watch out!');
  });

  it('auto-approves (returns first button) when suppressed at "errors"', async () => {
    __setConfig('notifications', 'errors');

    const result = await notifier.warning('Watch out!', 'OK', 'Cancel');

    expect(window.showWarningMessage).not.toHaveBeenCalled();
    expect(result).toBe('OK');
    expect(logger.warn).toHaveBeenCalledWith('Watch out!');
  });

  it('auto-approves (returns first button) when suppressed at "none"', async () => {
    __setConfig('notifications', 'none');

    const result = await notifier.warning('Watch out!', 'OK', 'Cancel');

    expect(window.showWarningMessage).not.toHaveBeenCalled();
    expect(result).toBe('OK');
    expect(logger.warn).toHaveBeenCalledWith('Watch out!');
  });

  it('returns undefined when suppressed with no buttons', async () => {
    __setConfig('notifications', 'errors');

    const result = await notifier.warning('Just a heads up');

    expect(window.showWarningMessage).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// error()
// ---------------------------------------------------------------------------
describe('error', () => {
  it('calls showErrorMessage when level is "all"', () => {
    __setConfig('notifications', 'all');
    notifier.error('Something broke');

    expect(window.showErrorMessage).toHaveBeenCalledWith('Something broke');
    expect(logger.error).toHaveBeenCalledWith('Something broke');
  });

  it('calls showErrorMessage when level is "errors"', () => {
    __setConfig('notifications', 'errors');
    notifier.error('Something broke');

    expect(window.showErrorMessage).toHaveBeenCalledWith('Something broke');
    expect(logger.error).toHaveBeenCalledWith('Something broke');
  });

  it('suppresses at "none" but still logs', () => {
    __setConfig('notifications', 'none');
    notifier.error('Something broke');

    expect(window.showErrorMessage).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Something broke');
  });
});

// ---------------------------------------------------------------------------
// Default level
// ---------------------------------------------------------------------------
describe('default level', () => {
  it('defaults to "all" when setting is missing', () => {
    // __resetConfig doesn't set 'notifications', so it falls back to default
    notifier.statusBar('Test');

    expect(window.setStatusBarMessage).toHaveBeenCalled();
  });
});
