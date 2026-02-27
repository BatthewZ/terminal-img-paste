import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'vscode';
import { detectRemoteContext } from '../src/platform/remote';

beforeEach(() => {
  env.remoteName = undefined;
});

describe('detectRemoteContext', () => {
  it('returns { remote: false } when remoteName is undefined', () => {
    env.remoteName = undefined;
    expect(detectRemoteContext()).toEqual({ remote: false });
  });

  it('returns { remote: false } when remoteName is empty string', () => {
    (env as any).remoteName = '';
    expect(detectRemoteContext()).toEqual({ remote: false });
  });

  it('returns { remote: true, type: "ssh-remote" } for SSH remote', () => {
    env.remoteName = 'ssh-remote';
    expect(detectRemoteContext()).toEqual({ remote: true, type: 'ssh-remote' });
  });

  it('returns { remote: true, type: "dev-container" } for containers', () => {
    env.remoteName = 'dev-container';
    expect(detectRemoteContext()).toEqual({ remote: true, type: 'dev-container' });
  });

  it('returns { remote: true, type: "wsl" } for WSL', () => {
    env.remoteName = 'wsl';
    expect(detectRemoteContext()).toEqual({ remote: true, type: 'wsl' });
  });

  it('returns { remote: true, type: "tunnel" } for tunnels', () => {
    env.remoteName = 'tunnel';
    expect(detectRemoteContext()).toEqual({ remote: true, type: 'tunnel' });
  });

  it('returns { remote: true, type: "codespaces" } for Codespaces', () => {
    env.remoteName = 'codespaces';
    expect(detectRemoteContext()).toEqual({ remote: true, type: 'codespaces' });
  });

  it('returns { remote: true, type } for unknown remote types', () => {
    env.remoteName = 'some-custom-remote';
    expect(detectRemoteContext()).toEqual({ remote: true, type: 'some-custom-remote' });
  });
});
