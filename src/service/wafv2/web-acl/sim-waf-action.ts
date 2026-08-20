import type { SimWafBlockedResponse } from "../evaluate/sim-waf-blocked-response.js";
import { invalidSimWafRule } from "../statement/sim-waf-rule-refusals.js";
import {
  refuseUnsimulatedSimWafAction,
  simWafBlockedResponse,
} from "./sim-waf-action-input.js";
import type {
  SimWafActionInput,
  SimWafActionKind,
  SimWafHandledActionInput,
} from "./sim-waf-action.type.js";
import { simWafCustomHeaders } from "./sim-waf-custom-response.js";
import type {
  SimWafCustomResponseBodies,
  SimWafHeader,
} from "./sim-waf-custom-response.type.js";

interface SimWafActionProperties {
  readonly kind: SimWafActionKind;
  readonly insertHeaders: readonly SimWafHeader[];
  readonly blocked: SimWafBlockedResponse | undefined;
}

/**
 * One resolved action, ready to apply to a request.
 *
 * `Count` is the odd one: it records that the rule matched and lets evaluation
 * carry on to the next rule, so it is the one action that does not decide
 * anything. `isTerminating` is what the evaluation loop reads.
 */
export class SimWafAction {
  public readonly kind: SimWafActionKind;
  public readonly insertHeaders: readonly SimWafHeader[];
  public readonly blocked: SimWafBlockedResponse | undefined;

  private constructor(properties: SimWafActionProperties) {
    this.kind = properties.kind;
    this.insertHeaders = properties.insertHeaders;
    this.blocked = properties.blocked;
  }

  /**
   * Read the action a rule or a web ACL default named.
   */
  static read(
    action: SimWafActionInput | undefined,
    ruleName: string,
    bodies: SimWafCustomResponseBodies,
  ): SimWafAction {
    refuseUnsimulatedSimWafAction(action, ruleName);

    if (action?.Allow !== undefined) {
      return this.handling("ALLOW", action.Allow);
    }

    if (action?.Count !== undefined) {
      return this.handling("COUNT", action.Count);
    }

    if (action?.Block !== undefined) {
      return new SimWafAction({
        kind: "BLOCK",
        insertHeaders: [],
        blocked: simWafBlockedResponse(action.Block.CustomResponse, bodies),
      });
    }

    invalidSimWafRule(ruleName, "The action names no action to take");
  }

  private static handling(
    kind: SimWafActionKind,
    action: SimWafHandledActionInput,
  ): SimWafAction {
    return new SimWafAction({
      kind,
      insertHeaders: simWafCustomHeaders(
        action.CustomRequestHandling?.InsertHeaders,
      ),
      blocked: undefined,
    });
  }

  /**
   * Whether this action decides the request rather than noting it and moving
   * on.
   */
  get isTerminating(): boolean {
    return this.kind !== "COUNT";
  }
}
