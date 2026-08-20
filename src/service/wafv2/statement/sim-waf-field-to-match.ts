import type { SimWafInspectedRequest } from "../evaluate/sim-waf-inspected-request.js";
import type { SimWafFieldContent } from "./sim-waf-field-content.js";
import type {
  SimWafFieldToMatchInput,
  SimWafNamedFieldInput,
} from "./sim-waf-field-to-match.type.js";
import { compileSimWafSetField } from "./sim-waf-set-field.js";
import {
  type SimWafNameValue,
  simWafQueryArguments,
} from "./sim-waf-request-fields.js";
import { invalidSimWafRule } from "./sim-waf-rule-refusals.js";
import { refuseUnsimulatedSimWafField } from "./sim-waf-unsimulated-field.js";

/**
 * How a compiled rule reads the field it inspects.
 */
export type SimWafFieldReader = (
  request: SimWafInspectedRequest,
) => SimWafFieldContent;

/**
 * Build the reader a rule uses to get at the part of a request it inspects.
 *
 * A reader answers with every string the field held, because several of the
 * field kinds hold more than one: all the query arguments, all the headers a
 * pattern selected. A statement matches when any of them matches, which is
 * what WAF does.
 */
export function compileSimWafFieldToMatch(
  field: SimWafFieldToMatchInput | undefined,
  ruleName: string,
): SimWafFieldReader {
  if (field === undefined) {
    invalidSimWafRule(ruleName, "FieldToMatch is required");
  }

  refuseUnsimulatedSimWafField(field, ruleName);

  return compileWholeField(field, ruleName);
}

/**
 * The fields that are read whole, with nothing to select within them.
 */
function compileWholeField(
  field: SimWafFieldToMatchInput,
  ruleName: string,
): SimWafFieldReader {
  if (field.UriPath !== undefined) {
    return (request): SimWafFieldContent => inspect([request.uriPath]);
  }

  if (field.QueryString !== undefined) {
    return (request): SimWafFieldContent => inspect([request.queryString]);
  }

  if (field.Method !== undefined) {
    return (request): SimWafFieldContent => inspect([request.method]);
  }

  if (field.AllQueryArguments !== undefined) {
    return (request): SimWafFieldContent =>
      inspect(values(simWafQueryArguments(request.queryString)));
  }

  return compileNamedField(field, ruleName);
}

/**
 * The fields that name what they read within a set.
 */
function compileNamedField(
  field: SimWafFieldToMatchInput,
  ruleName: string,
): SimWafFieldReader {
  if (field.SingleQueryArgument !== undefined) {
    const wanted = requiredName(field.SingleQueryArgument, ruleName);

    return (request): SimWafFieldContent =>
      inspect(
        values(
          simWafQueryArguments(request.queryString).filter(
            (argument) => argument.name === wanted,
          ),
        ),
      );
  }

  if (field.SingleHeader !== undefined) {
    const wanted = requiredName(field.SingleHeader, ruleName);

    return (request): SimWafFieldContent =>
      inspect(headerValues(request.headers, wanted));
  }

  return compileSimWafSetField(field, ruleName);
}

function inspect(candidates: readonly string[]): SimWafFieldContent {
  return { outcome: "inspect", candidates };
}

function values(entries: readonly SimWafNameValue[]): readonly string[] {
  return entries.map((entry) => entry.value);
}

/**
 * Every value a header carries.
 *
 * The Headers class joins repeats with a comma, and WAF inspects the joined
 * value the same way, so this is one candidate or none.
 */
function headerValues(headers: Headers, name: string): readonly string[] {
  const value = headers.get(name);

  return value === null ? [] : [value];
}

function requiredName(field: SimWafNamedFieldInput, ruleName: string): string {
  if (field.Name === undefined || field.Name === "") {
    invalidSimWafRule(ruleName, "The field to match needs a Name");
  }

  return field.Name.toLowerCase();
}
