import {
  SimLogsInvalidParameterException,
  SimLogsUnsupportedOperationException,
} from "../error/sim-logs.error.js";
import type {
  SimLogsMetricDatapoint,
  SimLogsMetricDimension,
} from "./sim-logs-metric-datapoint.js";

/**
 * The character real CloudWatch Logs reads as naming a field of the log event
 * rather than as part of a literal.
 *
 * `$1` names the first field of a space delimited pattern and `$.level` a JSON
 * property. Both need the pattern to have been read structurally.
 */
const eventFieldPrefix = "$";

/**
 * How many dimensions real CloudWatch Logs allows on one transformation.
 */
export const simLogsMaximumMetricDimensions = 3;

export interface SimLogsMetricTransformationProperties {
  readonly metricNamespace: string;
  readonly metricName: string;
  readonly metricValue: string;
  readonly defaultValue: number | undefined;
  readonly unit: string | undefined;
  readonly dimensions: readonly SimLogsMetricDimension[];
}

/**
 * How one metric filter turns a log event into a metric datapoint.
 *
 * The value is read once, when the filter is put, so a value this simulator
 * cannot produce is refused there rather than on the first event that happens
 * to match. Real CloudWatch Logs validates a transformation at
 * `PutMetricFilter` too.
 */
export class SimLogsMetricTransformation {
  readonly metricNamespace: string;
  readonly metricName: string;
  readonly metricValue: string;
  readonly defaultValue: number | undefined;
  readonly unit: string | undefined;
  readonly dimensions: readonly SimLogsMetricDimension[];

  readonly #matchedValue: number;

  constructor(properties: SimLogsMetricTransformationProperties) {
    this.metricNamespace = properties.metricNamespace;
    this.metricName = properties.metricName;
    this.metricValue = properties.metricValue;
    this.defaultValue = properties.defaultValue;
    this.unit = properties.unit;
    this.dimensions = refuseFieldDimensions(properties.dimensions);
    this.#matchedValue = literalMetricValue(properties.metricValue);

    refuseDefaultValueWithDimensions(properties);
  }

  /**
   * The datapoint one matching log event publishes.
   */
  matched(timestamp: number): SimLogsMetricDatapoint {
    return this.datapoint(this.#matchedValue, timestamp);
  }

  /**
   * The datapoint one period that matched nothing publishes, where the
   * transformation sets a default value.
   *
   * A transformation with no default value publishes nothing for a period it
   * matched nothing in, which is what leaves the metric with no datapoint at
   * all over a quiet stretch.
   */
  unmatched(timestamp: number): SimLogsMetricDatapoint | undefined {
    return this.defaultValue === undefined
      ? undefined
      : this.datapoint(this.defaultValue, timestamp);
  }

  private datapoint(value: number, timestamp: number): SimLogsMetricDatapoint {
    return {
      namespace: this.metricNamespace,
      metricName: this.metricName,
      value,
      timestamp,
      unit: this.unit,
      dimensions: this.dimensions,
    };
  }
}

/**
 * Read a metric value this simulation can publish.
 *
 * Real CloudWatch Logs takes either a number or a reference to a field of the
 * matched event. A field reference needs the pattern to have been read
 * structurally, and `SimLogsFilterPattern` refuses both structured syntaxes,
 * so a filter naming one is refused here rather than publishing a number that
 * was never in the log line.
 */
function literalMetricValue(metricValue: string): number {
  if (metricValue.startsWith(eventFieldPrefix)) {
    throw new SimLogsUnsupportedOperationException(
      `Simulated CloudWatch Logs does not support a metricValue naming a ` +
        `field of the log event yet: ${metricValue}. Reading one needs a JSON ` +
        `property or space delimited filter pattern, and neither is ` +
        `simulated. A literal number publishes.`,
    );
  }

  const value = Number(metricValue);

  if (!Number.isFinite(value)) {
    throw new SimLogsInvalidParameterException(
      `Invalid metric value ${metricValue}: a metricValue must be a number or ` +
        `a reference to a field of the log event.`,
    );
  }

  return value;
}

/**
 * Refuse a default value on a transformation that also has dimensions.
 *
 * Real CloudWatch Logs allows one or the other. A metric a filter gives
 * dimensions to cannot have a default value, because the default would have to
 * be reported against every dimension value the filter has ever seen.
 */
function refuseDefaultValueWithDimensions(
  properties: SimLogsMetricTransformationProperties,
): void {
  if (
    properties.defaultValue !== undefined &&
    properties.dimensions.length > 0
  ) {
    throw new SimLogsInvalidParameterException(
      "A metric filter transformation carrying dimensions cannot also carry " +
        "a defaultValue. CloudWatch Logs allows one or the other.",
    );
  }
}

/**
 * Refuse dimensions this simulation cannot fill in.
 *
 * A dimension value naming a field of the event has the same problem a metric
 * value naming one has, and a dimension quietly dropped would put the
 * datapoint under an identity no alarm is watching.
 */
function refuseFieldDimensions(
  dimensions: readonly SimLogsMetricDimension[],
): readonly SimLogsMetricDimension[] {
  if (dimensions.length > simLogsMaximumMetricDimensions) {
    throw new SimLogsInvalidParameterException(
      `A metric filter transformation may have at most ` +
        `${simLogsMaximumMetricDimensions} dimensions.`,
    );
  }

  for (const dimension of dimensions) {
    if (dimension.value.startsWith(eventFieldPrefix)) {
      throw new SimLogsUnsupportedOperationException(
        `Simulated CloudWatch Logs does not support a dimension naming a ` +
          `field of the log event yet: ${dimension.name} is ` +
          `${dimension.value}. A literal value publishes.`,
      );
    }
  }

  return dimensions;
}
