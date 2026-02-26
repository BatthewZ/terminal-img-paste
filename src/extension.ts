import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const pasteImageDisposable = vscode.commands.registerCommand(
    'terminalImgPaste.pasteImage',
    async () => {
      vscode.window.showInformationMessage('Paste Image command — not yet implemented.');
    }
  );

  const sendPathDisposable = vscode.commands.registerCommand(
    'terminalImgPaste.sendPathToTerminal',
    async (uri: vscode.Uri) => {
      vscode.window.showInformationMessage(
        `Send Path command — not yet implemented. URI: ${uri?.fsPath ?? 'none'}`
      );
    }
  );

  context.subscriptions.push(pasteImageDisposable, sendPathDisposable);
}

export function deactivate(): void {
  // Cleanup will be handled here in future phases
}
