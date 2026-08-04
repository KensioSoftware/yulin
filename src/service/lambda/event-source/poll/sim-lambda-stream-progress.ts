import type {
  BackgroundScheduler,
  BackgroundTask,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";
import type {
  SimLambdaEventSourceStreamBatch,
  SimLambdaEventSourceStreamPosition,
} from "../stream/sim-lambda-event-source-streams.js";
import { SimLambdaEventSourcePollSchedule } from "./sim-lambda-event-source-poll-schedule.js";
import { SimLambdaStreamCheckpoint } from "./sim-lambda-stream-checkpoint.js";
import { SimLambdaStreamRetryBackoff } from "./sim-lambda-stream-retry-backoff.js";

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
 * again after a wait. Nothing behind a failing batch is read until it is
 * through, which is what it means for a stream mapping to block its shard.
 */
export class SimLambdaStreamProgress {
  private readonly checkpoint: SimLambdaStreamCheckpoint;
  private readonly backoff = new SimLambdaStreamRetryBackoff();
  private readonly schedule: SimLambdaEventSourcePollSchedule;

  constructor(properties: SimLambdaStreamProgressProperties) {
    // A stream mapping is refused at creation unless it names a starting
    // position, so one that has got this far without one is the simulator
    // having gone wrong rather than a request having been wrong.
    const { startingPosition } = properties.mapping;
    assertDefined(startingPosition, "DynamoDB stream mapping start position");

    this.checkpoint = new SimLambdaStreamCheckpoint(startingPosition);
    this.schedule = new SimLambdaEventSourcePollSchedule(properties);
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
  caughtUp(batch: SimLambdaEventSourceStreamBatch): void {
    this.checkpoint.advanceTo(batch.next);
  }

  /**
   * Take what became of a batch: move past it, or wait and try it again.
   */
  after(handled: boolean, batch: SimLambdaEventSourceStreamBatch): void {
    if (handled) {
      this.handled(batch);

      return;
    }

    this.failed(batch);
  }

  /**
   * Move past a batch the function took, and read on.
   */
  handled(batch: SimLambdaEventSourceStreamBatch): void {
    this.backoff.reset();
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
   */
  failed(batch: SimLambdaEventSourceStreamBatch): void {
    if (this.backoff.isExhausted) {
      this.handled(batch);

      return;
    }

    this.schedule.afterSeconds(this.backoff.nextSeconds());
  }
}
