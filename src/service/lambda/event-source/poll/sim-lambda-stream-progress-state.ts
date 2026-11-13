import { BatchingWindow } from "../../../../util/background/batching-window.js";
import { SimLambdaStreamExpiry } from "./sim-lambda-stream-expiry.js";
import { SimLambdaStreamBatchAge } from "./sim-lambda-stream-batch-age.js";
import { SimLambdaStreamFailureDestination } from "./sim-lambda-stream-failure-destination.js";
import { SimLambdaStreamCursor } from "./sim-lambda-stream-cursor.js";
import { SimLambdaStreamRetry } from "./sim-lambda-stream-retry.js";
import { SimLambdaStreamBisect } from "./sim-lambda-stream-bisect.js";
import { PollSchedule } from "../../../../util/background/poll-schedule.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type {
  BackgroundScheduler,
  BackgroundTask,
} from "../../../../util/background/background.js";
import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";
import type { SimLambdaEventSourceStreamProgressBatch } from "../stream/sim-lambda-event-source-streams.js";
export interface SimLambdaStreamProgressProperties {
  readonly mapping: SimLambdaEventSourceMapping;
  readonly background: BackgroundScheduler;
  readonly poll: BackgroundTask;
}

/** Own the per-shard retry state and its expiry and destination collaborators. */
export class SimLambdaStreamProgressState {
  readonly expiry: SimLambdaStreamExpiry;
  readonly failures: SimLambdaStreamFailureDestination;
  readonly cursor: SimLambdaStreamCursor;
  readonly retry: SimLambdaStreamRetry;
  readonly bisect: SimLambdaStreamBisect;
  readonly window = new BatchingWindow();
  readonly mapping: SimLambdaEventSourceMapping;
  readonly background: BackgroundScheduler;
  constructor(properties: SimLambdaStreamProgressProperties) {
    const { mapping, background } = properties;
    this.mapping = mapping;
    this.background = background;
    this.failures = new SimLambdaStreamFailureDestination(mapping);
    // A stream mapping is refused at creation unless it names a starting
    // position, so one that has got this far without one is the simulator
    // having gone wrong rather than a request having been wrong.
    const { start, streamRetryLimits } = mapping;
    assertDefined(start, "stream mapping start position");
    assertDefined(streamRetryLimits, "stream mapping retry limits");

    this.cursor = new SimLambdaStreamCursor(
      start,
      new PollSchedule(properties),
    );
    this.retry = new SimLambdaStreamRetry(streamRetryLimits, background);
    this.bisect = new SimLambdaStreamBisect(streamRetryLimits);
    this.expiry = new SimLambdaStreamExpiry({
      age: new SimLambdaStreamBatchAge(streamRetryLimits, background),
      cursor: this.cursor,
      failures: this.failures,
      handled: (batch): void => {
        this.handled(batch);
      },
    });
  }
  /**
   * Whether a partial batch waits out the mapping's batching window, polling
   * again when the window closes. A batch being retried is never held.
   */
  holds(found: number, batchSize: number): boolean {
    const batching = {
      batchSize,
      batchingWindowSeconds: this.mapping.batchingWindowSeconds,
    };

    return (
      !this.retry.isRetrying &&
      this.window.holds(this.background.now(), found, batching, (instant) => {
        this.cursor.pollAt(instant);
      })
    );
  }
  handled(batch: SimLambdaEventSourceStreamProgressBatch): void {
    this.failures.reset();
    this.retry.reset();
    this.cursor.handled(batch);
  }
}
