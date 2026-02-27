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

/** Factory that creates a mock WebviewPanel for tests. */
function createMockWebviewPanel() {
  const messageListeners: Array<(msg: unknown) => void> = [];
  const disposeListeners: Array<() => void> = [];

  const panel = {
    webview: {
      html: '',
      onDidReceiveMessage: vi.fn((listener: (msg: unknown) => void) => {
        messageListeners.push(listener);
        return { dispose: vi.fn() };
      }),
      postMessage: vi.fn(),
    },
    onDidDispose: vi.fn((listener: () => void) => {
      disposeListeners.push(listener);
      return { dispose: vi.fn() };
    }),
    dispose: vi.fn(() => {
      disposeListeners.forEach((l) => l());
    }),
    reveal: vi.fn(),
    // Test helpers
    __simulateMessage: (msg: unknown) => {
      messageListeners.forEach((l) => l(msg));
    },
    __simulateDispose: () => {
      disposeListeners.forEach((l) => l());
    },
  };
  return panel;
}

// Store last created panel for test access
let __lastCreatedPanel: ReturnType<typeof createMockWebviewPanel> | null = null;

/** Factory that creates a mock WebviewView for sidebar panel tests. */
function createMockWebviewView() {
  const messageListeners: Array<(msg: unknown) => void> = [];
  const disposeListeners: Array<() => void> = [];

  const view = {
    webview: {
      html: '',
      options: {} as Record<string, unknown>,
      onDidReceiveMessage: vi.fn((listener: (msg: unknown) => void) => {
        messageListeners.push(listener);
        return { dispose: vi.fn() };
      }),
      postMessage: vi.fn(),
      asWebviewUri: vi.fn((uri: { fsPath: string }) => uri.fsPath),
      cspSource: 'https://test-csp-source',
    },
    onDidDispose: vi.fn((listener: () => void) => {
      disposeListeners.push(listener);
      return { dispose: vi.fn() };
    }),
    dispose: vi.fn(() => {
      disposeListeners.forEach((l) => l());
    }),
    // Test helpers
    __simulateMessage: (msg: unknown) => {
      messageListeners.forEach((l) => l(msg));
    },
    __simulateDispose: () => {
      disposeListeners.forEach((l) => l());
    },
  };
  return view;
}

let __lastCreatedWebviewView: ReturnType<typeof createMockWebviewView> | null = null;

export const window = {
  createOutputChannel: vi.fn(() => outputChannel),
  createWebviewPanel: vi.fn((..._args: unknown[]) => {
    __lastCreatedPanel = createMockWebviewPanel();
    return __lastCreatedPanel;
  }),
  registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
  showErrorMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  setStatusBarMessage: vi.fn(),
  activeTerminal: terminal,
};

export const ViewColumn = {
  One: 1,
  Two: 2,
  Three: 3,
  Active: -1,
  Beside: -2,
};

const configValues: Record<string, unknown> = {
  folderName: '.tip-images',
  maxImages: 20,
  autoGitIgnore: true,
  sendNewline: false,
  saveFormat: 'auto',
  showPreview: false,
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
  joinPath: vi.fn((base: { fsPath: string }, ...segments: string[]) => {
    const joined = [base.fsPath, ...segments].join('/');
    return { fsPath: joined, scheme: 'file' };
  }),
};

export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];

  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const idx = this.listeners.indexOf(listener);
        if (idx >= 0) this.listeners.splice(idx, 1);
      },
    };
  };

  fire(data: T): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  dispose(): void {
    this.listeners = [];
  }
}

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
  configValues.showPreview = false;
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

// Helper to get last created webview panel for test assertions
export function __getLastCreatedPanel() {
  return __lastCreatedPanel;
}

// Helper to clear last panel reference
export function __clearLastPanel(): void {
  __lastCreatedPanel = null;
}

// Helper to create a mock WebviewView for testing sidebar providers
export function __createMockWebviewView() {
  __lastCreatedWebviewView = createMockWebviewView();
  return __lastCreatedWebviewView;
}

// Helper to clear last webview view reference
export function __clearLastWebviewView(): void {
  __lastCreatedWebviewView = null;
}

// CancellationToken stub for tests
export class CancellationTokenSource {
  token = { isCancellationRequested: false, onCancellationRequested: vi.fn() };
  cancel = vi.fn();
  dispose = vi.fn();
}
