import * as path from 'path';
import * as vscode from 'vscode';
import type { PlatformInfo } from '../platform/detect';
import type { ClipboardReader } from '../clipboard/types';
import { FallbackClipboardReader } from '../clipboard/fallback';
import { detectRemoteContext } from '../platform/remote';
import { detectShellType } from '../terminal/shellDetect';
import { collectImagesRecursive } from '../storage/imageStore';
import { logger } from '../util/logger';

export interface DiagnosticReport {
  platform: {
    os: string;
    isWsl: boolean;
    wslVersion: string;
    hasWslg: string;
    displayServer: string;
    powershellPath: string;
  };
  clipboard: {
    readers: Array<{ name: string; available: string }>;
    detectedFormat: string;
  };
  storage: {
    workspaceFolder: string;
    imageFolder: string;
    imageCount: string;
    organizeFolders: string;
    filenamePattern: string;
  };
  settings: {
    maxImages: number;
    autoGitIgnore: boolean;
    sendNewline: boolean;
    showPreview: boolean;
    notifications: string;
    saveFormat: string;
    folderName: string;
    warnOnRemote: boolean;
  };
  terminal: {
    activeShell: string;
    isRemote: boolean;
    remoteName: string;
  };
}

async function countImages(folder: string): Promise<number> {
  return (await collectImagesRecursive(folder)).length;
}

