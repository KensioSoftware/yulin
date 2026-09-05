import type { SimLambdaStreamBatchOutcome } from "./sim-lambda-stream-batch-outcome.js";

/**
 * How much of a failing batch the next delivery may carry.
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
 * Two numbers say what the next read may take. The half is how many records a
 * delivery may carry, and the remainder is how many records of the batch being
 * split are still to get through. Reading the lower of the two is what keeps a
 * record written while the splitting is going on out of it: the halves are the
 * batch that failed, and a record that arrived afterwards belongs to the batch
 * after it. The mapping's own batch size comes back once the whole of the split
 * batch is through.
 */
export class SimLambdaStreamBisect {
  #half: number | undefined;
  #remaining = 0;

  constructor(private readonly enabled: boolean) {}

  /**
   * How many records the next read may take, within the mapping's batch size.
   */
  sizeWithin(batchSize: number): number {
    const half = this.#half;

    return half === undefined
      ? batchSize
      : Math.min(half, this.#remaining, batchSize);
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

    this.#half = Math.ceil(count / 2);
    this.#remaining = count;

    return true;
  }

  /**
   * Take records of the batch being split that the mapping is finished with,
   * whether the function handled them, they were discarded, or they aged out.
   *
   * The whole of the split batch being through is what puts the mapping back on
   * full batches.
   */
  finished(count: number): void {
    if (this.#half === undefined || count <= 0) {
      return;
    }

    this.#remaining -= count;

    if (this.#remaining <= 0) {
      this.reset();
    }
  }

  /**
   * Read whole batches again.
   */
  reset(): void {
    this.#half = undefined;
    this.#remaining = 0;
  }
}
