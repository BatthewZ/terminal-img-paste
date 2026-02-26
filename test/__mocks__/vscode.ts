import { vi } from 'vitest';

const outputChannel = {
  appendLine: vi.fn(),
  show: vi.fn(),
  dispose: vi.fn(),
};

const terminal = {
  sendText: vi.fn(),
};

export const window = {
  createOutputChannel: vi.fn(() => outputChannel),
  showErrorMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  activeTerminal: terminal,
};

const configValues: Record<string, unknown> = {
  folderName: '.tip-images',
  maxImages: 20,
  autoGitIgnore: true,
  sendNewline: false,
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
}
