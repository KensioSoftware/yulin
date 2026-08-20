import type { SimWafFieldToMatchInput } from "./sim-waf-field-to-match.type.js";
import {
  invalidSimWafRule,
  refuseSimWafRuleInput,
} from "./sim-waf-rule-refusals.js";

/**
 * Refuse the field-to-match kinds real WAFv2 offers and this simulation does
 * not read.
 *
 * Each is named where the rule was written, because a field that was accepted
 * and then never read would leave the rule matching nothing at all: the web
 * ACL would look like it covered the request and would let it through.
 */
export function refuseUnsimulatedSimWafField(
  field: SimWafFieldToMatchInput,
  ruleName: string,
): void {
  refuseTwoFields(field, ruleName);

  if (field.JsonBody !== undefined) {
    refuseSimWafRuleInput(
      ruleName,
      "the field to match JsonBody",
      "matching inside a parsed JSON body has a path syntax of its own, and " +
        "its own answer for a body that will not parse",
    );
  }

  if (field.HeaderOrder !== undefined) {
    refuseSimWafRuleInput(
      ruleName,
      "the field to match HeaderOrder",
      "the order headers arrived in is not something a simulated request " +
        "carries",
    );
  }

  if (field.UriFragment !== undefined) {
    refuseSimWafRuleInput(
      ruleName,
      "the field to match UriFragment",
      "a fragment is never sent to a server, so no request here has one",
    );
  }

  refuseFingerprintFields(field, ruleName);
}

/**
 * Refuse a field to match naming more than one part of the request.
 *
 * Real WAFv2 takes one request component per `FieldToMatch`, and a rule that
 * wants two is written as two rules. Reading the first component found would
 * make which of them the rule inspected a matter of the order they are checked
 * in.
 */
function refuseTwoFields(
  field: SimWafFieldToMatchInput,
  ruleName: string,
): void {
  const named = Object.entries(field)
    .filter(([, value]) => value !== undefined)
    .map(([component]) => component);

  if (named.length > 1) {
    invalidSimWafRule(
      ruleName,
      `The field to match names ${named.join(" and ")}, and a statement ` +
        `inspects one request component`,
    );
  }
}

function refuseFingerprintFields(
  field: SimWafFieldToMatchInput,
  ruleName: string,
): void {
  const fingerprint =
    field.JA3Fingerprint === undefined ? undefined : "JA3Fingerprint";
  const named =
    field.JA4Fingerprint === undefined ? fingerprint : "JA4Fingerprint";

  if (named !== undefined) {
    refuseSimWafRuleInput(
      ruleName,
      `the field to match ${named}`,
      "a TLS fingerprint comes from the handshake, and a request that " +
        "reached a simulated service made none",
    );
  }
}
