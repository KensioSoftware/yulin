import type { SimLogsMetricDatapoint } from "../sim-logs-metric-datapoint.js";
import {
  simLogsEmbeddedMetricDocument,
  type SimLogsEmbeddedMetricDirective,
  type SimLogsEmbeddedMetricDocument,
} from "./sim-logs-embedded-metric-document.js";
import {
  embeddedMetricDimensions,
  embeddedMetricValues,
} from "./sim-logs-embedded-metric-values.js";

/**
 * One metric an EMF document declared and this could not publish.
 */
export interface SimLogsEmbeddedMetricSkip {
  readonly metricNamespace: string;
  readonly metricName: string;
  readonly reason: string;
}

/**
 * What one log event's EMF document produced.
 */
export interface SimLogsEmbeddedMetricReading {
  readonly datapoints: readonly SimLogsMetricDatapoint[];
  readonly skipped: readonly SimLogsEmbeddedMetricSkip[];
}

const nothingRead: SimLogsEmbeddedMetricReading = {
  datapoints: [],
  skipped: [],
};

/**
 * Read the metrics one log event's message publishes as EMF.
 *
 * A message that is not an EMF document reads as nothing at all. The timestamp
 * comes from the document where it carries one, because a Powertools handler
 * stamps its own document, and from the instant CloudWatch Logs took the event
 * where it does not.
 */
export function simLogsEmbeddedMetricReading(
  message: string,
  ingestionTime: number,
): SimLogsEmbeddedMetricReading {
  const document = simLogsEmbeddedMetricDocument(message);

  if (document === undefined) {
    return nothingRead;
  }

  const datapoints: SimLogsMetricDatapoint[] = [];
  const skipped: SimLogsEmbeddedMetricSkip[] = [];
  const timestamp = document.timestamp ?? ingestionTime;

  for (const directive of document.directives) {
    const read = readDirective(document, directive, timestamp);

    datapoints.push(...read.datapoints);
    skipped.push(...read.skipped);
  }

  return { datapoints, skipped };
}

function readDirective(
  document: SimLogsEmbeddedMetricDocument,
  directive: SimLogsEmbeddedMetricDirective,
  timestamp: number,
): SimLogsEmbeddedMetricReading {
  const datapoints: SimLogsMetricDatapoint[] = [];
  const skipped: SimLogsEmbeddedMetricSkip[] = [];
  const declared = directive.dimensionSets
    .map((keys) => embeddedMetricDimensions(document, keys))
    .filter((dimensions) => dimensions !== undefined);

  // A directive naming no dimension set still publishes, undimensioned, which
  // is what an EMF document with an empty Dimensions list asks for.
  const dimensionSets = declared.length > 0 ? declared : [[]];

  for (const metric of directive.metrics) {
    const values = embeddedMetricValues(document, metric);

    if (typeof values === "string") {
      skipped.push({
        metricNamespace: directive.namespace,
        metricName: metric.name,
        reason: values,
      });

      continue;
    }

    for (const dimensions of dimensionSets) {
      for (const value of values) {
        datapoints.push({
          namespace: directive.namespace,
          metricName: metric.name,
          value,
          timestamp,
          unit: metric.unit,
          dimensions,
        });
      }
    }
  }

  return { datapoints, skipped };
}
