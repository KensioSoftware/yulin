import {
  simWafDefaultBlockedResponse,
  type SimWafBlockedResponse,
} from "../evaluate/sim-waf-blocked-response.js";
import {
  invalidSimWafRule,
  refuseSimWafRuleInput,
} from "../statement/sim-waf-rule-refusals.js";
import {
  requiredSimWafResponseBody,
  simWafCustomHeaders,
} from "./sim-waf-custom-response.js";
import type {
  SimWafCustomResponseBodies,
  SimWafCustomResponseInput,
} from "./sim-waf-custom-response.type.js";
import type { SimWafActionInput } from "./sim-waf-action.type.js";

/**
 * What a block action answers with, which is WAF's own 403 unless the rule
 * named a response of its own.
 */
export function simWafBlockedResponse(
  customResponse: SimWafCustomResponseInput | undefined,
  bodies: SimWafCustomResponseBodies,
): SimWafBlockedResponse {
  const fallback = simWafDefaultBlockedResponse();

  if (customResponse === undefined) {
    return fallback;
  }

  const key = customResponse.CustomResponseBodyKey;
  const body =
    key === undefined ? undefined : requiredSimWafResponseBody(key, bodies);

  return {
    statusCode: customResponse.ResponseCode ?? fallback.statusCode,
    contentType: body?.contentType ?? fallback.contentType,
    body: body?.content ?? fallback.body,
    headers: simWafCustomHeaders(customResponse.ResponseHeaders),
  };
}

/**
 * Refuse an action this simulation cannot carry out.
 *
 * `Captcha` and `Challenge` are answered by a browser solving a puzzle and
 * sending a token back, which nothing in a test does. An action naming two
 * things to do is refused as well: real WAFv2 takes one, so reading the first
 * one found would make which of them applied a matter of the order they are
 * checked in.
 */
export function refuseUnsimulatedSimWafAction(
  action: SimWafActionInput | undefined,
  ruleName: string,
): void {
  const named = Object.entries(action ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([kind]) => kind);

  for (const kind of named) {
    if (kind === "Captcha" || kind === "Challenge") {
      refuseSimWafRuleInput(
        ruleName,
        `the ${kind} action`,
        "it is answered by a browser solving a puzzle and sending a token " +
          "back, and nothing in a test does that",
      );
    }
  }

  if (named.length > 1) {
    invalidSimWafRule(
      ruleName,
      `The action names ${named.join(" and ")}, and a rule takes one action`,
    );
  }
}
