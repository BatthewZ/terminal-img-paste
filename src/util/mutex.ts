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
