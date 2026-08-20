import {
  simWafDefaultBlockedResponse,
  type SimWafBlockedResponse,
} from "../evaluate/sim-waf-blocked-response.js";
import { SimWafInvalidParameterException } from "../error/sim-wafv2.error.js";
import {
  invalidSimWafRule,
  refuseSimWafRuleInput,
} from "../statement/sim-waf-rule-refusals.js";
import {
  requiredSimWafResponseBody,
  simWafResponseHeaders,
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
    statusCode: requiredResponseCode(customResponse.ResponseCode),
    contentType: body?.contentType ?? fallback.contentType,
    body: body?.content ?? fallback.body,
    headers: simWafResponseHeaders(customResponse.ResponseHeaders),
  };
}

/**
 * Read the status a custom response answers with.
 *
 * Real WAFv2 requires one in the 200 to 599 range. Falling back to WAF's own
 * 403 would answer with a status the rule did not ask for.
 */
function requiredResponseCode(responseCode: number | undefined): number {
  if (
    responseCode === undefined ||
    !Number.isSafeInteger(responseCode) ||
    responseCode < 200 ||
    responseCode > 599
  ) {
    throw new SimWafInvalidParameterException(
      `Error reason: A custom response code is a whole number from 200 to ` +
        `599, field: CUSTOM_RESPONSE, parameter: ${String(responseCode)}`,
    );
  }

  return responseCode;
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
