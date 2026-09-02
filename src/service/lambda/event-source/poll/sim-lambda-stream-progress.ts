import type {
  BackgroundScheduler,
  BackgroundTask,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";
import type {
  SimLambdaEventSourceStreamPosition,
  SimLambdaEventSourceStreamProgressBatch,
} from "../stream/sim-lambda-event-source-streams.js";
import { PollSchedule } from "../../../../util/background/poll-schedule.js";
import type { SimLambdaStreamBatchOutcome } from "./sim-lambda-stream-batch-outcome.js";
import { SimLambdaStreamCheckpoint } from "./sim-lambda-stream-checkpoint.js";
import { SimLambdaStreamRetry } from "./sim-lambda-stream-retry.js";

interface SimLambdaStreamProgressProperties {
  readonly mapping: SimLambdaEventSourceMapping;
  readonly background: BackgroundScheduler;
  readonly poll: BackgroundTask;
}

/**
 * How far along its stream one mapping has got, and what it does next.
 *
 * The two belong together because they are the same decision. A batch the
 * function took moves the checkpoint and the mapping reads on; a batch it threw
 * on leaves the checkpoint where it is and the mapping tries the same records
 * again after a wait; a batch it reported failing partway through moves the
 * checkpoint back to the record it named. Nothing behind a failing batch is
 * read until it is through, which is what it means for a stream mapping to
 * block its shard.
 */
export class SimLambdaStreamProgress {
  private readonly checkpoint: SimLambdaStreamCheckpoint;
  private readonly retry: SimLambdaStreamRetry;
  private readonly schedule: PollSchedule;

  constructor(properties: SimLambdaStreamProgressProperties) {
    // A stream mapping is refused at creation unless it names a starting
    // position, so one that has got this far without one is the simulator
    // having gone wrong rather than a request having been wrong.
    const { start, streamRetryLimits } = properties.mapping;
    assertDefined(start, "stream mapping start position");
    assertDefined(streamRetryLimits, "stream mapping retry limits");

    this.checkpoint = new SimLambdaStreamCheckpoint(start);
    this.retry = new SimLambdaStreamRetry({
      limits: streamRetryLimits,
      clock: properties.background,
    });
    this.schedule = new PollSchedule(properties);
  }

  /**
   * Poll as soon as the simulation gets to it.
   */
  pollNow(): void {
    this.schedule.now();
  }

  /**
   * Where the next read starts.
   */
  get position(): SimLambdaEventSourceStreamPosition {
    return this.checkpoint.position;
  }

  /**
   * Take a read that came back with nothing.
   *
   * The place is still worth keeping: it is what a starting position of LATEST
   * resolves to, so the mapping settles on one place to read on from rather
   * than working out a new one each time.
   */
  caughtUp(batch: SimLambdaEventSourceStreamProgressBatch): void {
    this.checkpoint.advanceTo(batch.next);
  }

  /**
   * Take what became of a batch: move past it, or wait and try it again.
   */
  after(
    outcome: SimLambdaStreamBatchOutcome,
    batch: SimLambdaEventSourceStreamProgressBatch,
  ): void {
    if (outcome.isHandled) {
      this.handled(batch);

      return;
    }

    this.failed(outcome, batch);
  }

  /**
   * Move past a batch that is finished with, and read on.
   *
   * A batch the function took is finished with, and so is one the mapping has
   * given up on.
   */
  handled(batch: SimLambdaEventSourceStreamProgressBatch): void {
    this.retry.reset();
    this.checkpoint.advanceTo(batch.next);

    if (!batch.drained) {
      this.schedule.now();
    }
  }

  /**
   * Wait and hand a failed batch over again, or give up on it.
   *
   * Giving up discards the records and carries on with the stream, which is
   * what AWS does when a stream mapping's error handling runs out. Parking the
   * shard instead would be a simulator invention.
   *
   * A batch runs out either by having had its retries or by every record left
   * in it being older than the mapping will carry. Records that aged out of the
   * front of a batch are left behind, and the ones behind them go over again,
   * so a mapping given a record age keeps working through its shard rather than
   * stalling on the oldest record on it.
   */
  failed(
    outcome: SimLambdaStreamBatchOutcome,
    batch: SimLambdaEventSourceStreamProgressBatch,
  ): void {
    const again = this.retry.after(outcome, this.checkpoint.position);

    if (again === undefined) {
      this.handled(batch);

      return;
    }

    this.checkpoint.advanceTo(again.position);
    this.schedule.afterSeconds(again.afterSeconds);
  }
}
