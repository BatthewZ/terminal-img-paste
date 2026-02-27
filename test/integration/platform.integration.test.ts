import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { detectPlatform } from '../../src/platform/detect';
import type { PlatformInfo } from '../../src/platform/detect';

// ---------------------------------------------------------------------------
// Platform detection integration tests — runs against the real system
// ---------------------------------------------------------------------------

// Detect WSL once for conditional test blocks
const procVersionExists = fs.existsSync('/proc/version');
const procVersionContent = procVersionExists
  ? fs.readFileSync('/proc/version', 'utf-8')
  : '';
const runningInWSL = procVersionExists && /microsoft/i.test(procVersionContent);

describe('detectPlatform integration (real system)', () => {
  let platform: PlatformInfo;

  // detectPlatform() caches its result, so we call it once and
  // verify the returned snapshot is consistent with the running system.
  platform = detectPlatform();

  it('OS detection matches process.platform', () => {
    switch (process.platform) {
      case 'darwin':
        expect(platform.os).toBe('macos');
        break;
      case 'win32':
        expect(platform.os).toBe('windows');
        break;
      default:
        expect(platform.os).toBe('linux');
        break;
    }
  });

  it('return type has all expected properties', () => {
    expect(platform).toHaveProperty('os');
    expect(platform).toHaveProperty('isWSL');
    expect(platform).toHaveProperty('wslVersion');
    expect(platform).toHaveProperty('hasWslg');
    expect(platform).toHaveProperty('displayServer');
    expect(platform).toHaveProperty('powershellPath');

    // Type-level checks
    expect(typeof platform.os).toBe('string');
    expect(typeof platform.isWSL).toBe('boolean');
    expect(typeof platform.hasWslg).toBe('boolean');
    expect(['x11', 'wayland', 'unknown']).toContain(platform.displayServer);
    expect([1, 2, null]).toContain(platform.wslVersion);
    expect(
      platform.powershellPath === null || typeof platform.powershellPath === 'string',
    ).toBe(true);
  });

  describe.skipIf(!runningInWSL)('WSL-specific checks', () => {
    it('isWSL is true when /proc/version contains microsoft', () => {
      expect(platform.isWSL).toBe(true);
    });

    it('powershellPath is a non-null string in WSL', () => {
      expect(platform.powershellPath).not.toBeNull();
      expect(typeof platform.powershellPath).toBe('string');
    });
  });

  describe.skipIf(runningInWSL)('non-WSL checks', () => {
    it('isWSL is false when not in WSL', () => {
      expect(platform.isWSL).toBe(false);
    });
  });

  it('display server detection is consistent with environment', () => {
    // Only meaningful on Linux (non-WSL)
    if (platform.os !== 'linux' || platform.isWSL) {
      // On non-Linux or WSL the result depends on env vars; just verify it is a valid value
      expect(['x11', 'wayland', 'unknown']).toContain(platform.displayServer);
      return;
    }

    const sessionType = process.env.XDG_SESSION_TYPE;
    const waylandDisplay = process.env.WAYLAND_DISPLAY;

    if (sessionType === 'wayland') {
      expect(platform.displayServer).toBe('wayland');
    } else if (sessionType === 'x11') {
      expect(platform.displayServer).toBe('x11');
    } else if (waylandDisplay) {
      expect(platform.displayServer).toBe('wayland');
    } else {
      expect(platform.displayServer).toBe('unknown');
    }
  });
});
