import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimStatesAttemptState } from "../retry/sim-states-attempt-state.js";
import { simStatesRecovered } from "../retry/sim-states-recovered.js";
import { simStatesTimedOut } from "../retry/sim-states-task-deadline.js";
import { simStatesFailureFrom } from "./sim-states-failure.js";
import { runSimStatesState } from "./sim-states-run-state.js";
import type {
  SimStatesResume,
  SimStatesStateOutcome,
  SimStatesWalkContext,
} from "./sim-states-state-outcome.js";
import type { SimStatesStateEntry } from "./sim-states-walk.js";

interface SimStatesStateRunnerProperties {
  readonly background: BackgroundScheduler;

  /**
   * What this runner gives every state it runs.
   */
  readonly walk: SimStatesWalkContext;
}

/**
 * Runs one attempt at one state of a walk, and never raises.
 *
 * What a state knows about the walk it is running in is gathered here, and so
 * is reading the Amazon States Language error name off whatever a state
 * raised. What a state's `Retry` and `Catch` make of that name is read here
 * too, so a state that failed answers with what the walk does about it. All
 * three leave the interpreter with the walk alone.
 */
export class SimStatesStateRunner {
  readonly #background: BackgroundScheduler;
  readonly #walk: SimStatesWalkContext;

  constructor(properties: SimStatesStateRunnerProperties) {
    this.#background = properties.background;
    this.#walk = properties.walk;
  }

  /**
   * Run one attempt at a state and say what happened, failure included.
   *
   * A state that suspended is recorded when it finishes rather than here, and
   * says what it did through the `resume` it was given.
   */
  async run(
    entry: SimStatesStateEntry,
    attempt: SimStatesAttemptState,
    resume: SimStatesResume,
  ): Promise<SimStatesStateOutcome> {
    const ran = await this.#ran(entry, attempt, resume);

    return ran.kind === "pending" ? ran : this.answered(entry, attempt, ran);
  }

  /**
   * What the walk makes of what one run of a state produced.
   *
   * A state that suspended comes back through here once it has finished, so a
   * `Parallel` state's branches failing is retried and caught the way a task
   * failing is.
   */
  answered(
    entry: SimStatesStateEntry,
    attempt: SimStatesAttemptState,
    ran: SimStatesStateOutcome,
  ): SimStatesStateOutcome {
    this.#walk.record.attempt(
      entry.name,
      ran.kind === "fail" ? ran.error : undefined,
    );

    return simStatesRecovered({
      entry,
      ran,
      attempt,
      now: this.#background.now(),
    });
  }

  /**
   * Run the state itself, or give up on it where its deadline has passed.
   */
  async #ran(
    entry: SimStatesStateEntry,
    attempt: SimStatesAttemptState,
    resume: SimStatesResume,
  ): Promise<SimStatesStateOutcome> {
    const overdue = simStatesTimedOut(
      entry.name,
      attempt,
      this.#background.now(),
    );

    if (overdue !== undefined) {
      return overdue;
    }

    try {
      return await runSimStatesState(entry.state, entry.input, {
        ...this.#walk,
        stateName: entry.name,
        now: this.#background.now(),
        resume,
      });
    } catch (error) {
      return simStatesFailureFrom(error);
    }
  }
}
