import type { BackgroundScheduler } from "../../../util/background/background.js";
import {
  type SimStatesAttemptState,
  simStatesFirstAttempt,
} from "../retry/sim-states-attempt-state.js";
import type { SimStatesSettlement } from "./sim-states-settlement.js";
import type { SimStatesStateRunner } from "./sim-states-state-runner.js";
import type {
  SimStatesNextOutcome,
  SimStatesWaitOutcome,
} from "./sim-states-state-outcome.js";
import type {
  SimStatesStateEntry,
  SimStatesWalkOn,
} from "./sim-states-walk.js";

/**
 * The rest of one state's work, once the clock reaches what held it up.
 */
type SimStatesPausedWork = () => Promise<SimStatesNextOutcome | undefined>;

interface SimStatesStateAttemptsProperties {
  readonly runner: SimStatesStateRunner;
  readonly settlement: SimStatesSettlement;
  readonly background: BackgroundScheduler;

  /**
   * How the walk carries on from a state the clock held up.
   */
  readonly walkOn: SimStatesWalkOn;
}

/**
 * Runs the attempts one state takes, and puts the ones it waits for on the
 * clock.
 *
 * A `Wait` state and a `Retry` both hold the execution `RUNNING` until an
 * instant, and both carry on from where they left off once the clock gets
 * there. That is one job, and it is this one. The interpreter is left walking
 * states.
 */
export class SimStatesStateAttempts {
  readonly #settlement: SimStatesSettlement;
  readonly #background: BackgroundScheduler;
  readonly #runner: SimStatesStateRunner;
  readonly #walkOn: SimStatesWalkOn;

  constructor(properties: SimStatesStateAttemptsProperties) {
    this.#runner = properties.runner;
    this.#settlement = properties.settlement;
    this.#background = properties.background;
    this.#walkOn = properties.walkOn;
  }

  /**
   * Run one state until it moves the walk on, ends the execution, or leaves it
   * waiting on the clock.
   *
   * Answers with the outcome the walk carries on from, and with nothing where
   * the execution has ended or is waiting.
   */
  async run(
    entry: SimStatesStateEntry,
  ): Promise<SimStatesNextOutcome | undefined> {
    return await this.#from(
      entry,
      simStatesFirstAttempt(entry.state, this.#background.now()),
    );
  }

  /**
   * Run the attempts a state has left, from the one it is up to.
   *
   * An attempt due at an instant the clock has already reached holds nothing
   * up, so those run round this loop instead of through the scheduler.
   */
  async #from(
    entry: SimStatesStateEntry,
    from: SimStatesAttemptState,
  ): Promise<SimStatesNextOutcome | undefined> {
    let attempt = from;

    for (;;) {
      // One attempt at a time, since each one is only made because the one
      // before it failed.
      // oxlint-disable-next-line eslint/no-await-in-loop
      const outcome = await this.#runner.run(
        entry.state,
        entry.input,
        entry.name,
        attempt,
      );

      if (outcome.kind === "wait") {
        return this.#waited(outcome);
      }

      if (outcome.kind !== "retry") {
        return this.#settlement.settle(outcome);
      }

      if (this.#reached(outcome.until)) {
        attempt = outcome.attempt;
        continue;
      }

      this.#pause(outcome.until, async () =>
        this.#from(entry, outcome.attempt),
      );

      return undefined;
    }
  }

  /**
   * Hold the execution until the clock reaches what a `Wait` state waits for.
   *
   * An instant already reached holds nothing up, and the walk carries straight
   * on. Under a frozen clock anything later waits for as long as the test
   * leaves it.
   */
  #waited(outcome: SimStatesWaitOutcome): SimStatesNextOutcome | undefined {
    if (this.#reached(outcome.until)) {
      return this.#settlement.settle(outcome.resume);
    }

    this.#pause(outcome.until, () =>
      Promise.resolve(this.#settlement.settle(outcome.resume)),
    );

    return undefined;
  }

  /**
   * Put the rest of one state's work on the clock, and the walk after it.
   *
   * One advance covering a whole backoff runs every attempt in it, because
   * work this schedules is itself due by the time the advance reaches it.
   */
  #pause(until: Date, rest: SimStatesPausedWork): void {
    this.#background.scheduleAt(until, async () => {
      const carrying = await rest();

      if (carrying !== undefined) {
        await this.#walkOn(carrying);
      }
    });
  }

  /**
   * Whether simulated time has got to an instant.
   */
  #reached(instant: Date): boolean {
    return instant.getTime() <= this.#background.now().getTime();
  }
}
