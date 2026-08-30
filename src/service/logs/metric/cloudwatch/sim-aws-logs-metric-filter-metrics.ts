import { makeSimAwsAccountRootPrincipal } from "../../../aws/caller/sim-aws-account-root-principal.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimCloudWatchMetricDatumInput } from "../../../cloudwatch/command/data/data.command.js";
import type { SimLogsMetricDatapoint } from "../sim-logs-metric-datapoint.js";
import type { SimLogsMetricPublications } from "../sim-logs-metric-publications.js";

interface SimAwsLogsMetricFilterMetricsProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The simulated CloudWatch a metric filter's datapoints are published into.
 *
 * Real CloudWatch Logs publishes a filter's metric in the Account and Region
 * of the log group, and there is no way to point one at another Region, so
 * this scope's own CloudWatch is the one to write to.
 *
 * Publication goes through the ordinary `PutMetricData` path, which keeps one
 * route into the metric store rather than a private one. A filter naming a
 * reserved `AWS/` namespace is therefore refused exactly as a caller putting
 * into one is.
 *
 * The Account root is named as the caller rather than left to be resolved.
 * Real CloudWatch Logs publishes a filter's datapoint itself, and no policy
 * anybody writes gates it. Leaving the caller off would pick up the ambient
 * one, so a filter over a Lambda function's log group would publish as that
 * function's execution role and be denied for a metric the role has no reason
 * to name.
 */
export class SimAwsLogsMetricFilterMetrics implements SimLogsMetricPublications {
  readonly #simAws: SimAws;
  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimAwsLogsMetricFilterMetricsProperties) {
    this.#simAws = properties.simAws;
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Publish the datapoints one log event produced.
   *
   * `PutMetricData` carries one namespace per request, so datapoints are
   * grouped by the namespace their transformation named. One filter writing
   * into two namespaces is two requests, as it is on real AWS.
   *
   * An empty batch reaches nothing. That is a filter about to be put asking
   * whether this scope can publish at all, and this scope always can.
   */
  async publish(datapoints: readonly SimLogsMetricDatapoint[]): Promise<void> {
    if (datapoints.length === 0) {
      return;
    }

    const scope = this.#accountRegionScope;
    const cloudWatch = this.#simAws
      .accountRegionScope(scope.accountId, scope.regionName)
      .cloudWatch();

    const caller = makeSimAwsAccountRootPrincipal(scope.accountId);

    for (const [namespace, data] of byNamespace(datapoints)) {
      // oxlint-disable-next-line no-await-in-loop -- one request per namespace, in order
      await cloudWatch.putMetricData(
        { input: { Namespace: namespace, MetricData: data } },
        { caller },
      );
    }
  }
}

/**
 * The datapoints grouped into one PutMetricData request per namespace.
 */
function byNamespace(
  datapoints: readonly SimLogsMetricDatapoint[],
): ReadonlyMap<string, readonly SimCloudWatchMetricDatumInput[]> {
  const grouped = new Map<string, SimCloudWatchMetricDatumInput[]>();

  for (const datapoint of datapoints) {
    const data = grouped.get(datapoint.namespace) ?? [];

    data.push(metricDatum(datapoint));
    grouped.set(datapoint.namespace, data);
  }

  return grouped;
}

/**
 * One datapoint as PutMetricData takes it.
 *
 * The timestamp is the instant CloudWatch Logs took the event, rather than the
 * instant this runs. Publication happens on the background scheduler, and a
 * clock that moved in between would otherwise file the datapoint under a later
 * period than the log line it counts.
 */
function metricDatum(
  datapoint: SimLogsMetricDatapoint,
): SimCloudWatchMetricDatumInput {
  return {
    MetricName: datapoint.metricName,
    Value: datapoint.value,
    Timestamp: new Date(datapoint.timestamp),
    Unit: datapoint.unit,
    Dimensions: datapoint.dimensions.map((dimension) => ({
      Name: dimension.name,
      Value: dimension.value,
    })),
  };
}
