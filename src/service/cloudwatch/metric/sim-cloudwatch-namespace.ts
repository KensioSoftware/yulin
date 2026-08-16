import { SimCloudWatchInvalidParameterValueException } from "../error/sim-cloudwatch.error.js";
import { requiredSimCloudWatchName } from "./sim-cloudwatch-name.js";

/**
 * The namespace prefix real CloudWatch keeps for the metrics AWS publishes
 * itself, and refuses to let PutMetricData write into.
 */
export const simCloudWatchReservedNamespacePrefix = "AWS/";

/**
 * Read a namespace, refusing one real CloudWatch would refuse.
 *
 * A leading colon is refused on its own account: the API's own pattern for this
 * field is anything whose first character is not a colon.
 */
export function requiredSimCloudWatchNamespace(namespace?: string): string {
  const value = requiredSimCloudWatchName("Namespace", namespace);

  if (value.startsWith(":")) {
    throw new SimCloudWatchInvalidParameterValueException(
      "The parameter Namespace must not start with a colon.",
    );
  }

  return value;
}

/**
 * Read a namespace a metric may be written into.
 *
 * Reserved namespaces are refused here rather than in the reader above,
 * because reading a metric out of one is allowed and only writing into one is
 * not. Nothing in this simulation publishes into `AWS/` either, so a namespace
 * beginning that way holds no metrics at all here.
 */
export function requiredSimCloudWatchWritableNamespace(
  namespace?: string,
): string {
  const value = requiredSimCloudWatchNamespace(namespace);

  if (value.startsWith(simCloudWatchReservedNamespacePrefix)) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The namespace ${value} is reserved: namespaces beginning ` +
        `${simCloudWatchReservedNamespacePrefix} belong to the metrics AWS ` +
        `publishes, and PutMetricData cannot write into one.`,
    );
  }

  return value;
}
