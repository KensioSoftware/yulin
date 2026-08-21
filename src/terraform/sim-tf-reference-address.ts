/**
 * How a Terraform reference string is read, before anything is looked up.
 *
 * A reference is text the configuration wrote, and two things about that text
 * have to be settled before a resource can be found behind it. Which of the
 * forms Terraform lists is the one to follow, and what the reference means
 * from outside the module that wrote it.
 */

/**
 * References ordered longest first.
 *
 * Terraform lists the attribute form and the bare resource form of one
 * reference. The attribute form is longer, and it is the one that resolves to
 * the value being read rather than to the resource as a whole.
 */
export function longestFirst(references: readonly string[]): readonly string[] {
  return references.toSorted((a, b) => b.length - a.length);
}

/**
 * Scopes that name something other than a resource of the same module.
 *
 * A reference under one of these is resolved by Terraform rather than by an
 * address lookup, and prefixing it with the module path would invent an
 * address no resource has.
 */
const unqualifiedScopes = [
  "var.",
  "local.",
  "each.",
  "count.",
  "self.",
  "data.",
  "path.",
  "terraform.",
];

/**
 * A module-relative reference turned into a plan-wide address.
 *
 * References inside a module name their own module's resources without the
 * module prefix that `planned_values` puts on them. A reference to another
 * module's output is qualified the same way, because the output index is keyed
 * by the full call path and a nested call would otherwise miss it.
 */
export function qualifiedReference(
  reference: string,
  modulePath: readonly string[],
): string {
  if (
    modulePath.length === 0 ||
    unqualifiedScopes.some((scope) => reference.startsWith(scope))
  ) {
    return reference;
  }

  return `${modulePath.map((call) => `module.${call}`).join(".")}.${reference}`;
}
