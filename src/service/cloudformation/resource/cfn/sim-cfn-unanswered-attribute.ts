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
 * Whether a value is the stand-in for an attribute of a Resource in this
 * Stack.
 *
 * Read by a service deciding what to do about a property whose value never
 * arrived. Nothing a template writes by hand looks like this, since the
 * logical ID has to be one the Stack holds.
 */
export function namesSimCfnUnansweredAttribute(
  value: string,
  logicalIds: Iterable<string>,
): boolean {
  for (const logicalId of logicalIds) {
    if (value.startsWith(`${logicalId}.`)) {
      return true;
    }
  }

  return false;
}
