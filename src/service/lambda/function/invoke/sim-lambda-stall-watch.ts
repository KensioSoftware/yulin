import { clearTimeout, setTimeout } from "node:timers";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimLambdaPendingTimer } from "./timer/sim-lambda-pending-timer.js";

const millisecondsPerSecond = 1000;

/** The least host time a stopped clock gets before an invocation is stalled. */
const shortestWatchMilliseconds = 1000;

/** The most host time a stopped clock gets, whatever the function's timeout. */
const longestWatchMilliseconds = 2000;

interface SimLambdaStallWatchProperties {
  readonly background: BackgroundScheduler;

  /** The seconds the invocation has to answer in, on the simulated clock. */
  readonly timeoutSeconds: number;

  /** The timer the invocation is waiting on, where it is waiting on one. */
  readonly waitingOn: () => SimLambdaPendingTimer | undefined;

  /** What happens once the invocation turns out to have no way to finish. */
  readonly stalled: (
    waitingOn: SimLambdaPendingTimer,
    waitedMilliseconds: number,
  ) => void;
}

/**
 * A watch on host time for an invocation the simulated clock has left behind.
 *
 * A handler's timers wait on the simulation's clock, and so does the
 * invocation's deadline. Simulated time standing still holds both, and the
 * invocation runs on until the test framework gives up on the test around it.
 * Elapsed host time is the only thing separating that from a test meaning to
 * start an invocation, advance the clock and then wait for it, which is why
 * host time is what this watches.
 *
 * A turn that finds simulated time has moved starts the wait again, so a test
 * advancing the clock in steps is left alone. The host timer is unreferenced,
 * and an invocation nobody is driving never holds the process open.
 */
export class SimLambdaStallWatch {
  readonly #properties: SimLambdaStallWatchProperties;
  readonly #delay: number;

  #seenAt = 0;
  #hostTimer: NodeJS.Timeout | undefined;

  constructor(properties: SimLambdaStallWatchProperties) {
    this.#properties = properties;
    this.#delay = simLambdaStallWatchDelay(properties.timeoutSeconds);
  }

  /**
   * Start watching, from the instant the clock reads now.
   */
  start(): void {
    this.#seenAt = this.#properties.background.now().getTime();
    this.#arm();
  }

  /**
   * Give up watching, as an invocation that has ended does.
   */
  cancel(): void {
    clearTimeout(this.#hostTimer);
    this.#hostTimer = undefined;
  }

  #arm(): void {
    this.#hostTimer = setTimeout(() => {
      this.#hostTimer = undefined;
      this.#check();
    }, this.#delay);
    this.#hostTimer.unref();
  }

  /**
   * See whether the invocation still has a way to finish, and watch on where
   * it has: either simulated time has moved since the last turn, or the
   * handler is busy with something other than a timer.
   */
  #check(): void {
    const now = this.#properties.background.now().getTime();
    const waitingOn = this.#properties.waitingOn();

    if (waitingOn === undefined || now !== this.#seenAt) {
      this.#seenAt = now;
      this.#arm();

      return;
    }

    this.#properties.stalled(waitingOn, this.#delay);
  }
}

/**
 * How long the host waits before it calls an invocation stalled.
 *
 * The function's own timeout is the bound that fits, since an invocation the
 * deadline would have ended already has nothing left to wait for. It is held
 * between one and two seconds. Below that a loaded host could fail a test that
 * was about to advance the clock, and above it a test framework's own timeout
 * arrives first and takes the diagnostic with it.
 */
function simLambdaStallWatchDelay(timeoutSeconds: number): number {
  return Math.min(
    Math.max(timeoutSeconds * millisecondsPerSecond, shortestWatchMilliseconds),
    longestWatchMilliseconds,
  );
}
