import { watchPause } from "./watch-project.js";

/**
 * Wait for the exit to be reported, rather than for a length of time chosen in
 * the hope that it is long enough.
 */
export async function untilExited(
  exits: readonly (number | null)[],
  withinMs = 5000,
): Promise<void> {
  const giveUpAt = Date.now() + withinMs;

  while (exits.length === 0) {
    if (Date.now() >= giveUpAt) {
      throw new Error("The process did not report an exit");
    }

    // eslint-disable-next-line no-await-in-loop
    await watchPause(25);
  }
}
