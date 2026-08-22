import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimStatesState } from "../definition/sim-states-state.js";
import type { SimStatesTaskTargets } from "../task/sim-states-task-invocation.js";
import { simStatesFailureFrom } from "./sim-states-failure.js";
import { runSimStatesState } from "./sim-states-run-state.js";
import type { SimStatesStateOutcome } from "./sim-states-state-outcome.js";

interface SimStatesStateRunnerProperties {
  readonly background: BackgroundScheduler;
  readonly tasks: SimStatesTaskTargets;
  readonly roleArn: string;
}

/**
 * Runs one state of an execution, and never raises.
 *
 * What a state knows about the execution it is running in is gathered here,
 * and so is reading the Amazon States Language error name off whatever a state
 * raised. Both leave the interpreter with the walk alone.
 */
export class SimStatesStateRunner {
  readonly #background: BackgroundScheduler;
  readonly #tasks: SimStatesTaskTargets;
  readonly #roleArn: string;

  constructor(properties: SimStatesStateRunnerProperties) {
    this.#background = properties.background;
    this.#tasks = properties.tasks;
    this.#roleArn = properties.roleArn;
  }

  /**
   * Run one state and say what happened, failure included.
   */
  async run(
    state: SimStatesState,
    input: JSONValue,
    stateName: string,
  ): Promise<SimStatesStateOutcome> {
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
}
