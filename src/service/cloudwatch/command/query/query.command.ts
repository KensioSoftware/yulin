import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCloudWatchDimensionInput } from "../../metric/sim-cloudwatch-dimension.js";

/**
 * A dimension a listing selects on. A filter with no value matches whatever
 * value a metric carries under that name.
 */
export interface SimCloudWatchDimensionFilterInput {
  readonly Name?: string | undefined;
  readonly Value?: string | undefined;
}

/**
 * Minimal structural sim CloudWatch ListMetrics command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch/command/ListMetricsCommand/
 */
export interface SimListMetricsCommand {
  readonly input: SimListMetricsCommandInput;
}

export interface SimListMetricsCommandInput {
  readonly Namespace?: string | undefined;
  readonly MetricName?: string | undefined;
  readonly Dimensions?:
    | readonly SimCloudWatchDimensionFilterInput[]
    | undefined;
  readonly NextToken?: string | undefined;
  readonly RecentlyActive?: string | undefined;
  readonly IncludeLinkedAccounts?: boolean | undefined;
  readonly OwningAccount?: string | undefined;
}

/**
 * What ListMetrics reports about one metric.
 */
export interface SimCloudWatchMetricDetail {
  readonly Namespace: string;
  readonly MetricName: string;
  readonly Dimensions: readonly SimCloudWatchDimensionInput[];
}

export interface SimListMetricsCommandOutput {
  readonly Metrics?: readonly SimCloudWatchMetricDetail[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudWatch GetMetricStatistics command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch/command/GetMetricStatisticsCommand/
 */
export interface SimGetMetricStatisticsCommand {
  readonly input: SimGetMetricStatisticsCommandInput;
}

export interface SimGetMetricStatisticsCommandInput {
  readonly Namespace?: string | undefined;
  readonly MetricName?: string | undefined;
  readonly Dimensions?: readonly SimCloudWatchDimensionInput[] | undefined;
  readonly StartTime?: Date | undefined;
  readonly EndTime?: Date | undefined;
  readonly Period?: number | undefined;
  readonly Statistics?: readonly string[] | undefined;
  readonly ExtendedStatistics?: readonly string[] | undefined;
  readonly Unit?: string | undefined;
}

/**
 * One period's worth of statistics, as GetMetricStatistics reports it.
 *
 * Only the statistics the request asked for are present, which is how real
 * CloudWatch answers: a request for `Sum` alone gets no `Average` beside it.
 */
export interface SimCloudWatchDatapointDetail {
  readonly Timestamp: Date;
  readonly SampleCount?: number | undefined;
  readonly Average?: number | undefined;
  readonly Sum?: number | undefined;
  readonly Minimum?: number | undefined;
  readonly Maximum?: number | undefined;
  readonly Unit?: string | undefined;
}

export interface SimGetMetricStatisticsCommandOutput {
  readonly Label?: string | undefined;
  readonly Datapoints?: readonly SimCloudWatchDatapointDetail[] | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * The metric one MetricStat query reads from.
 */
export interface SimCloudWatchMetricInput {
  readonly Namespace?: string | undefined;
  readonly MetricName?: string | undefined;
  readonly Dimensions?: readonly SimCloudWatchDimensionInput[] | undefined;
}

export interface SimCloudWatchMetricStatInput {
  readonly Metric?: SimCloudWatchMetricInput | undefined;
  readonly Period?: number | undefined;
  readonly Stat?: string | undefined;
  readonly Unit?: string | undefined;
}

export interface SimCloudWatchMetricDataQueryInput {
  readonly Id?: string | undefined;
  readonly MetricStat?: SimCloudWatchMetricStatInput | undefined;
  readonly Expression?: string | undefined;
  readonly Label?: string | undefined;
  readonly ReturnData?: boolean | undefined;
  readonly Period?: number | undefined;
  readonly AccountId?: string | undefined;
}

/**
 * Minimal structural sim CloudWatch GetMetricData command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch/command/GetMetricDataCommand/
 */
export interface SimGetMetricDataCommand {
  readonly input: SimGetMetricDataCommandInput;
}

export interface SimGetMetricDataCommandInput {
  readonly MetricDataQueries?:
    | readonly SimCloudWatchMetricDataQueryInput[]
    | undefined;
  readonly StartTime?: Date | undefined;
  readonly EndTime?: Date | undefined;
  readonly ScanBy?: string | undefined;
  readonly MaxDatapoints?: number | undefined;
  readonly NextToken?: string | undefined;
}

/**
 * What GetMetricData reports for one query.
 */
export interface SimCloudWatchMetricDataResult {
  readonly Id: string;
  readonly Label: string;
  readonly Timestamps: readonly Date[];
  readonly Values: readonly number[];
  readonly StatusCode: string;
}

export interface SimGetMetricDataCommandOutput {
  readonly MetricDataResults?:
    | readonly SimCloudWatchMetricDataResult[]
    | undefined;
  readonly $metadata: SimResponseMetadata;
}
