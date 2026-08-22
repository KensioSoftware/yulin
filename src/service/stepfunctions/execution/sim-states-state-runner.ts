import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimStatesState } from "../definition/sim-states-state.js";
import type { SimStatesAttemptState } from "../retry/sim-states-attempt-state.js";
import { simStatesRecover } from "../retry/sim-states-recover.js";
import { simStatesTimedOut } from "../retry/sim-states-task-deadline.js";
import type { SimStatesTaskTargets } from "../task/sim-states-task-invocation.js";
import type { SimStatesExecution } from "./sim-states-execution.js";
import { simStatesFailureFrom } from "./sim-states-failure.js";
import { runSimStatesState } from "./sim-states-run-state.js";
import type { SimStatesStateOutcome } from "./sim-states-state-outcome.js";

interface SimStatesStateRunnerProperties {
  readonly execution: SimStatesExecution;
  readonly background: BackgroundScheduler;
  readonly tasks: SimStatesTaskTargets;
  readonly roleArn: string;
}

/**
 * Runs one attempt at one state of an execution, and never raises.
 *
 * What a state knows about the execution it is running in is gathered here,
 * and so is reading the Amazon States Language error name off whatever a state
 * raised. What a `Task` state's `Retry` and `Catch` make of that name is read
 * here too, so a state that failed answers with what the execution does about
 * it. All three leave the interpreter with the walk alone.
 */
export class SimStatesStateRunner {
  readonly #execution: SimStatesExecution;
  readonly #background: BackgroundScheduler;
  readonly #tasks: SimStatesTaskTargets;
  readonly #roleArn: string;

  constructor(properties: SimStatesStateRunnerProperties) {
    this.#execution = properties.execution;
    this.#background = properties.background;
    this.#tasks = properties.tasks;
    this.#roleArn = properties.roleArn;
  }

  /**
   * Run one attempt at a state and say what happened, failure included.
   */
  async run(
    state: SimStatesState,
    input: JSONValue,
    stateName: string,
    attempt: SimStatesAttemptState,
  ): Promise<SimStatesStateOutcome> {
    const ran = await this.#ran(state, input, stateName, attempt);

    this.#execution.attempt(
      stateName,
      ran.kind === "fail" ? ran.error : undefined,
    );

    return this.#recovered(state, input, ran, attempt);
  }

  /**
   * Run the state itself, or give up on it where its deadline has passed.
   */
  async #ran(
    state: SimStatesState,
    input: JSONValue,
    stateName: string,
    attempt: SimStatesAttemptState,
  ): Promise<SimStatesStateOutcome> {
    const overdue = simStatesTimedOut(
      stateName,
      attempt,
      this.#background.now(),
    );

    if (overdue !== undefined) {
      return overdue;
    }

    try {
      return await runSimStatesState(state, input, {
        stateName,
        now: this.#background.now(),
        tasks: this.#tasks,
        roleArn: this.#roleArn,
      });
    } catch (error) {
      return simStatesFailureFrom(error);
    }
  }

  /**
   * What the state's own `Retry` and `Catch` make of a failure.
   *
   * A catcher whose `ResultPath` has nowhere to write fails the execution the
   * way any other data-flow field that cannot be applied does.
   */
  #recovered(
    state: SimStatesState,
    input: JSONValue,
    ran: SimStatesStateOutcome,
    attempt: SimStatesAttemptState,
  ): SimStatesStateOutcome {
    if (ran.kind !== "fail" || state.Type !== "Task") {
      return ran;
    }

    try {
      return simStatesRecover({
        handling: state,
        input,
        failure: ran,
        attempt,
        now: this.#background.now(),
      });
    } catch (error) {
      return simStatesFailureFrom(error);
    }
  }
}
