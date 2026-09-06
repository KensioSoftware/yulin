/**
 * What a variable with no value renders as.
 *
 * Real API Gateway writes a single dash where a `$context` variable has
 * nothing behind it, such as `$context.integrationStatus` on a request no
 * integration ran for. AWS publishes the variables and leaves this rendering
 * undocumented, so it is what the service was observed to do.
 */
const noValue = "-";

/**
 * A `$context` reference, which is the name after the prefix and may carry
 * dots of its own, as `$context.identity.sourceIp` does.
 *
 * The name is matched as one run of word characters and dots. Written as a
 * repeated group it would nest two quantifiers, which is a shape a scanner
 * flags however the input is bounded, and this matches the same names.
 */
const contextReference = /\$context\.[A-Za-z0-9_.]+/g;

/**
 * Substitute a stage's access log format into the line one request writes.
 *
 * Everything outside a `$context` reference is copied through, which is what
 * carries the punctuation of a JSON format string into the log group. A
 * reference this simulation has no value for renders as a dash.
 */
export function simHttpApiAccessLogLine(
  format: string,
  variables: ReadonlyMap<string, string>,
): string {
  return format.replaceAll(contextReference, (reference) => {
    // A trailing dot belongs to the text around the reference rather than to
    // the name, as in a format ending one variable with a full stop.
    const name = reference.slice("$context.".length).replace(/\.+$/, "");

    return variables.get(name) ?? noValue;
  });
}
