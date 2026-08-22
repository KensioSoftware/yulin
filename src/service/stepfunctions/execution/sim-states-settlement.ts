import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimStatesRunRecord } from "./sim-states-run-record.js";
import type {
  SimStatesNextOutcome,
  SimStatesSettledOutcome,
} from "./sim-states-state-outcome.js";

interface SimStatesSettlementProperties {
  readonly record: SimStatesRunRecord;
  readonly background: BackgroundScheduler;
}

/**
 * Records on one walk whatever its states leave it as.
 *
 * The interpreter walks the states and this holds what the walk did, which
 * keeps the recording in one place for the walk and for a `Wait` state
 * carrying on later.
 */
export class SimStatesSettlement {
  readonly #record: SimStatesRunRecord;
  readonly #background: BackgroundScheduler;

  constructor(properties: SimStatesSettlementProperties) {
    this.#record = properties.record;
    this.#background = properties.background;
  }

  /**
   * Whether the walk is over, so nothing waiting on the clock should run.
   */
  get stopped(): boolean {
    return this.#record.stopped;
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
      this.#record.succeed(outcome.output, this.#background.now());
      return undefined;
    }

    this.#record.fail(outcome.error, outcome.cause, this.#background.now());

    return undefined;
  }
}
