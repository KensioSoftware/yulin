import { SimWafInvalidParameterException } from "../error/sim-wafv2.error.js";
import { SimWafAction } from "./sim-waf-action.js";
import type { SimWafActionInput } from "./sim-waf-action.type.js";
import type { SimWafCustomResponseBodies } from "./sim-waf-custom-response.type.js";
import type { SimWafRuleInput } from "./sim-waf-rule.type.js";

/**
 * Everything a web ACL is written with, on creation and on every update.
 */
export interface SimWafWebAclConfiguration {
  readonly defaultAction?: SimWafActionInput | undefined;
  readonly rules?: readonly SimWafRuleInput[] | undefined;
  readonly customResponseBodies?: SimWafCustomResponseBodies | undefined;
  readonly visibilityConfig?: unknown;
  readonly description?: string | undefined;
}

/**
 * Read the action a request no rule claims is given.
 *
 * Only `Allow` and `Block` are valid here on real WAF, and `Count` is the one
 * worth refusing by name: a default action that counted would leave every
 * unmatched request unanswered.
 */
export function readSimWafDefaultAction(
  configuration: SimWafWebAclConfiguration,
): SimWafAction {
  const action = SimWafAction.read(
    configuration.defaultAction,
    "the web ACL default action",
    configuration.customResponseBodies ?? {},
  );

  if (action.kind === "COUNT") {
    throw new SimWafInvalidParameterException(
      "Error reason: A web ACL DefaultAction is Allow or Block, field: " +
        "DEFAULT_ACTION, parameter: Count",
    );
  }

  return action;
}
