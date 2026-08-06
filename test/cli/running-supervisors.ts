import type { SimWatchSupervisor } from "../../src/cli/watch/sim-watch-supervisor.js";

const running: { supervisor: SimWatchSupervisor; run: Promise<number> }[] = [];

/**
 * Start a supervisor, and have it stopped when the test ends.
 *
 * A supervisor left running holds a real process and a real watch, so a test
 * that fails part way through would otherwise leave both behind and the test
 * run would not finish. Stopping it belongs in teardown rather than at the end
 * of the test body, which an assertion never reaches.
 */
export function runSupervisor(supervisor: SimWatchSupervisor): void {
  running.push({ supervisor, run: supervisor.run() });
}

/**
 * Stop every supervisor a test started.
 */
export async function stopSupervisors(): Promise<void> {
  const started = [...running];
  running.length = 0;

  await Promise.all(
    started.map(async ({ supervisor, run }) => {
      supervisor.interrupt();

      try {
        await run;
      } catch {
        // A run that failed is the test's business, not the teardown's.
      }
    }),
  );
}
