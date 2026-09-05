import {
  SimLambdaStreamProgressState,
  type SimLambdaStreamProgressProperties,
} from "./sim-lambda-stream-progress-state.js";
import type { SimLambdaStreamRecordTime } from "./sim-lambda-stream-record-times.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type {
  SimLambdaEventSourceStreamPosition,
  SimLambdaEventSourceStreamProgressBatch,
} from "../stream/sim-lambda-event-source-streams.js";
import type { SimLambdaStreamBatchOutcome } from "./sim-lambda-stream-batch-outcome.js";

/** Apply a stream batch outcome to its checkpoint and retry schedule. */
export class SimLambdaStreamProgress {
  private readonly state: SimLambdaStreamProgressState;
  constructor(properties: SimLambdaStreamProgressProperties) {
    this.state = new SimLambdaStreamProgressState(properties);
  }
  /**
   * Poll as soon as the simulation gets to it.
   */
  pollNow(): void {
    this.state.cursor.pollNow();
  }

  /**
   * Where the next read starts.
   */
  get position(): SimLambdaEventSourceStreamPosition {
    return this.state.cursor.position;
  }

  /**
   * Take a read that came back with nothing.
   *
   * The place is still worth keeping: it is what a starting position of LATEST
   * resolves to, so the mapping settles on one place to read on from rather
   * than working out a new one each time.
   */
  caughtUp(batch: SimLambdaEventSourceStreamProgressBatch): void {
    this.state.cursor.advanceTo(batch.next);
  }

  async before(
    records: readonly SimLambdaStreamRecordTime[],
    batch: SimLambdaEventSourceStreamProgressBatch,
    simFunction: SimLambdaFunction,
  ): Promise<number> {
    return await this.state.expiry.before(records, batch, simFunction);
  }

  /**
   * Take what became of a batch: move past it, or wait and try it again.
   */
  async after(
    outcome: SimLambdaStreamBatchOutcome,
    batch: SimLambdaEventSourceStreamProgressBatch,
    simFunction: SimLambdaFunction,
  ): Promise<void> {
    this.state.failures.invoked(outcome);
    if (outcome.isHandled) {
      this.handled(batch);

      return;
    }

    const again = this.state.retry.after(outcome, this.position);

    const notification = this.state.failures.deliver(
      this.state.retry.discarded,
      batch,
      simFunction,
    );
    if (again === undefined) {
      this.handled(batch);
    } else {
      this.state.cursor.resume(again);
    }

    await notification;
  }

  /**
   * Move past a batch that is finished with, and read on.
   *
   * A batch the function took is finished with, and so is one the mapping has
   * given up on.
   */
  handled(batch: SimLambdaEventSourceStreamProgressBatch): void {
    this.state.handled(batch);
  }
}
