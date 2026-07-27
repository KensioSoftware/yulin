import { AsyncLocalStorage } from "node:async_hooks";
import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { makeSimClockDate } from "../../../../util/clock/sim-clock-date.js";

/**
 * The clock the substitute Date reads.
 *
 * An invocation in progress lends its own clock; anything else in the process
 * carries on reading the host clock, which is what keeps the substitute inert
 * outside a sim Lambda invocation.
 */
class SimLambdaAmbientClock implements SimClock {
  constructor(
    private readonly storage: AsyncLocalStorage<SimClock>,
    private readonly hostDate: DateConstructor,
  ) {}

  /**
   * Get the time the code running right now should see.
   */
  now(): Date {
    const invocationClock = this.storage.getStore();

    if (invocationClock === undefined) {
      return new this.hostDate();
    }

    // Read outside the store, because a simulation's clock is itself often
    // built on `new Date()`. Left inside it, that read would come straight
    // back here and never terminate.
    return this.storage.exit(() => invocationClock.now());
  }
}

/**
 * The time a sim Lambda handler function sees while it runs.
 *
 * A handler backed by a real in-process function is a closure over its own
 * module scope, so it reads the global Date like any other code in the test
 * run. Zip code has a vm sandbox with a Date of its own and needs none of
 * this. Node.js asynchronous context tracking bridges the gap for the
 * in-process case, exactly as it does for process.env: the invocation's clock
 * is held in an AsyncLocalStorage store, and Date resolves to it while it is
 * set.
 *
 * The store follows the invocation across await points, so concurrent
 * invocations of functions belonging to different simulations each read their
 * own time.
 *
 * What this cannot reach is a time already read. A handler module doing
 * `const startedAt = Date.now()` at module scope is evaluated when the test
 * file imports it, long before any invocation.
 */
class SimLambdaProcessClock {
  private readonly storage = new AsyncLocalStorage<SimClock>();
  private hostDate: DateConstructor = Date;
  private installed = false;

  /**
   * Run an invocation with the given clock as its sense of the current time.
   */
  async run<T>(clock: SimClock, run: () => Promise<T>): Promise<T> {
    this.install();
    return await this.storage.run(clock, run);
  }

  /**
   * The host Date constructor, ignoring any invocation in progress.
   */
  hostDateConstructor(): DateConstructor {
    return this.hostDate;
  }

  /**
   * Replace the global Date with one backed by the invocation store.
   *
   * Installed on the first invocation of an in-process handler rather than at
   * import, so a test run that never uses one is left completely alone. Date
   * is a far busier global than process.env, and a substitute that is only
   * ever built when something actually needs it is easier to reason about.
   *
   * With no invocation running the substitute reports the host time, so an
   * installed patch behaves exactly like no patch at all. It is never removed:
   * removing it would be unsafe while another invocation is in flight, and
   * there is nothing to gain.
   */
  private install(): void {
    if (this.installed) {
      return;
    }

    this.hostDate = Date;
    // Defined rather than assigned, to keep Date the configurable, writable,
    // non-enumerable global property it already was: anything else replacing
    // it, a test framework's fake timers included, has to find what it
    // expects.
    Object.defineProperty(globalThis, "Date", {
      configurable: true,
      writable: true,
      value: makeSimClockDate(
        new SimLambdaAmbientClock(this.storage, this.hostDate),
      ),
    });
    this.installed = true;
  }
}

/**
 * Shared because it patches a process global: one patch, one store.
 */
export const simLambdaProcessClock = new SimLambdaProcessClock();