export async function gatherDiagnostics(
  platform: PlatformInfo,
  reader: ClipboardReader,
): Promise<DiagnosticReport> {
  const config = vscode.workspace.getConfiguration('terminalImgPaste');

  // Platform info
  const platformSection = {
    os: platform.os,
    isWsl: platform.isWSL,
    wslVersion: platform.isWSL ? `WSL${platform.wslVersion ?? '?'}` : 'N/A',
    hasWslg: platform.isWSL ? (platform.hasWslg ? 'Yes' : 'No') : 'N/A',
    displayServer: platform.displayServer,
    powershellPath: platform.powershellPath ?? 'N/A',
  };

  // Clipboard readers
  const readerList = reader instanceof FallbackClipboardReader
    ? [...reader.getReaders()]
    : [reader];
  const readers: Array<{ name: string; available: string }> = [];
  for (const r of readerList) {
    const name = r.constructor.name;
    try {
      const avail = await r.isToolAvailable();
      readers.push({ name, available: avail ? 'Yes' : 'No' });
    } catch (err) {
      readers.push({ name, available: `Error: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  let detectedFormat = 'N/A';
  try {
    detectedFormat = await reader.detectFormat();
  } catch (err) {
    detectedFormat = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Storage
  const folders = vscode.workspace.workspaceFolders;
  const workspaceFolder = folders?.[0]?.uri.fsPath ?? 'None';
  const folderName = config.get<string>('folderName', '.tip-images');
  const imageFolder = folders ? path.join(workspaceFolder, folderName) : 'N/A';
  const maxImages = config.get<number>('maxImages', 20);
  const imageCount = folders ? await countImages(imageFolder) : 0;

  // Terminal
  const terminal = vscode.window.activeTerminal;
  const activeShell = terminal ? detectShellType(terminal) : 'No active terminal';
  const remoteCtx = detectRemoteContext();

  return {
    platform: platformSection,
    clipboard: { readers, detectedFormat },
    storage: {
      workspaceFolder,
      imageFolder,
      imageCount: `${imageCount} / ${maxImages}`,
      organizeFolders: config.get<string>('organizeFolders', 'flat'),
      filenamePattern: config.get<string>('filenamePattern', 'img-{timestamp}'),
    },
    settings: {
      maxImages,
      autoGitIgnore: config.get<boolean>('autoGitIgnore', true),
      sendNewline: config.get<boolean>('sendNewline', false),
      showPreview: config.get<boolean>('showPreview', false),
      notifications: config.get<string>('notifications', 'all'),
      saveFormat: config.get<string>('saveFormat', 'auto'),
      folderName,
      warnOnRemote: config.get<boolean>('warnOnRemote', true),
    },
    terminal: {
      activeShell,
      isRemote: remoteCtx.remote,
      remoteName: remoteCtx.remote ? remoteCtx.type : 'N/A',
    },
  };
}

export function formatDiagnosticsMarkdown(report: DiagnosticReport): string {
  const lines: string[] = [];
  lines.push('# Terminal Image Paste — Diagnostics');
  lines.push('');

  // Platform
  lines.push('## Platform');
  lines.push('| Property | Value |');
  lines.push('|----------|-------|');
  lines.push(`| OS | ${report.platform.os} |`);
  lines.push(`| WSL | ${report.platform.isWsl ? `Yes (${report.platform.wslVersion})` : 'No'} |`);
  if (report.platform.isWsl) {
    lines.push(`| WSLg | ${report.platform.hasWslg} |`);
  }
  lines.push(`| Display Server | ${report.platform.displayServer} |`);
  if (report.platform.powershellPath !== 'N/A') {
    lines.push(`| PowerShell Path | ${report.platform.powershellPath} |`);
  }
  lines.push('');

  // Clipboard
  lines.push('## Clipboard');
  lines.push('| Reader | Available |');
  lines.push('|--------|-----------|');
  for (const r of report.clipboard.readers) {
    lines.push(`| ${r.name} | ${r.available} |`);
  }
  lines.push(`| Detected Format | ${report.clipboard.detectedFormat} |`);
  lines.push('');

  // Storage
  lines.push('## Storage');
  lines.push('| Property | Value |');
  lines.push('|----------|-------|');
  lines.push(`| Workspace Folder | ${report.storage.workspaceFolder} |`);
  lines.push(`| Image Folder | ${report.storage.imageFolder} |`);
  lines.push(`| Image Count | ${report.storage.imageCount} |`);
  lines.push(`| Organization | ${report.storage.organizeFolders} |`);
  lines.push(`| Filename Pattern | ${report.storage.filenamePattern} |`);
  lines.push('');

  // Settings
  lines.push('## Settings');
  lines.push('| Setting | Value |');
  lines.push('|---------|-------|');
  lines.push(`| maxImages | ${report.settings.maxImages} |`);
  lines.push(`| autoGitIgnore | ${report.settings.autoGitIgnore} |`);
  lines.push(`| sendNewline | ${report.settings.sendNewline} |`);
  lines.push(`| showPreview | ${report.settings.showPreview} |`);
  lines.push(`| notifications | ${report.settings.notifications} |`);
  lines.push(`| saveFormat | ${report.settings.saveFormat} |`);
  lines.push(`| warnOnRemote | ${report.settings.warnOnRemote} |`);
  lines.push('');

  // Terminal
  lines.push('## Terminal');
  lines.push('| Property | Value |');
  lines.push('|----------|-------|');
  lines.push(`| Active Shell | ${report.terminal.activeShell} |`);
  lines.push(`| Remote | ${report.terminal.isRemote ? 'Yes' : 'No'} |`);
  if (report.terminal.isRemote) {
    lines.push(`| Remote Name | ${report.terminal.remoteName} |`);
  }
  lines.push('');

  lines.push('---');
  lines.push(`*Generated at ${new Date().toISOString()}*`);
  lines.push('');

  return lines.join('\n');
}

export async function runDiagnostics(
  platform: PlatformInfo,
  reader: ClipboardReader,
): Promise<void> {
  try {
    const report = await gatherDiagnostics(platform, reader);
    const content = formatDiagnosticsMarkdown(report);
    const doc = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
    await vscode.window.showTextDocument(doc);
    logger.info('Diagnostics report generated');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to generate diagnostics report', err);
    vscode.window.showErrorMessage(`Terminal Image Paste: Failed to generate diagnostics — ${message}`);
  }
}
