import { execFile, spawn } from "child_process";

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
  input?: Buffer;
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
 * When `options.input` is provided, uses `spawn` to pipe data to stdin.
 */
export function execBuffer(
  command: string,
  args: string[],
  options?: ExecOptions,
): Promise<ExecBufferResult> {
  if (options?.input) {
    return execBufferWithStdin(command, args, options);
  }

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

/**
 * Internal helper: execute a command with stdin data piped to it.
 * Uses `spawn` (no shell) to pipe input data to the child process's stdin.
 */
function execBufferWithStdin(
  command: string,
  args: string[],
  options: ExecOptions & { input: Buffer },
): Promise<ExecBufferResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER_BINARY;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: options.cwd,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutLen = 0;
    let stderrLen = 0;
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        child.kill("SIGTERM");
        reject(
          new Error(
            `Command "${command}" failed (exit code ETIMEDOUT): timed out after ${timeout}ms`,
          ),
        );
      }
    }, timeout);

    child.stdout!.on("data", (chunk: Buffer) => {
      stdoutLen += chunk.length;
      if (stdoutLen > maxBuffer) {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          child.kill("SIGTERM");
          reject(
            new Error(
              `Command "${command}" failed (exit code ERR_CHILD_PROCESS_STDIO_MAXBUFFER): stdout maxBuffer length exceeded`,
            ),
          );
        }
        return;
      }
      stdoutChunks.push(chunk);
    });

    child.stderr!.on("data", (chunk: Buffer) => {
      stderrLen += chunk.length;
      if (stderrLen <= maxBuffer) {
        stderrChunks.push(chunk);
      }
    });

    child.on("error", (err: Error) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        reject(
          new Error(
            `Command "${command}" failed (exit code ${exitCode(err)}): ${err.message}`,
          ),
        );
      }
    });

    child.on("close", (code: number | null) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);

      const stderrStr = Buffer.concat(stderrChunks).toString("utf-8");
      if (code !== 0) {
        reject(
          new Error(
            `Command "${command}" failed (exit code ${code ?? "unknown"}): ${stderrStr || `process exited with code ${code}`}`,
          ),
        );
        return;
      }
      resolve({
        stdout: Buffer.concat(stdoutChunks),
        stderr: stderrStr,
      });
    });

    // Write input to stdin and close it
    child.stdin!.end(options.input);
  });
}
