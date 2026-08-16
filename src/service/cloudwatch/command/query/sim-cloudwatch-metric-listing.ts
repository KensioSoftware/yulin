import { SimCloudWatchInvalidParameterValueException } from "../../error/sim-cloudwatch.error.js";
import type { SimCloudWatchMetric } from "../../metric/sim-cloudwatch-metric.js";
import type { SimCloudWatchMetricDetail } from "./query.command.js";

/**
 * The only window real CloudWatch's RecentlyActive filter offers, and how long
 * it is in milliseconds.
 */
const recentlyActiveWindow = "PT3H";
const recentlyActiveMilliseconds = 3 * 60 * 60 * 1000;

/**
 * What ListMetrics reports about one metric, which is its identity and none of
 * its values.
 */
export function simCloudWatchMetricDetail(
  metric: SimCloudWatchMetric,
): SimCloudWatchMetricDetail {
  return {
    Namespace: metric.namespace,
    MetricName: metric.metricName,
    Dimensions: metric.dimensions.map((dimension) => ({
      Name: dimension.name,
      Value: dimension.value,
    })),
  };
}

/**
 * Whether a metric was written to recently enough for the request.
 *
 * Recency is measured against the simulation's clock, so a test that moves time
 * forward past the window sees a metric drop out of the listing without
 * anything having to expire it.
 */
export function isSimCloudWatchRecentlyActive(
  metric: SimCloudWatchMetric,
  recentlyActive: string | undefined,
  now: Date,
): boolean {
  if (recentlyActive === undefined) {
    return true;
  }

  if (recentlyActive !== recentlyActiveWindow) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter RecentlyActive must be ${recentlyActiveWindow}, which ` +
        `is the only window real CloudWatch offers.`,
    );
  }

  const lastWrittenAt = metric.lastWrittenAt;

  return (
    lastWrittenAt !== undefined &&
    now.getTime() - lastWrittenAt <= recentlyActiveMilliseconds
  );
}

/**
 * Refuse a listing reaching for metrics owned by another account.
 */
export function refuseSimCloudWatchLinkedAccounts(
  includeLinkedAccounts: boolean | undefined,
  owningAccount: string | undefined,
): void {
  if (includeLinkedAccounts !== true && owningAccount === undefined) {
    return;
  }

  throw new SimCloudWatchInvalidParameterValueException(
    "IncludeLinkedAccounts and OwningAccount are not simulated: there is no " +
      "monitoring account here, and every listing reports the metrics of the " +
      "account and region it was made in.",
  );
}
