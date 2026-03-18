/**
 * Async sleep for an approximate number of milliseconds.
 */
export async function sleep(ms = 0): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Sleep for a random but short length of time, e.g. to simulate asynchronous
 * operations completing in a non-deterministic order.
 */
export async function jitter(): Promise<void> {
  await sleep(Math.random() * 2);
}
