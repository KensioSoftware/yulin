import type { SimCfnDynamicReference } from "./sim-cfn-dynamic-reference.type.js";

/**
 * The opening of every dynamic reference, used to skip strings holding none.
 */
const dynamicReferenceOpening = "{{resolve:";

/**
 * One dynamic reference inside a larger string.
 *
 * The body runs to the first `}`, which is what stops a reference from eating
 * the rest of the value it sits in. No segment of any reference CloudFormation
 * documents may hold a brace, and a secret ARN's colons are left for the
 * service reading the body to split.
 */
const dynamicReferencePattern = /\{\{resolve:([A-Za-z][\w-]*):([^{}]*)\}\}/g;

/**
 * What a caller answers each reference with.
 *
 * Answering `undefined` leaves the reference in the string as it was written,
 * which is what happens for a service this simulation has no resolver for.
 */
type SimCfnDynamicReferenceSubstitution = (
  reference: SimCfnDynamicReference,
) => string | undefined;

/**
 * Whether a string holds anything worth scanning.
 */
export function hasSimCfnDynamicReference(text: string): boolean {
  return text.includes(dynamicReferenceOpening);
}

/**
 * Replace every dynamic reference in a string with what the caller answers.
 *
 * The text around each reference is untouched, so a value written as
 * `prefix-{{resolve:ssm:name}}-suffix` keeps its prefix and suffix.
 */
export function substituteSimCfnDynamicReferences(
  text: string,
  substitute: SimCfnDynamicReferenceSubstitution,
): string {
  if (!hasSimCfnDynamicReference(text)) {
    return text;
  }

  return text.replaceAll(
    dynamicReferencePattern,
    (matched, service: string, body: string) => {
      const reference: SimCfnDynamicReference = {
        text: matched,
        service,
        body,
      };

      return substitute(reference) ?? matched;
    },
  );
}
