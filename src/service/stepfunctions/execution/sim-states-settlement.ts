import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimStatesExecution } from "./sim-states-execution.js";
import type {
  SimStatesNextOutcome,
  SimStatesSettledOutcome,
} from "./sim-states-state-outcome.js";

interface SimStatesSettlementProperties {
  readonly execution: SimStatesExecution;
  readonly background: BackgroundScheduler;
}

/**
 * Records on one execution whatever its states leave it as.
 *
 * The interpreter walks the states and this holds what the walk did, which
 * keeps the recording in one place for the walk and for a `Wait` state
 * carrying on later.
 */
export class SimStatesSettlement {
  readonly #execution: SimStatesExecution;
  readonly #background: BackgroundScheduler;

  constructor(properties: SimStatesSettlementProperties) {
    this.#execution = properties.execution;
    this.#background = properties.background;
  }

  /**
   * Record what a state's outcome ended the execution with.
   *
   * Answers with the outcome the walk carries on from, and with nothing where
   * the execution has ended.
   */
  settle(outcome: SimStatesSettledOutcome): SimStatesNextOutcome | undefined {
    if (outcome.kind === "next") {
      return outcome;
    }

    if (outcome.kind === "succeed") {
      this.#execution.succeed(outcome.output, this.#background.now());
      return undefined;
    }

    this.#execution.fail(outcome.error, outcome.cause, this.#background.now());

    return undefined;
  }
}
