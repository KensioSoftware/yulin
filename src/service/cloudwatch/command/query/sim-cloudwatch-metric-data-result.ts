import { aggregateSimCloudWatchDatapoints } from "../../metric/sim-cloudwatch-datapoint.js";
import type { SimCloudWatchMetricStore } from "../../metric/sim-cloudwatch-metric-store.js";
import { bucketSimCloudWatchDatapoints } from "../../metric/sim-cloudwatch-period.js";
import { simCloudWatchStatisticValue } from "../../metric/sim-cloudwatch-statistic.js";
import type { SimCloudWatchTimeRange } from "../../metric/sim-cloudwatch-time-range.js";
import type { SimCloudWatchMetricDataResult } from "./query.command.js";
import type { SimCloudWatchReadMetricDataQuery } from "./sim-cloudwatch-metric-data-query.js";

/**
 * The status a result carries when the whole of its range was answered. Every
 * result here is complete, because nothing truncates one.
 */
const completeStatus = "Complete";

/**
 * One period of a result: when it began and what the query's statistic makes
 * of it.
 */
type SimCloudWatchQueryPeriod = readonly [Date, number];

interface SimCloudWatchMetricDataResultProperties {
  readonly metrics: SimCloudWatchMetricStore;
  readonly query: SimCloudWatchReadMetricDataQuery;
  readonly range: SimCloudWatchTimeRange;

  /** Whether the request asked for its values oldest first. */
  readonly ascending: boolean;
}

/**
 * Answer one query with the values and timestamps a result reports.
 *
 * A metric nothing has been written to gets a result holding nothing, rather
 * than no result at all: real CloudWatch answers every query it was given.
 */
export function simCloudWatchMetricDataResult(
  properties: SimCloudWatchMetricDataResultProperties,
): SimCloudWatchMetricDataResult {
  const { metrics, query, range, ascending } = properties;
  const found = metrics.find(query.identity);
  const periods = queryPeriods(
    found?.within({ ...range, unit: query.unit }) ?? [],
    query,
  );
  const ordered = ascending ? periods : periods.toReversed();

  return {
    Id: query.id,
    Label: query.label,
    Timestamps: ordered.map(([timestamp]) => timestamp),
    Values: ordered.map(([, value]) => value),
    StatusCode: completeStatus,
  };
}

function queryPeriods(
  datapoints: Parameters<typeof bucketSimCloudWatchDatapoints>[0],
  query: SimCloudWatchReadMetricDataQuery,
): readonly SimCloudWatchQueryPeriod[] {
  return bucketSimCloudWatchDatapoints(datapoints, query.period)
    .entries()
    .flatMap(([start, inPeriod]) => {
      const aggregate = aggregateSimCloudWatchDatapoints(inPeriod);

      return aggregate === undefined
        ? []
        : [
            [
              new Date(start),
              simCloudWatchStatisticValue(aggregate, query.statistic),
            ] as SimCloudWatchQueryPeriod,
          ];
    })
    .toArray();
}
