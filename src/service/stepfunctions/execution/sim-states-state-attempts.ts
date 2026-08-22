import type { BackgroundScheduler } from "../../../util/background/background.js";
import {
  type SimStatesAttemptState,
  simStatesFirstAttempt,
} from "../retry/sim-states-attempt-state.js";
import type { SimStatesSettlement } from "./sim-states-settlement.js";
import type { SimStatesStateRunner } from "./sim-states-state-runner.js";
import type {
  SimStatesNextOutcome,
  SimStatesSettledOutcome,
  SimStatesStateOutcome,
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
 * A `Wait` state and a `Retry` both hold the walk `RUNNING` until an instant,
 * and both carry on from where they left off once the clock gets there. A
 * `Parallel` state waits for its branches instead of for an instant, and
 * carries on the same way. That is one job, and it is this one. The
 * interpreter is left walking states.
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
   * Run one state until it moves the walk on, ends it, or leaves it waiting.
   *
   * Answers with the outcome the walk carries on from, and with nothing where
   * the walk has ended or is waiting.
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
   * Make one attempt at a state, and see what the walk does about it.
   */
  async #from(
    entry: SimStatesStateEntry,
    attempt: SimStatesAttemptState,
  ): Promise<SimStatesNextOutcome | undefined> {
    const outcome = await this.#runner.run(entry, attempt, async (settled) => {
      await this.#resumed(entry, attempt, settled);
    });

    return await this.#took(entry, outcome);
  }

  /**
   * What the walk does about one attempt's outcome.
   *
   * An attempt due at an instant the clock has already reached holds nothing
   * up, so it is made from here rather than through the scheduler.
   */
  async #took(
    entry: SimStatesStateEntry,
    outcome: SimStatesStateOutcome,
  ): Promise<SimStatesNextOutcome | undefined> {
    if (outcome.kind === "pending") {
      return undefined;
    }

    if (outcome.kind === "wait") {
      return this.#waited(outcome);
    }

    if (outcome.kind !== "retry") {
      return this.#settlement.settle(outcome);
    }

    if (this.#reached(outcome.until)) {
      return await this.#from(entry, outcome.attempt);
    }

    this.#pause(outcome.until, async () => this.#from(entry, outcome.attempt));

    return undefined;
  }

  /**
   * Carry the walk on from a state that suspended, once it has finished.
   *
   * The walk stopped where the state was, so this takes it from there rather
   * than answering something that is no longer waiting for one.
   */
  async #resumed(
    entry: SimStatesStateEntry,
    attempt: SimStatesAttemptState,
    settled: SimStatesSettledOutcome,
  ): Promise<void> {
    if (this.#settlement.stopped) {
      return;
    }

    const outcome = this.#runner.answered(entry, attempt, settled);

    await this.#walkOn(await this.#took(entry, outcome));
  }

  /**
   * Hold the walk until the clock reaches what a `Wait` state waits for.
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
   * work this schedules is itself due by the time the advance reaches it. A
   * walk that was abandoned while it waited runs none of it.
   */
  #pause(until: Date, rest: SimStatesPausedWork): void {
    this.#background.scheduleAt(until, async () => {
      if (this.#settlement.stopped) {
        return;
      }

      await this.#walkOn(await rest());
    });
  }

  /**
   * Whether simulated time has got to an instant.
   */
  #reached(instant: Date): boolean {
    return instant.getTime() <= this.#background.now().getTime();
  }
}
