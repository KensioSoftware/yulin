import {
  SimCloudWatchInvalidParameterValueException,
  SimCloudWatchMissingRequiredParameterException,
} from "../../error/sim-cloudwatch.error.js";
import type { SimCloudWatchMetricDataQueryInput } from "./query.command.js";
import type { SimCloudWatchReadMetricDataQuery } from "./sim-cloudwatch-metric-data-query.js";

/**
 * How real CloudWatch orders the values in a result when nothing says
 * otherwise.
 */
const timestampDescending = "TimestampDescending";
const timestampAscending = "TimestampAscending";

/**
 * Read the queries a request carries, refusing one that carries none.
 */
export function requiredSimCloudWatchQueries(
  queries: readonly SimCloudWatchMetricDataQueryInput[] | undefined,
): readonly SimCloudWatchMetricDataQueryInput[] {
  if (queries === undefined || queries.length === 0) {
    throw new SimCloudWatchMissingRequiredParameterException(
      "The parameter MetricDataQueries must be present and not empty.",
    );
  }

  return queries;
}

/**
 * Refuse a request whose queries do not each have an id of their own, since a
 * result is only findable by the id its query was given.
 */
export function refuseRepeatedSimCloudWatchQueryIds(
  queries: readonly SimCloudWatchReadMetricDataQuery[],
): void {
  const ids = new Set(queries.map((query) => query.id));

  if (ids.size !== queries.length) {
    throw new SimCloudWatchInvalidParameterValueException(
      "Every metric data query must carry an Id no other query in the same " +
        "request uses.",
    );
  }
}

/**
 * Whether the request asked for its values oldest first.
 */
export function simCloudWatchScansAscending(
  scanBy: string | undefined,
): boolean {
  if (scanBy === undefined || scanBy === timestampDescending) {
    return false;
  }

  if (scanBy === timestampAscending) {
    return true;
  }

  throw new SimCloudWatchInvalidParameterValueException(
    `The parameter ScanBy must be ${timestampAscending} or ` +
      `${timestampDescending}.`,
  );
}

/**
 * Refuse the two ways a request asks for a resolution or a page this
 * simulation does not produce.
 *
 * Real CloudWatch answers MaxDatapoints by widening the period until the
 * result fits, so a request carrying one and getting the period it asked for
 * back would be reading values at a resolution real AWS would not have given
 * it. No result here is ever truncated, so no token is ever issued either.
 */
export function refuseUnsimulatedSimCloudWatchPaging(
  maxDatapoints: number | undefined,
  nextToken: string | undefined,
): void {
  if (maxDatapoints !== undefined) {
    throw new SimCloudWatchInvalidParameterValueException(
      "MaxDatapoints is not simulated: real CloudWatch answers it by " +
        "widening the period, and every result here is returned at the " +
        "period its query asked for.",
    );
  }

  if (nextToken !== undefined) {
    throw new SimCloudWatchInvalidParameterValueException(
      "The parameter NextToken is not a token this simulation issued: " +
        "GetMetricData answers every query in full here.",
    );
  }
}
