import type { SimLogsMetricDimension } from "../sim-logs-metric-datapoint.js";
import type {
  SimLogsEmbeddedMetricDeclaration,
  SimLogsEmbeddedMetricDocument,
} from "./sim-logs-embedded-metric-document.js";

/**
 * The resolution real CloudWatch reads as a high resolution metric.
 */
const highStorageResolution = 1;

/**
 * Why a metric an EMF document declared could not be published.
 */
export type SimLogsEmbeddedMetricRefusal = string;

/**
 * The values a metric declaration names, or the reason there are none.
 *
 * EMF carries a metric's value as a top-level property of the same document,
 * either as one number or as a list of them.
 */
export function embeddedMetricValues(
  document: SimLogsEmbeddedMetricDocument,
  metric: SimLogsEmbeddedMetricDeclaration,
): readonly number[] | SimLogsEmbeddedMetricRefusal {
  if (metric.storageResolution === highStorageResolution) {
    return (
      "StorageResolution 1 asks for a high resolution metric, and every " +
      "period in this simulated CloudWatch is a whole number of minutes."
    );
  }

  const raw = document.values.get(metric.name);
  const values = (Array.isArray(raw) ? raw : [raw]).filter(
    (value) => typeof value === "number" && Number.isFinite(value),
  );

  return values.length === 0
    ? `The document declares ${metric.name} and carries no number under that ` +
        `name, so there is no value to publish.`
    : values;
}

/**
 * One dimension set, or undefined where the document names a key it lacks.
 *
 * A dimension quietly dropped would put the datapoint under an identity no
 * alarm is watching, so the whole set goes rather than part of it.
 */
export function embeddedMetricDimensions(
  document: SimLogsEmbeddedMetricDocument,
  keys: readonly string[],
): readonly SimLogsMetricDimension[] | undefined {
  const dimensions: SimLogsMetricDimension[] = [];

  for (const name of keys) {
    const value = document.values.get(name);

    if (typeof value !== "string") {
      return undefined;
    }

    dimensions.push({ name, value });
  }

  return dimensions;
}
