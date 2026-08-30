/**
 * What asked for a datapoint the log group could not publish.
 *
 * A discriminated pair rather than a name, because a metric filter may be
 * called anything a caller likes. A filter named after the other kind would
 * otherwise be indistinguishable from it on the ledger.
 */
export type SimLogsMetricPublicationSource =
  | { readonly kind: "metricFilter"; readonly filterName: string }
  | { readonly kind: "embeddedMetricFormat" };

/**
 * The source of a datapoint an embedded metric document asked for.
 */
export const simLogsEmbeddedMetricSource: SimLogsMetricPublicationSource = {
  kind: "embeddedMetricFormat",
};

/**
 * The source of a datapoint a metric filter asked for.
 */
export function metricFilterSource(
  filterName: string,
): SimLogsMetricPublicationSource {
  return { kind: "metricFilter", filterName };
}

/**
 * One datapoint a log group could not turn into a metric.
 */
export interface SimLogsMetricPublicationFailure {
  readonly logGroupName: string;
  readonly source: SimLogsMetricPublicationSource;
  readonly metricNamespace: string;
  readonly metricName: string;
  readonly reason: string;
}
