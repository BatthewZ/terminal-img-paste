import { execFile } from "child_process";

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024; // 10 MB
const DEFAULT_MAX_BUFFER_BINARY = 50 * 1024 * 1024; // 50 MB

function exitCode(error: Error): string | number {
  if ("code" in error && typeof error.code === "number") {
    return error.code;
  }
  return (error as NodeJS.ErrnoException).code ?? "unknown";
}

export interface ExecOptions {
  timeout?: number;
  cwd?: string;
  maxBuffer?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export interface ExecBufferResult {
  stdout: Buffer;
  stderr: string;
}

/**
 * Execute a command with arguments, returning stdout and stderr as strings.
 * Uses `execFile` (no shell) to avoid shell-injection vulnerabilities.
 */
export function exec(
  command: string,
  args: string[],
  options?: ExecOptions,
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        encoding: "utf-8",
        timeout: options?.timeout ?? DEFAULT_TIMEOUT,
        maxBuffer: options?.maxBuffer ?? DEFAULT_MAX_BUFFER,
        cwd: options?.cwd,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `Command "${command}" failed (exit code ${exitCode(error)}): ${stderr || error.message}`,
            ),
          );
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

/**
 * Execute a command with arguments, returning stdout as a raw Buffer and
 * stderr as a string.  Useful for reading binary data (e.g. clipboard
 * images) from tools that write to stdout.
 *
 * Uses `execFile` (no shell) to avoid shell-injection vulnerabilities.
 */
export function execBuffer(
  command: string,
  args: string[],
  options?: ExecOptions,
): Promise<ExecBufferResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        encoding: "buffer",
        timeout: options?.timeout ?? DEFAULT_TIMEOUT,
        maxBuffer: options?.maxBuffer ?? DEFAULT_MAX_BUFFER_BINARY,
        cwd: options?.cwd,
      },
      (error, stdout, stderr) => {
        // stderr comes back as a Buffer when encoding is "buffer"
        const stderrStr =
          stderr instanceof Buffer ? stderr.toString("utf-8") : String(stderr);
        if (error) {
          reject(
            new Error(
              `Command "${command}" failed (exit code ${exitCode(error)}): ${stderrStr || error.message}`,
            ),
          );
          return;
        }
        resolve({ stdout, stderr: stderrStr });
      },
    );
  });
}
