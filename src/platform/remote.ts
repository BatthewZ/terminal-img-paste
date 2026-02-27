import * as vscode from 'vscode';

export type RemoteContext =
  | { remote: false }
  | { remote: true; type: 'ssh-remote' | 'dev-container' | 'wsl' | 'tunnel' | 'codespaces' | string };

export function detectRemoteContext(): RemoteContext {
  const remoteName = vscode.env.remoteName;

  if (!remoteName) {
    return { remote: false };
  }

  return { remote: true, type: remoteName };
}
