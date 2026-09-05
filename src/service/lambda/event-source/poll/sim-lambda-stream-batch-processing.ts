import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaEventSourceStreamProgressBatch } from "../stream/sim-lambda-event-source-streams.js";
import type { SimLambdaStreamBatchOutcome } from "./sim-lambda-stream-batch-outcome.js";
import type { SimLambdaStreamProgress } from "./sim-lambda-stream-progress.js";
import type { SimLambdaStreamRecordTime } from "./sim-lambda-stream-record-times.js";

interface StreamBatchProcessing<RecordType> {
  readonly batch: SimLambdaEventSourceStreamProgressBatch & {
    readonly records: readonly RecordType[];
  };
  readonly simFunction: SimLambdaFunction;
  readonly progress: SimLambdaStreamProgress;
  readonly times: (
    records: readonly RecordType[],
  ) => readonly SimLambdaStreamRecordTime[];
  readonly deliver: (
    records: readonly RecordType[],
  ) => Promise<SimLambdaStreamBatchOutcome>;
}

/** Check record age, invoke live records, and apply the batch outcome. */
export async function processSimLambdaStreamBatch<RecordType>(
  properties: StreamBatchProcessing<RecordType>,
): Promise<void> {
  const { batch, progress, simFunction } = properties;
  if (batch.records.length === 0) {
    progress.caughtUp(batch);
    return;
  }
  const firstLive = await progress.before(
    properties.times(batch.records),
    batch,
    simFunction,
  );
  if (firstLive === batch.records.length) return;
  await progress.after(
    await properties.deliver(batch.records.slice(firstLive)),
    batch,
    simFunction,
  );
}
