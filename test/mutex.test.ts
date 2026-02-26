import { describe, it, expect } from 'vitest';
import { Mutex } from '../src/util/mutex';

describe('Mutex', () => {
  it('allows a single acquire and release without deadlock', async () => {
    const mutex = new Mutex();
    const release = await mutex.acquire();
    release();
  });

  it('serializes two concurrent acquires', async () => {
    const mutex = new Mutex();
    const order: number[] = [];

    const release1 = await mutex.acquire();

    // Start second acquire — it should block until release1 is called
    const promise2 = mutex.acquire().then((release2) => {
      order.push(2);
      release2();
    });

    // First task runs
    order.push(1);
    release1();

    await promise2;

    expect(order).toEqual([1, 2]);
  });

  it('release after error still unblocks next waiter', async () => {
    const mutex = new Mutex();

    const release1 = await mutex.acquire();

    let secondAcquired = false;
    const promise2 = mutex.acquire().then((release2) => {
      secondAcquired = true;
      release2();
    });

    // Simulate error in first task — release in finally
    try {
      throw new Error('task error');
    } catch {
      // error handled
    } finally {
      release1();
    }

    await promise2;
    expect(secondAcquired).toBe(true);
  });

  it('serves multiple waiters in FIFO order', async () => {
    const mutex = new Mutex();
    const order: number[] = [];

    const release1 = await mutex.acquire();

    const promise2 = mutex.acquire().then((release) => {
      order.push(2);
      release();
    });

    const promise3 = mutex.acquire().then((release) => {
      order.push(3);
      release();
    });

    const promise4 = mutex.acquire().then((release) => {
      order.push(4);
      release();
    });

    order.push(1);
    release1();

    await Promise.all([promise2, promise3, promise4]);

    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('can be reused after all waiters are served', async () => {
    const mutex = new Mutex();

    // First round
    const release1 = await mutex.acquire();
    release1();

    // Second round — should acquire immediately
    const release2 = await mutex.acquire();
    release2();
  });
});
