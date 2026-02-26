import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExecResult, ExecBufferResult } from "../src/util/exec";

// Mock child_process before importing the module under test
vi.mock("child_process");

// We need to import after the mock is set up
import { exec, execBuffer } from "../src/util/exec";
import { execFile } from "child_process";

const mockedExecFile = vi.mocked(execFile);

describe("util/exec", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // -----------------------------------------------------------------------
  // exec() - string mode
  // -----------------------------------------------------------------------
  describe("exec", () => {
    it("resolves with stdout and stderr on success", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, "hello stdout", "hello stderr");
        }) as any,
      );

      const result: ExecResult = await exec("echo", ["hello"]);
      expect(result.stdout).toBe("hello stdout");
      expect(result.stderr).toBe("hello stderr");
    });

    it("passes command and args to execFile", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, "", "");
        }) as any,
      );

      await exec("my-command", ["--flag", "value"]);
      expect(mockedExecFile).toHaveBeenCalledWith(
        "my-command",
        ["--flag", "value"],
        expect.objectContaining({ encoding: "utf-8" }),
        expect.any(Function),
      );
    });

    it("uses the default timeout of 10000ms when none is provided", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, "", "");
        }) as any,
      );

      await exec("cmd", []);
      expect(mockedExecFile).toHaveBeenCalledWith(
        "cmd",
        [],
        expect.objectContaining({ timeout: 10_000 }),
        expect.any(Function),
      );
    });

    it("passes through a custom timeout", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, "", "");
        }) as any,
      );

      await exec("cmd", [], { timeout: 5000 });
      expect(mockedExecFile).toHaveBeenCalledWith(
        "cmd",
        [],
        expect.objectContaining({ timeout: 5000 }),
        expect.any(Function),
      );
    });

    it("passes through a custom cwd", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, "", "");
        }) as any,
      );

      await exec("cmd", [], { cwd: "/some/dir" });
      expect(mockedExecFile).toHaveBeenCalledWith(
        "cmd",
        [],
        expect.objectContaining({ cwd: "/some/dir" }),
        expect.any(Function),
      );
    });

    it("passes through both timeout and cwd options", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, "", "");
        }) as any,
      );

      await exec("cmd", [], { timeout: 3000, cwd: "/other/dir" });
      expect(mockedExecFile).toHaveBeenCalledWith(
        "cmd",
        [],
        expect.objectContaining({ timeout: 3000, cwd: "/other/dir" }),
        expect.any(Function),
      );
    });

    it("rejects with an error containing the command name on failure", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          const err = new Error("command not found");
          cb(err, "", "");
        }) as any,
      );

      await expect(exec("nonexistent", [])).rejects.toThrow(
        /Command "nonexistent" failed/,
      );
    });

    it("includes stderr in the error message when available", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          const err = new Error("failed");
          cb(err, "", "permission denied");
        }) as any,
      );

      await expect(exec("cmd", [])).rejects.toThrow("permission denied");
    });

    it("includes error.message when stderr is empty", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          const err = new Error("ENOENT: file not found");
          cb(err, "", "");
        }) as any,
      );

      await expect(exec("cmd", [])).rejects.toThrow("ENOENT: file not found");
    });

    it("includes numeric exit code in the error message", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          const err = new Error("process exited with code 1") as any;
          err.code = 1;
          cb(err, "", "some error");
        }) as any,
      );

      await expect(exec("cmd", [])).rejects.toThrow("exit code 1");
    });

    it("includes string error code (e.g. ENOENT) in the error message", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          const err: NodeJS.ErrnoException = new Error("spawn error");
          err.code = "ENOENT";
          cb(err, "", "");
        }) as any,
      );

      await expect(exec("cmd", [])).rejects.toThrow("exit code ENOENT");
    });

    it("uses 'unknown' when error has no code property", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          const err = new Error("mysterious failure");
          cb(err, "", "");
        }) as any,
      );

      await expect(exec("cmd", [])).rejects.toThrow("exit code unknown");
    });

    it("resolves with empty strings when command produces no output", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, "", "");
        }) as any,
      );

      const result = await exec("cmd", []);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
    });

    it("uses the default maxBuffer of 10MB when none is provided", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, "", "");
        }) as any,
      );

      await exec("cmd", []);
      expect(mockedExecFile).toHaveBeenCalledWith(
        "cmd",
        [],
        expect.objectContaining({ maxBuffer: 10 * 1024 * 1024 }),
        expect.any(Function),
      );
    });

    it("passes through a custom maxBuffer", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, "", "");
        }) as any,
      );

      await exec("cmd", [], { maxBuffer: 2 * 1024 * 1024 });
      expect(mockedExecFile).toHaveBeenCalledWith(
        "cmd",
        [],
        expect.objectContaining({ maxBuffer: 2 * 1024 * 1024 }),
        expect.any(Function),
      );
    });
  });

  // -----------------------------------------------------------------------
  // execBuffer() - buffer mode
  // -----------------------------------------------------------------------
  describe("execBuffer", () => {
    it("resolves with stdout as Buffer and stderr as string on success", async () => {
      const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
      const stderrBuf = Buffer.from("warning message", "utf-8");

      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, buf, stderrBuf);
        }) as any,
      );

      const result: ExecBufferResult = await execBuffer("xclip", [
        "-selection",
        "clipboard",
        "-t",
        "image/png",
        "-o",
      ]);
      expect(Buffer.isBuffer(result.stdout)).toBe(true);
      expect(result.stdout).toEqual(buf);
      expect(result.stderr).toBe("warning message");
    });

    it("passes command and args to execFile", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, Buffer.alloc(0), Buffer.alloc(0));
        }) as any,
      );

      await execBuffer("my-tool", ["--binary"]);
      expect(mockedExecFile).toHaveBeenCalledWith(
        "my-tool",
        ["--binary"],
        expect.objectContaining({ encoding: "buffer" }),
        expect.any(Function),
      );
    });

    it("uses the default timeout of 10000ms when none is provided", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, Buffer.alloc(0), Buffer.alloc(0));
        }) as any,
      );

      await execBuffer("cmd", []);
      expect(mockedExecFile).toHaveBeenCalledWith(
        "cmd",
        [],
        expect.objectContaining({ timeout: 10_000 }),
        expect.any(Function),
      );
    });

    it("passes through a custom timeout", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, Buffer.alloc(0), Buffer.alloc(0));
        }) as any,
      );

      await execBuffer("cmd", [], { timeout: 30_000 });
      expect(mockedExecFile).toHaveBeenCalledWith(
        "cmd",
        [],
        expect.objectContaining({ timeout: 30_000 }),
        expect.any(Function),
      );
    });

    it("passes through a custom cwd", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, Buffer.alloc(0), Buffer.alloc(0));
        }) as any,
      );

      await execBuffer("cmd", [], { cwd: "/tmp" });
      expect(mockedExecFile).toHaveBeenCalledWith(
        "cmd",
        [],
        expect.objectContaining({ cwd: "/tmp" }),
        expect.any(Function),
      );
    });

    it("rejects with an error containing the command name on failure", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          const err = new Error("process failed");
          cb(err, Buffer.alloc(0), Buffer.from("error output"));
        }) as any,
      );

      await expect(execBuffer("bad-cmd", [])).rejects.toThrow(
        /Command "bad-cmd" failed/,
      );
    });

    it("includes stderr (from Buffer) in the error message", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          const err = new Error("failed");
          cb(err, Buffer.alloc(0), Buffer.from("buffer stderr message"));
        }) as any,
      );

      await expect(execBuffer("cmd", [])).rejects.toThrow(
        "buffer stderr message",
      );
    });

    it("falls back to error.message when stderr buffer is empty", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          const err = new Error("underlying error message");
          cb(err, Buffer.alloc(0), Buffer.alloc(0));
        }) as any,
      );

      await expect(execBuffer("cmd", [])).rejects.toThrow(
        "underlying error message",
      );
    });

    it("includes numeric exit code in the error message", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          const err = new Error("exited") as any;
          err.code = 2;
          cb(err, Buffer.alloc(0), Buffer.from("oops"));
        }) as any,
      );

      await expect(execBuffer("cmd", [])).rejects.toThrow("exit code 2");
    });

    it("includes string error code in the error message", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          const err: NodeJS.ErrnoException = new Error("spawn error");
          err.code = "EACCES";
          cb(err, Buffer.alloc(0), Buffer.alloc(0));
        }) as any,
      );

      await expect(execBuffer("cmd", [])).rejects.toThrow("exit code EACCES");
    });

    it("uses 'unknown' when error has no code property", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          const err = new Error("no code");
          cb(err, Buffer.alloc(0), Buffer.alloc(0));
        }) as any,
      );

      await expect(execBuffer("cmd", [])).rejects.toThrow("exit code unknown");
    });

    it("handles stderr as a non-Buffer (string) gracefully", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          // Simulate an edge case where stderr is returned as a string
          cb(null, Buffer.from("output"), "string stderr");
        }) as any,
      );

      const result = await execBuffer("cmd", []);
      expect(result.stderr).toBe("string stderr");
    });

    it("resolves with empty buffer when command produces no output", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, Buffer.alloc(0), Buffer.alloc(0));
        }) as any,
      );

      const result = await execBuffer("cmd", []);
      expect(result.stdout).toEqual(Buffer.alloc(0));
      expect(result.stderr).toBe("");
    });

    it("converts stderr Buffer to utf-8 string on success", async () => {
      const stderrBuf = Buffer.from("utf-8 encoded warning: \u00e9\u00e0\u00fc", "utf-8");
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, Buffer.from("data"), stderrBuf);
        }) as any,
      );

      const result = await execBuffer("cmd", []);
      expect(result.stderr).toBe("utf-8 encoded warning: \u00e9\u00e0\u00fc");
    });

    it("uses the default maxBuffer of 50MB when none is provided", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, Buffer.alloc(0), Buffer.alloc(0));
        }) as any,
      );

      await execBuffer("cmd", []);
      expect(mockedExecFile).toHaveBeenCalledWith(
        "cmd",
        [],
        expect.objectContaining({ maxBuffer: 50 * 1024 * 1024 }),
        expect.any(Function),
      );
    });

    it("passes through a custom maxBuffer", async () => {
      mockedExecFile.mockImplementation(
        ((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, Buffer.alloc(0), Buffer.alloc(0));
        }) as any,
      );

      await execBuffer("cmd", [], { maxBuffer: 100 * 1024 * 1024 });
      expect(mockedExecFile).toHaveBeenCalledWith(
        "cmd",
        [],
        expect.objectContaining({ maxBuffer: 100 * 1024 * 1024 }),
        expect.any(Function),
      );
    });
  });
});
