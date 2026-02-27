import { vi } from 'vitest';

const outputChannel = {
  appendLine: vi.fn(),
  show: vi.fn(),
  dispose: vi.fn(),
};

const terminal = {
  sendText: vi.fn(),
};

// Command registry for testing command registration
const registeredCommands: Map<string, (...args: unknown[]) => unknown> = new Map();

export const commands = {
  registerCommand: vi.fn((id: string, handler: (...args: unknown[]) => unknown) => {
    registeredCommands.set(id, handler);
    return { dispose: vi.fn() };
  }),
};

export const window = {
  createOutputChannel: vi.fn(() => outputChannel),
  showErrorMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  setStatusBarMessage: vi.fn(),
  activeTerminal: terminal,
};

const configValues: Record<string, unknown> = {
  folderName: '.tip-images',
  maxImages: 20,
  autoGitIgnore: true,
  sendNewline: false,
  saveFormat: 'auto',
  warnOnRemote: true,
  notifications: 'all',
};

export const workspace = {
  getConfiguration: vi.fn(() => ({
    get: vi.fn(<T>(key: string, defaultValue?: T): T => {
      const val = configValues[key];
      return (val !== undefined ? val : defaultValue) as T;
    }),
  })),
  workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
};

export const env: { remoteName: string | undefined } = {
  remoteName: undefined,
};

export const Uri = {
  file: vi.fn((path: string) => ({ fsPath: path, scheme: 'file' })),
};

export const ExtensionContext = vi.fn();

// Helper to override config values in tests
export function __setConfig(key: string, value: unknown): void {
  configValues[key] = value;
}

// Helper to reset config to defaults
export function __resetConfig(): void {
  configValues.folderName = '.tip-images';
  configValues.maxImages = 20;
  configValues.autoGitIgnore = true;
  configValues.sendNewline = false;
  configValues.saveFormat = 'auto';
  configValues.warnOnRemote = true;
  configValues.notifications = 'all';
}

// Helper to set remote name for testing
export function __setRemoteName(name: string | undefined): void {
  env.remoteName = name;
}

// Helper to retrieve a registered command handler for testing
export function __getRegisteredCommand(id: string): ((...args: unknown[]) => unknown) | undefined {
  return registeredCommands.get(id);
}

// Helper to clear registered commands between tests
export function __clearRegisteredCommands(): void {
  registeredCommands.clear();
}
