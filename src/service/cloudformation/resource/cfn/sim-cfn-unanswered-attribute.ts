/**
 * The stand-in an `Fn::GetAtt` resolves to when nothing here can answer it.
 *
 * A Resource type this simulator does not create, and an attribute a created
 * Resource has no value for, both leave the reference with nothing behind it.
 * Rather than fail the Stack over it, the reference resolves to the Resource's
 * logical ID and the attribute name, which is a value a template can carry
 * without meaning anything.
 *
 * The format is shared so that a service meeting one of these can tell it
 * apart from a value the template meant.
 */
export function simCfnUnansweredAttribute(
  logicalId: string,
  attributeName: string,
): string {
  return `${logicalId}.${attributeName}`;
}

/**
 * What every dot-separated part of a stand-in looks like.
 *
 * A logical ID is alphanumeric and holds no dot at all, so the part before the
 * first one is the whole of it. An attribute name does hold dots, as
 * `Endpoint.Address` and `Outputs.NestedStackOutput` do.
 */
const alphanumericPattern = /^[A-Za-z0-9]+$/u;

/**
 * Whether a value is the stand-in for an attribute of a Resource in this
 * Stack.
 *
 * Read by a service deciding what to do about a property whose value never
 * arrived. A value has to carry the whole shape and name a Resource the Stack
 * holds, which is more than a template writes by hand.
 */
export function namesSimCfnUnansweredAttribute(
  value: string,
  logicalIds: Iterable<string>,
): boolean {
  const parts = value.split(".");

  if (
    parts.length < 2 ||
    parts.some((part) => !alphanumericPattern.test(part))
  ) {
    return false;
  }

  const named = parts[0];

  for (const logicalId of logicalIds) {
    if (logicalId === named) {
      return true;
    }
  }

  return false;
}
