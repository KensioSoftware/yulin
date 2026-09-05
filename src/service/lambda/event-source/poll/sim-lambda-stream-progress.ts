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
   * How many records the next read may take, which is the mapping's batch size
   * until a batch is being bisected.
   */
  batchSizeWithin(batchSize: number): number {
    return this.state.bisect.sizeWithin(batchSize);
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

  /**
   * Drop the records at the front of a batch that are too old to hand over,
   * answering with where the live ones start.
   *
   * Records that aged out are as finished with as records the function took, so
   * a batch being split counts them off its remainder too.
   */
  async before(
    records: readonly SimLambdaStreamRecordTime[],
    batch: SimLambdaEventSourceStreamProgressBatch,
    simFunction: SimLambdaFunction,
  ): Promise<number> {
    const firstLive = await this.state.expiry.before(
      records,
      batch,
      simFunction,
    );

    this.state.bisect.finished(firstLive);

    return firstLive;
  }

  /**
   * Take what became of a batch: move past it, split it, or wait and try it
   * again.
   */
  async after(
    outcome: SimLambdaStreamBatchOutcome,
    batch: SimLambdaEventSourceStreamProgressBatch,
    simFunction: SimLambdaFunction,
  ): Promise<void> {
    this.state.failures.invoked(outcome);
    if (outcome.isHandled) {
      this.state.bisect.finished(outcome.records.length);
      this.handled(batch);

      return;
    }

    if (this.state.bisect.split(outcome)) {
      this.state.retry.reset();
    }

    const again = this.state.retry.after(outcome, this.position);

    const notification = this.state.failures.deliver(
      this.state.retry.discarded,
      batch,
      simFunction,
    );
    if (again === undefined) {
      this.state.bisect.finished(outcome.records.length);
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
