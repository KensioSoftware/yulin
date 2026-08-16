import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCloudWatchDimensionInput } from "../../metric/sim-cloudwatch-dimension.js";

/**
 * The summary of many observations one metric datum may carry instead of a
 * single value.
 */
export interface SimCloudWatchStatisticSetInput {
  readonly SampleCount?: number | undefined;
  readonly Sum?: number | undefined;
  readonly Minimum?: number | undefined;
  readonly Maximum?: number | undefined;
}

/**
 * One metric's worth of data in a PutMetricData request.
 */
export interface SimCloudWatchMetricDatumInput {
  readonly MetricName?: string | undefined;
  readonly Dimensions?: readonly SimCloudWatchDimensionInput[] | undefined;
  readonly Timestamp?: Date | undefined;
  readonly Value?: number | undefined;
  readonly StatisticValues?: SimCloudWatchStatisticSetInput | undefined;
  readonly Values?: readonly number[] | undefined;
  readonly Counts?: readonly number[] | undefined;
  readonly Unit?: string | undefined;
  readonly StorageResolution?: number | undefined;
}

/**
 * Minimal structural sim CloudWatch PutMetricData command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch/command/PutMetricDataCommand/
 */
export interface SimPutMetricDataCommand {
  readonly input: SimPutMetricDataCommandInput;
}

export interface SimPutMetricDataCommandInput {
  readonly Namespace?: string | undefined;
  readonly MetricData?: readonly SimCloudWatchMetricDatumInput[] | undefined;
}

export interface SimPutMetricDataCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
