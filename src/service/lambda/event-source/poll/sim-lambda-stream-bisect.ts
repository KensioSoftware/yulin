import type { SimLambdaStreamBatchOutcome } from "./sim-lambda-stream-batch-outcome.js";

/**
 * How many records the next delivery of a failing batch may carry.
 *
 * A mapping asked to bisect halves a batch its function threw on, and halves
 * again on each further error, until a failing batch holds one record. That is
 * how the record that broke the batch ends up delivered on its own, and how the
 * records beside it get through.
 *
 * A split is progress rather than another attempt at the same work, so it puts
 * the retry count back to the start. Without that the simulator's own cap of
 * five attempts would discard a batch of a hundred long before it was down to
 * one record. A batch halves at every step, so the splitting ends on its own,
 * and the single record it ends on is then counted and discarded as any failing
 * batch is.
 *
 * The limit is dropped as soon as a batch goes through. The rest of a split
 * batch is read at the mapping's own batch size again, and a poison record
 * still in it splits the batch it lands in.
 */
export class SimLambdaStreamBisect {
  #limit: number | undefined;

  constructor(private readonly enabled: boolean) {}

  /**
   * How many records the next read may take, within the mapping's batch size.
   */
  sizeWithin(batchSize: number): number {
    const limit = this.#limit;

    return limit === undefined ? batchSize : Math.min(limit, batchSize);
  }

  /**
   * Split a batch the function threw on, answering with whether it split.
   *
   * A batch the function reported partial failures on is left alone. Lambda
   * bisects around an error the handler raised, and a report already says which
   * record to go back to.
   */
  split(outcome: SimLambdaStreamBatchOutcome): boolean {
    const count = outcome.records.length;

    if (!this.enabled || !outcome.functionError || count < 2) {
      return false;
    }

    this.#limit = Math.ceil(count / 2);

    return true;
  }

  /**
   * Read whole batches again, which a batch that is finished with does.
   */
  reset(): void {
    this.#limit = undefined;
  }
}
