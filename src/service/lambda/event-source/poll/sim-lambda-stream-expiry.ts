import type { SimLambdaStreamBatchAge } from "./sim-lambda-stream-batch-age.js";
import type { SimLambdaStreamRecordTime } from "./sim-lambda-stream-record-times.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaStreamFailureDestination } from "./sim-lambda-stream-failure-destination.js";
import type { SimLambdaEventSourceStreamProgressBatch } from "../stream/sim-lambda-event-source-streams.js";
import type { SimLambdaStreamCursor } from "./sim-lambda-stream-cursor.js";
interface StreamExpiryProperties {
  readonly age: SimLambdaStreamBatchAge;
  readonly cursor: SimLambdaStreamCursor;
  readonly failures: SimLambdaStreamFailureDestination;
  readonly handled: (batch: SimLambdaEventSourceStreamProgressBatch) => void;
}
/** Advance past expired records and notify their destination before processing live records. */
export class SimLambdaStreamExpiry {
  constructor(private readonly properties: StreamExpiryProperties) {}
  async before(
    records: readonly SimLambdaStreamRecordTime[],
    batch: SimLambdaEventSourceStreamProgressBatch,
    simFunction: SimLambdaFunction,
  ): Promise<number> {
    const { age, cursor, failures, handled } = this.properties;
    const discard = age.discarded(records);
    if (discard === undefined) return 0;
    const discardedCount = discard.records.length;
    const notification = failures.deliver(discard, batch, simFunction);
    if (discardedCount === records.length) {
      handled(batch);
    } else {
      cursor.advanceTo(age.firstLivePosition(records, discardedCount));
    }
    await notification;
    return discardedCount;
  }
}
