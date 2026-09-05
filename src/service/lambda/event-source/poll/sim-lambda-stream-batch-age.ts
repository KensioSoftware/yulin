import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimLambdaStreamRetryLimits } from "../sim-lambda-stream-retry-limits.js";
import type { SimLambdaEventSourceStreamPosition } from "../stream/sim-lambda-event-source-streams.js";
import type { SimLambdaStreamDiscard } from "./sim-lambda-stream-failure-record.js";
import type { SimLambdaStreamRecordTime } from "./sim-lambda-stream-record-times.js";

/** Identifies the expired prefix at the time a batch is polled. */
export class SimLambdaStreamBatchAge {
  constructor(
    private readonly limits: SimLambdaStreamRetryLimits,
    private readonly clock: SimClock,
  ) {}

  discarded(
    records: readonly SimLambdaStreamRecordTime[],
  ): SimLambdaStreamDiscard | undefined {
    const at = this.clock.now();
    const firstLive = records.findIndex(
      (record) => !this.limits.hasAgedOut(record.at, at),
    );
    const count = firstLive === -1 ? records.length : firstLive;
    if (count === 0) return undefined;
    return {
      records: records.slice(0, count),
      condition: "RecordAgeExceeded",
      at,
    };
  }

  firstLivePosition(
    records: readonly SimLambdaStreamRecordTime[],
    count: number,
  ): SimLambdaEventSourceStreamPosition {
    const sequenceNumber = records.at(count)?.sequenceNumber;
    assertDefined(sequenceNumber, "live stream record sequence number");
    return { kind: "sequence", sequenceNumber };
  }
}
