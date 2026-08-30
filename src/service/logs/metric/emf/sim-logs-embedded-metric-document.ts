import {
  embeddedMetricList,
  embeddedMetricNumber,
  embeddedMetricRecord,
  embeddedMetricString,
} from "./sim-logs-embedded-metric-json.js";

/**
 * The property an Embedded Metric Format document carries its metadata under.
 *
 * A log event without it is an ordinary line, and the great majority of lines
 * in a log group are. Looking for this before parsing anything is what keeps
 * the check on the write path cheap.
 */
export const embeddedMetricMetadataKey = "_aws";

/**
 * One metric an EMF document declares.
 */
export interface SimLogsEmbeddedMetricDeclaration {
  readonly name: string;
  readonly unit: string | undefined;
  readonly storageResolution: number | undefined;
}

/**
 * One namespace's worth of an EMF document's metadata.
 *
 * `dimensionSets` is a list of dimension key lists, and each inner list is one
 * whole dimension set. A document declaring two sets publishes each of its
 * metrics once per set.
 */
export interface SimLogsEmbeddedMetricDirective {
  readonly namespace: string;

  /**
   * Whether the directive asked for dimensions at all.
   *
   * A directive that asked for none publishes undimensioned. One that asked
   * and whose sets all turn out to be unusable publishes nothing, because
   * falling back to no dimensions would put the datapoint on a metric the
   * document never named.
   */
  readonly declaresDimensions: boolean;

  readonly dimensionSets: readonly (readonly string[])[];
  readonly metrics: readonly SimLogsEmbeddedMetricDeclaration[];
}

/**
 * An Embedded Metric Format document read out of one log event.
 *
 * `values` is every top-level property of the document, which is where both
 * the metric values and the dimension values live. The metadata names them,
 * and the document body carries them.
 */
export interface SimLogsEmbeddedMetricDocument {
  readonly timestamp: number | undefined;
  readonly directives: readonly SimLogsEmbeddedMetricDirective[];
  readonly values: ReadonlyMap<string, unknown>;
}

/**
 * Read a log event's message as an EMF document, or answer undefined.
 *
 * Anything that is not JSON, is not an object, or carries no usable `_aws`
 * metadata is an ordinary log line. It is stored and left alone rather than
 * refused, because a log group is full of lines that were never metrics.
 */
export function simLogsEmbeddedMetricDocument(
  message: string,
): SimLogsEmbeddedMetricDocument | undefined {
  if (!message.includes(embeddedMetricMetadataKey)) {
    return undefined;
  }

  const parsed = parseObject(message);
  const metadata = embeddedMetricRecord(parsed?.get(embeddedMetricMetadataKey));

  if (parsed === undefined || metadata === undefined) {
    return undefined;
  }

  const directives = embeddedMetricList(
    metadata.get("CloudWatchMetrics"),
    directiveOf,
  );

  return directives.length === 0
    ? undefined
    : {
        timestamp: embeddedMetricNumber(metadata.get("Timestamp")),
        directives,
        values: parsed,
      };
}

function parseObject(message: string): Map<string, unknown> | undefined {
  try {
    return embeddedMetricRecord(JSON.parse(message));
  } catch {
    return undefined;
  }
}

function directiveOf(
  value: unknown,
): SimLogsEmbeddedMetricDirective | undefined {
  const entry = embeddedMetricRecord(value);
  const namespace = embeddedMetricString(entry?.get("Namespace"));

  if (entry === undefined || namespace === undefined) {
    return undefined;
  }

  const dimensions = entry.get("Dimensions");

  if (dimensions !== undefined && !Array.isArray(dimensions)) {
    return undefined;
  }

  return {
    namespace,
    declaresDimensions: Array.isArray(dimensions) && dimensions.length > 0,
    dimensionSets: embeddedMetricList(dimensions, dimensionSetOf),
    metrics: embeddedMetricList(entry.get("Metrics"), metricOf),
  };
}

/**
 * One dimension set, or undefined where it is not a list of names.
 *
 * A member that is not a string takes the whole set with it. Keeping the ones
 * that were strings would publish under a narrower identity than the document
 * asked for, which is the same trouble as dropping a single dimension.
 */
function dimensionSetOf(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const names = value.map((name) => embeddedMetricString(name));

  return names.every((name) => name !== undefined) ? names : undefined;
}

function metricOf(
  value: unknown,
): SimLogsEmbeddedMetricDeclaration | undefined {
  const entry = embeddedMetricRecord(value);
  const name = embeddedMetricString(entry?.get("Name"));

  if (entry === undefined || name === undefined) {
    return undefined;
  }

  return {
    name,
    unit: embeddedMetricString(entry.get("Unit")),
    storageResolution: embeddedMetricNumber(entry.get("StorageResolution")),
  };
}
