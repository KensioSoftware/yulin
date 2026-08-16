import {
  SimCloudWatchInvalidParameterValueException,
  SimCloudWatchMissingRequiredParameterException,
} from "../../error/sim-cloudwatch.error.js";
import { requiredSimCloudWatchDimensions } from "../../metric/sim-cloudwatch-dimension.js";
import type { SimCloudWatchMetricIdentity } from "../../metric/sim-cloudwatch-metric.js";
import { requiredSimCloudWatchName } from "../../metric/sim-cloudwatch-name.js";
import { requiredSimCloudWatchNamespace } from "../../metric/sim-cloudwatch-namespace.js";
import { requiredSimCloudWatchPeriod } from "../../metric/sim-cloudwatch-period.js";
import {
  requiredSimCloudWatchStatistic,
  type SimCloudWatchStatistic,
} from "../../metric/sim-cloudwatch-statistic.js";
import type { SimCloudWatchMetricDataQueryInput } from "./query.command.js";

/**
 * What real CloudWatch accepts as a query id: a lower-case letter, then
 * letters, digits and underscores.
 */
const queryIdPattern = /^[a-z][A-Za-z0-9_]*$/;

/**
 * One GetMetricData query, read into what it takes to answer it.
 */
export interface SimCloudWatchReadMetricDataQuery {
  readonly id: string;
  readonly label: string;
  readonly identity: SimCloudWatchMetricIdentity;
  readonly period: number;
  readonly statistic: SimCloudWatchStatistic;
  readonly unit: string | undefined;
  readonly returnData: boolean;
}

/**
 * Read one GetMetricData query.
 *
 * Only the MetricStat form is read. A metric math expression is refused rather
 * than answered from the metric it happens to mention: `SUM(errors)/SUM(calls)`
 * quietly reported as `SUM(errors)` would make a test pass on the wrong number.
 */
export function readSimCloudWatchMetricDataQuery(
  query: SimCloudWatchMetricDataQueryInput,
): SimCloudWatchReadMetricDataQuery {
  const id = requiredQueryId(query.Id);

  if (query.Expression !== undefined) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The query ${id} carries an Expression, and metric math is not ` +
        `simulated. Ask for the metric itself with MetricStat.`,
    );
  }

  const metricStat = query.MetricStat;

  if (metricStat === undefined) {
    throw new SimCloudWatchMissingRequiredParameterException(
      `The query ${id} must carry a MetricStat.`,
    );
  }

  return {
    id,
    label: query.Label ?? requiredMetricName(metricStat.Metric?.MetricName),
    identity: {
      namespace: requiredSimCloudWatchNamespace(metricStat.Metric?.Namespace),
      metricName: requiredMetricName(metricStat.Metric?.MetricName),
      dimensions: requiredSimCloudWatchDimensions(
        metricStat.Metric?.Dimensions,
      ),
    },
    period: requiredSimCloudWatchPeriod(metricStat.Period),
    statistic: requiredSimCloudWatchStatistic(
      requiredStat(metricStat.Stat, id),
    ),
    unit: metricStat.Unit,
    returnData: query.ReturnData ?? true,
  };
}

function requiredMetricName(metricName: string | undefined): string {
  return requiredSimCloudWatchName("MetricName", metricName);
}

function requiredStat(stat: string | undefined, id: string): string {
  if (stat === undefined) {
    throw new SimCloudWatchMissingRequiredParameterException(
      `The query ${id} must carry a MetricStat.Stat.`,
    );
  }

  return stat;
}

function requiredQueryId(id: string | undefined): string {
  if (id === undefined) {
    throw new SimCloudWatchMissingRequiredParameterException(
      "Every metric data query must carry an Id.",
    );
  }

  if (!queryIdPattern.test(id)) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The query id ${id} must start with a lower-case letter and hold only ` +
        `letters, digits and underscores.`,
    );
  }

  return id;
}
