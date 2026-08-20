import type { SimWafInspectedRequest } from "../evaluate/sim-waf-inspected-request.js";
import { compileSimWafFieldToMatch } from "./sim-waf-field-to-match.js";
import type { SimWafFieldToMatchInput } from "./sim-waf-field-to-match.type.js";
import {
  compileSimWafTextTransformations,
  type SimWafTextTransformationInput,
} from "./sim-waf-text-transformation.js";

/**
 * Whether one statement claims a request.
 */
export type SimWafMatcher = (request: SimWafInspectedRequest) => boolean;

/**
 * Whether one string a field held is what a statement is looking for.
 */
export type SimWafValueTest = (value: string) => boolean;

/**
 * What the three statement kinds that read a request field have in common.
 */
export interface SimWafFieldMatcherProperties {
  readonly field: SimWafFieldToMatchInput | undefined;
  readonly transformations:
    | readonly SimWafTextTransformationInput[]
    | undefined;
  readonly ruleName: string;
  readonly test: SimWafValueTest;
}

/**
 * Build the matcher for a statement that reads one request field.
 *
 * A field can hold more than one string, and WAF matches a statement when any
 * of them matches: one header out of the set a pattern selected is enough, and
 * so is one query argument out of all of them.
 */
export function compileSimWafFieldMatcher(
  properties: SimWafFieldMatcherProperties,
): SimWafMatcher {
  const read = compileSimWafFieldToMatch(properties.field, properties.ruleName);
  const transform = compileSimWafTextTransformations(
    properties.transformations,
    properties.ruleName,
  );
  const { test } = properties;

  return (request): boolean => {
    const content = read(request);

    return content.outcome === "inspect"
      ? content.candidates.some((candidate) => test(transform(candidate)))
      : content.outcome === "match";
  };
}
