/**
 * The writes in progress against each key of a Bucket, run one at a time.
 *
 * A conditional write reads the key and then writes it, with awaits between
 * the two. Real S3 lets the first of several conditional writes to one key
 * finish and refuses the rest. Running each key's writes in turn gives the
 * same answer, because a write's condition is read after the write before it
 * has landed. Writes to different keys still run side by side.
 */
export class SimS3KeyWrites {
  private readonly pending = new Map<string, Promise<void>>();

  /**
   * Run a write once every earlier write to the same key has settled.
   */
  async exclusive<T>(key: string, write: () => Promise<T>): Promise<T> {
    const running = afterEarlier(this.pending.get(key), write);
    const settled = settle(running);
    this.pending.set(key, settled);

    try {
      return await running;
    } finally {
      if (this.pending.get(key) === settled) {
        this.pending.delete(key);
      }
    }
  }
}

async function afterEarlier<T>(
  earlier: Promise<void> | undefined,
  write: () => Promise<T>,
): Promise<T> {
  await earlier;

  return await write();
}

/**
 * Wait for a write without taking on its failure, which its own caller sees.
 */
async function settle(running: Promise<unknown>): Promise<void> {
  try {
    await running;
  } catch {
    // The next write to the key runs whether this one failed or not.
  }
}
