import type { SimLambdaStreamFailureRecord } from "./sim-lambda-stream-failure-record.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimLambdaStreamRecordTime } from "./sim-lambda-stream-record-times.js";
export interface SimLambdaStreamBatchInfo {
  readonly shardId: string;
  readonly streamArn: string;
  readonly startSequenceNumber: string;
  readonly endSequenceNumber: string;
  readonly approximateArrivalOfFirstRecord: string;
  readonly approximateArrivalOfLastRecord: string;
  readonly batchSize: number;
}

/** Identify the discarded records by shard and sequence-number bounds. */
export function simLambdaStreamBatchInfo(
  records: readonly SimLambdaStreamRecordTime[],
  streamArn: string,
  shardId: string | undefined,
): SimLambdaStreamBatchInfo {
  const first = records.at(0);
  const last = records.at(-1);
  assertDefined(shardId, "discarded stream batch shard ID");
  assertDefined(first?.sequenceNumber, "discarded batch start sequence number");
  assertDefined(last?.sequenceNumber, "discarded batch end sequence number");
  assertDefined(first.at, "discarded batch first arrival time");
  assertDefined(last.at, "discarded batch last arrival time");
  return {
    shardId,
    streamArn,
    startSequenceNumber: first.sequenceNumber,
    endSequenceNumber: last.sequenceNumber,
    approximateArrivalOfFirstRecord: first.at.toISOString(),
    approximateArrivalOfLastRecord: last.at.toISOString(),
    batchSize: records.length,
  };
}

/** Identify the discarded records by shard and sequence-number bounds. */
export function streamFailureBatchInfo(
  arn: string,
  info: SimLambdaStreamBatchInfo,
): Pick<
  SimLambdaStreamFailureRecord,
  "DDBStreamBatchInfo" | "KinesisBatchInfo"
> {
  if (arn.startsWith("arn:aws:dynamodb:")) return { DDBStreamBatchInfo: info };
  return { KinesisBatchInfo: info };
}
