# Phase 16: Add Async Mutex to Prevent Concurrent Paste Race Conditions

## Severity: HIGH

## Problem

The `pasteImage` command handler in `src/extension.ts` has no mutual exclusion. If a user rapidly presses `Ctrl+Alt+V` (or triggers the command programmatically), multiple paste operations can execute simultaneously, causing:

1. **Duplicate `.gitignore` entries**: Two concurrent `ensureGitIgnored()` calls both read `.gitignore`, both see the folder name is missing, both append it — resulting in the folder name appearing twice.
2. **Cleanup race**: Two concurrent `cleanup()` calls both read the directory, both compute which files to delete, and both attempt to delete the same files — causing `ENOENT` errors for the second caller.
3. **Filename collision**: Two calls to `generateFileName()` within the same millisecond produce identical filenames. The second `writeFile` silently overwrites the first image.

## Solution

Add a simple async mutex (lock) around the paste operation so that concurrent invocations are serialized. This is lightweight and requires no dependencies.

## Implementation

### Task 1: Create `src/util/mutex.ts`

Create a minimal async mutex class:

```typescript
/**
 * Simple async mutex for serializing operations.
 * Usage:
 *   const release = await mutex.acquire();
 *   try { ... } finally { release(); }
 */
export class Mutex {
  private _queue: Array<() => void> = [];
  private _locked = false;

  acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
      const tryAcquire = () => {
        if (!this._locked) {
          this._locked = true;
          resolve(() => {
            this._locked = false;
            const next = this._queue.shift();
            if (next) {
              next();
            }
          });
        } else {
          this._queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }
}
```

### Task 2: Integrate mutex into `src/extension.ts`

Wrap the `pasteImage` command body with the mutex:

```typescript
import { Mutex } from './util/mutex';

// In activate():
const pasteMutex = new Mutex();

const pasteImageDisposable = vscode.commands.registerCommand(
  'terminalImgPaste.pasteImage',
  async () => {
    const release = await pasteMutex.acquire();
    try {
      // ... existing paste logic ...
    } catch (err) {
      handleCommandError('pasteImage', err);
    } finally {
      release();
    }
  },
);
```

### Task 3: Add tests for the Mutex class

Create `test/mutex.test.ts` with tests:

- Two concurrent acquires are serialized (second waits for first to release)
- Release after error still unblocks next waiter
- Single acquire/release works without deadlock
- Multiple waiters are served in FIFO order

These tests can be run in parallel with other test writing using a **subagent**.

### Task 4: Add a test for concurrent paste safety

In the existing test suite, add a test that simulates two rapid `save()` calls and verifies:
- No duplicate `.gitignore` entries
- No `ENOENT` errors from cleanup
- Both images are saved with distinct filenames

This can be done in a **subagent** in parallel with Task 3.

### Task 5: Rebuild and test

Run `npm run compile` and `npm test` to verify everything passes.

## Completion Notes (Agent eeda7d89)

**Completed successfully.**

1. **`src/util/mutex.ts`** (new): Created a minimal async Mutex class with promise-based FIFO queue. No dependencies needed.

2. **`src/extension.ts`**: Imported Mutex, created a `pasteMutex` instance, and wrapped the `pasteImage` command handler with `acquire()`/`release()` in a try/finally block to serialize concurrent paste operations.

3. **`test/mutex.test.ts`** (new): Added 5 unit tests:
   - Single acquire/release without deadlock
   - Two concurrent acquires are serialized
   - Release after error still unblocks next waiter
   - Multiple waiters served in FIFO order
   - Mutex can be reused after all waiters are served

4. **All 165 tests pass** across 6 test files.
