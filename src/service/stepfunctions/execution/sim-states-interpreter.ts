import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimStatesDefinition } from "../definition/sim-states-definition.js";
import { SimStepFunctionsError } from "../error/sim-step-functions.error.js";
import type { SimStatesExecution } from "./sim-states-execution.js";
import { runSimStatesState } from "./sim-states-run-state.js";

interface SimStatesInterpreterProperties {
  readonly definition: SimStatesDefinition;
  readonly execution: SimStatesExecution;
  readonly background: BackgroundScheduler;
}

/**
 * Walks one execution through its state machine.
 *
 * The walk is a loop over a map of states, which is all Amazon States Language
 * asks for. Everything interesting happens either side of a state, in the
 * data-flow fields.
 */
export class SimStatesInterpreter {
  readonly #definition: SimStatesDefinition;
  readonly #execution: SimStatesExecution;
  readonly #background: BackgroundScheduler;

  constructor(properties: SimStatesInterpreterProperties) {
    this.#definition = properties.definition;
    this.#execution = properties.execution;
    this.#background = properties.background;
  }

  /**
   * Run the execution to whichever end it reaches.
   *
   * A failure ends the execution and is recorded on it. Nothing raises out of
   * here, since this runs where a caller advancing the clock would otherwise
   * see the raise.
   */
  async run(): Promise<void> {
    let current = this.#definition.StartAt;
    let value: JSONValue = this.#execution.input;

    for (;;) {
      const state = this.#definition.States.get(current);

      if (state === undefined) {
        this.#fail(
          "States.Runtime",
          `The state ${current} is not one of this state machine's states.`,
        );
        return;
      }

      this.#execution.enter(current);
      // One sequencing point per state. The states are a chain, so there is
      // nothing here to run in parallel.
      // oxlint-disable-next-line eslint/no-await-in-loop
      await this.#background.sequence();

      const outcome = this.#step(state, value);

      if (outcome.kind !== "next") {
        return;
      }

      value = outcome.output;
      current = outcome.next;
    }
  }

  /**
   * Run one state, recording whatever ends the execution.
   */
  #step(
    ...step: Parameters<typeof runSimStatesState>
  ): ReturnType<typeof runSimStatesState> {
    let outcome: ReturnType<typeof runSimStatesState>;

    try {
      outcome = runSimStatesState(...step);
    } catch (error) {
      outcome = this.#outcomeFrom(error);
    }

    if (outcome.kind === "succeed") {
      this.#execution.succeed(outcome.output, this.#background.now());
    } else if (outcome.kind === "fail") {
      this.#fail(outcome.error, outcome.cause);
    }

    return outcome;
  }

  /**
   * Read the Amazon States Language error name off whatever was raised.
   */
  #outcomeFrom(error: unknown): ReturnType<typeof runSimStatesState> {
    if (error instanceof SimStepFunctionsError) {
      return {
        kind: "fail",
        error: error.statesErrorName,
        cause: error.message,
      };
    }

    return {
      kind: "fail",
      error: "States.Runtime",
      cause: error instanceof Error ? error.message : String(error),
    };
  }

  #fail(error: string, cause: string | undefined): void {
    this.#execution.fail(error, cause, this.#background.now());
  }
}
