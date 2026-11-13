import {
  type SimAwsLineage,
  simAwsLineage,
} from "../../../../aws/lineage/sim-aws-lineage.js";
import type {
  SimLambdaAsyncOutcome,
  SimLambdaAsyncOutcomeDelivery,
} from "./sim-lambda-async-outcome.js";

/**
 * The chain of requests one asynchronous invocation belongs to, carried
 * through its attempts and on to wherever its outcome is sent.
 *
 * Every attempt starts from the chain the invocation was made in. A record
 * sent to a destination, and an event sent to a dead-letter target, carry the
 * chain as the latest attempt left it, so a destination that invokes the
 * function again is part of the same loop and is stopped like any other.
 */
export class SimLambdaAsyncChain {
  readonly #started = simAwsLineage.current();
  readonly #outcomes: SimLambdaAsyncOutcomeDelivery;
  #latest: SimAwsLineage | undefined;

  constructor(outcomes: SimLambdaAsyncOutcomeDelivery) {
    this.#outcomes = outcomes;
    this.#latest = this.#started;
  }

  /**
   * Make one attempt as part of the chain.
   */
  async attempt<T>(run: () => Promise<T>): Promise<T> {
    const { result, lineage } = await simAwsLineage.following(
      this.#started,
      run,
    );
    this.#latest = lineage;

    return result;
  }

  /**
   * Send an outcome to its destination, as part of the chain.
   */
  async deliver(
    outcome: SimLambdaAsyncOutcome,
    attemptCount: number,
  ): Promise<void> {
    await simAwsLineage.within(this.#latest, async () =>
      this.#outcomes.deliver(outcome, attemptCount),
    );
  }

  /**
   * Send the event to the dead-letter target, as part of the chain.
   */
  async deadLetter(): Promise<void> {
    await simAwsLineage.within(this.#latest, async () =>
      this.#outcomes.deadLetter(),
    );
  }
}
