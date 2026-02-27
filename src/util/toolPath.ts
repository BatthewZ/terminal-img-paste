import { execFile } from 'child_process';
import { logger } from './logger';

const cache = new Map<string, string>();

const isWindows = process.platform === 'win32';

/**
 * Resolves a tool name to its absolute path using `which` (Unix) or `where` (Windows).
 * Caches the result for subsequent calls.
 * Returns undefined if the tool is not found.
 */
export async function resolveToolPath(toolName: string): Promise<string | undefined> {
  const cached = cache.get(toolName);
  if (cached !== undefined) {
    return cached;
  }

  const resolver = isWindows ? 'where' : 'which';
  try {
    const resolved = await new Promise<string>((resolve, reject) => {
      execFile(resolver, [toolName], { timeout: 5000 }, (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        // `where` on Windows may return multiple lines; take the first
        const firstLine = stdout.trim().split(/\r?\n/)[0];
        resolve(firstLine);
      });
    });
    cache.set(toolName, resolved);
    return resolved;
  } catch {
    logger.warn(`Could not resolve absolute path for "${toolName}" — using bare name`);
    return undefined;
  }
}

/**
 * Resolve a tool name, returning the absolute path if found or the original name as fallback.
 */
export async function resolveToolPathOrFallback(toolName: string): Promise<string> {
  return (await resolveToolPath(toolName)) ?? toolName;
}

/** Clear the resolved tool path cache (useful for testing). */
export function clearToolPathCache(): void {
  cache.clear();
}
