import type { PollSchedule } from "../../../../util/background/poll-schedule.js";
import type { SimLambdaEventSourceStart } from "../sim-lambda-event-source-starting-position.js";
import type {
  SimLambdaEventSourceStreamPosition,
  SimLambdaEventSourceStreamProgressBatch,
} from "../stream/sim-lambda-event-source-streams.js";
import { SimLambdaStreamCheckpoint } from "./sim-lambda-stream-checkpoint.js";
import type { SimLambdaStreamRetryAttempt } from "./sim-lambda-stream-retry.js";

/** Keep the next read position and schedule consistent when a batch finishes or retries. */
export class SimLambdaStreamCursor {
  private readonly checkpoint: SimLambdaStreamCheckpoint;
  constructor(
    start: SimLambdaEventSourceStart,
    private readonly schedule: PollSchedule,
  ) {
    this.checkpoint = new SimLambdaStreamCheckpoint(start);
  }
  get position(): SimLambdaEventSourceStreamPosition {
    return this.checkpoint.position;
  }
  advanceTo(position: SimLambdaEventSourceStreamPosition): void {
    this.checkpoint.advanceTo(position);
  }
  pollNow(): void {
    this.schedule.now();
  }
  handled(batch: SimLambdaEventSourceStreamProgressBatch): void {
    this.advanceTo(batch.next);
    if (!batch.drained) this.pollNow();
  }
  resume(attempt: SimLambdaStreamRetryAttempt): void {
    this.advanceTo(attempt.position);
    this.schedule.afterSeconds(attempt.afterSeconds);
  }
}
