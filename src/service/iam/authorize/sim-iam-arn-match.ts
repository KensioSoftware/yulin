import { simIamWildcardMatch } from "./sim-iam-wildcard.js";

/**
 * The number of colon-delimited components an ARN has.
 *
 * The last of them is the resource, which may itself contain colons, so
 * anything past the fifth colon belongs to it.
 */
const arnComponentCount = 6;

/**
 * Match an ARN against an ARN pattern, as the `ArnLike` and `ArnEquals`
 * condition operators do.
 *
 * AWS compares each of the six colon-delimited components separately, and a
 * wildcard in one of them stays inside it: `arn:aws:s3:*` does not match an
 * ARN whose Account or resource happen to make the rest of the string fit. A
 * pattern with fewer components than an ARN has therefore matches nothing,
 * which is stricter than comparing the two as plain strings would be.
 */
export function simIamArnMatch(pattern: string, value: string): boolean {
  const patternComponents = arnComponents(pattern);
  const valueComponents = arnComponents(value);

  if (patternComponents.length !== valueComponents.length) {
    return false;
  }

  // The two have the same number of components, so the fallback below stands
  // in for a component that cannot be missing.
  return patternComponents.every((component, index) =>
    simIamWildcardMatch(component, valueComponents.at(index) ?? "", {
      caseSensitive: true,
    }),
  );
}

/**
 * Split an ARN into its six components, leaving any colons in the resource
 * component where they are.
 */
function arnComponents(arn: string): readonly string[] {
  const components = arn.split(":");

  if (components.length <= arnComponentCount) {
    return components;
  }

  return [
    ...components.slice(0, arnComponentCount - 1),
    components.slice(arnComponentCount - 1).join(":"),
  ];
}
