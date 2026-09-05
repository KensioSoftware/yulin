import { streamFailureContext } from "./sim-lambda-stream-failure-context.js";
import {
  simLambdaStreamBatchInfo,
  streamFailureBatchInfo,
  type SimLambdaStreamBatchInfo,
} from "./sim-lambda-stream-batch-info.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";
import type { SimLambdaStreamRecordTime } from "./sim-lambda-stream-record-times.js";

export type SimLambdaStreamFailureCondition =
  | "RetryAttemptsExhausted"
  | "RecordAgeExceeded";

export interface SimLambdaStreamDiscard {
  readonly records: readonly SimLambdaStreamRecordTime[];
  readonly condition: SimLambdaStreamFailureCondition;
  readonly at: Date;
}

export interface SimLambdaStreamFailureRecord {
  readonly version: string;
  readonly timestamp: string;
  readonly requestContext: {
    readonly requestId: string;
    readonly functionArn: string;
    readonly condition: SimLambdaStreamFailureCondition;
    readonly approximateInvokeCount: number;
  };
  readonly responseContext?: {
    readonly statusCode: number;
    readonly executedVersion: string;
    readonly functionError?: string;
  };
  readonly DDBStreamBatchInfo?: SimLambdaStreamBatchInfo;
  readonly KinesisBatchInfo?: SimLambdaStreamBatchInfo;
}

export interface StreamFailureRecordProperties {
  readonly mapping: SimLambdaEventSourceMapping;
  readonly simFunction: SimLambdaFunction;
  readonly shardId: string | undefined;
  readonly discard: SimLambdaStreamDiscard;
  readonly invokeCount: number;
  readonly functionError: boolean;
}

/**
 * SQS and SNS receive metadata identifying the discarded records.
 * @see https://docs.aws.amazon.com/lambda/latest/dg/services-dynamodb-errors.html
 * @see https://docs.aws.amazon.com/lambda/latest/dg/kinesis-on-failure-destination.html
 */
export function simLambdaStreamFailureRecord(
  properties: StreamFailureRecordProperties,
): SimLambdaStreamFailureRecord {
  const { mapping, discard, shardId } = properties;
  const info = simLambdaStreamBatchInfo(
    discard.records,
    mapping.eventSourceArn,
    shardId,
  );
  return {
    version: "1.0",
    timestamp: discard.at.toISOString(),
    ...streamFailureContext(properties),
    ...streamFailureBatchInfo(mapping.eventSourceArn, info),
  };
}
