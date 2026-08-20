import type { SimWafInspectedRequest } from "../evaluate/sim-waf-inspected-request.js";
import {
  type SimWafFieldContent,
  requiredSimWafOversizeHandling,
  simWafFieldContent,
} from "./sim-waf-field-content.js";
import type {
  SimWafFieldToMatchInput,
  SimWafHeadersFieldInput,
} from "./sim-waf-field-to-match.type.js";
import type { SimWafFieldReader } from "./sim-waf-field-to-match.js";
import {
  type SimWafNameValue,
  requiredSimWafMatchScope,
  simWafCookies,
  simWafHeaderEntries,
  simWafPatternCandidates,
} from "./sim-waf-request-fields.js";
import { invalidSimWafRule } from "./sim-waf-rule-refusals.js";

const decoder = new TextDecoder();

/**
 * Build the reader for the fields whose content WAF stops reading once it
 * reaches its inspection limit.
 *
 * These three are the ones that carry an `OversizeHandling`, because they are
 * the ones a request can make too big to read: a body, a header set, a cookie
 * set.
 */
export function compileSimWafSetField(
  field: SimWafFieldToMatchInput,
  ruleName: string,
): SimWafFieldReader {
  if (field.Headers !== undefined) {
    return entriesReader(field.Headers, ruleName, (request) =>
      simWafHeaderEntries(request.headers),
    );
  }

  if (field.Cookies !== undefined) {
    return entriesReader(field.Cookies, ruleName, (request) =>
      simWafCookies(request.headers),
    );
  }

  if (field.Body === undefined) {
    invalidSimWafRule(ruleName, "FieldToMatch names no field to match on");
  }

  const oversize = requiredSimWafOversizeHandling(
    field.Body.OversizeHandling,
    ruleName,
  );

  return (request): SimWafFieldContent =>
    simWafFieldContent(
      request.body === undefined ? [] : [decoder.decode(request.body)],
      oversize,
    );
}

function entriesReader(
  input: SimWafHeadersFieldInput,
  ruleName: string,
  entries: (request: SimWafInspectedRequest) => readonly SimWafNameValue[],
): SimWafFieldReader {
  const matchScope = requiredSimWafMatchScope(input.MatchScope, ruleName);
  const oversize = requiredSimWafOversizeHandling(
    input.OversizeHandling,
    ruleName,
  );
  const pattern = input.MatchPattern;

  return (request): SimWafFieldContent =>
    simWafFieldContent(
      simWafPatternCandidates({
        entries: entries(request),
        pattern,
        matchScope,
      }),
      oversize,
    );
}
