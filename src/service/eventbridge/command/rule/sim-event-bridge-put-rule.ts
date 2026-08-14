import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimEventBridgeUnsimulatedInputException } from "../../error/sim-event-bridge.error.js";
import { SimEventPattern } from "../../pattern/sim-event-pattern.js";
import { SimEventRule } from "../../rule/sim-event-rule.js";
import { SimEventRuleState } from "../../rule/sim-event-rule-state.js";
import type { SimEventRuleStore } from "../../rule/sim-event-rule-store.js";
import type { SimEventBridgeRequestOptions } from "../sim-event-bridge-request-options.js";
import { refuseUnsimulatedRuleInput } from "./sim-event-bridge-unsimulated-rule-input.js";
import type { SimEventBridgeRuleAccess } from "./sim-event-bridge-rule-access.js";
import type {
  SimPutRuleCommand,
  SimPutRuleCommandInput,
  SimPutRuleCommandOutput,
} from "./rule.command.js";

interface SimEventBridgePutRuleProperties {
  readonly rules: SimEventRuleStore;
  readonly access: SimEventBridgeRuleAccess;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The PutRule command.
 *
 * PutRule creates and updates alike, and an update is a replacement rather
 * than a merge: what the request carries is the whole of the rule, and
 * anything an earlier request set that this one leaves out is gone. That is
 * real behaviour and a common surprise, since a request meaning to change only
 * the state also clears the description.
 *
 * A rule needs an event pattern here. Real EventBridge also takes a schedule
 * expression instead, which is a rule that fires on a timer rather than on an
 * event, and that is not simulated yet.
 */
export class SimEventBridgePutRule {
  private readonly rules: SimEventRuleStore;
  private readonly access: SimEventBridgeRuleAccess;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimEventBridgePutRuleProperties) {
    this.rules = properties.rules;
    this.access = properties.access;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Read the event pattern a rule has to carry here.
   *
   * Real EventBridge takes a rule with a schedule expression and no pattern,
   * which fires on a timer. Nothing here fires on a timer yet, so a rule with
   * neither is refused rather than created as a rule that matches nothing.
   */
  private static patternIn(input: SimPutRuleCommandInput): string {
    if (input.EventPattern === undefined || input.EventPattern === "") {
      throw new SimEventBridgeUnsimulatedInputException(
        "A rule needs an EventPattern. Real EventBridge also takes a rule " +
          "with a ScheduleExpression and no pattern, which fires on a timer " +
          "rather than on an event, and scheduled rules are not simulated.",
      );
    }

    return input.EventPattern;
  }

  /**
   * Create a rule, or replace the rule of that name on that bus.
   */
  handle(
    command: SimPutRuleCommand,
    options?: SimEventBridgeRequestOptions,
  ): SimPutRuleCommandOutput {
    const input = command.input;

    refuseUnsimulatedRuleInput(input);

    const requested = this.access.requested(input);

    this.access.authorize("events:PutRule", requested, options);

    const rule = new SimEventRule({
      name: requested.name,
      busName: requested.busName,
      accountRegionScope: this.accountRegionScope,
      pattern: SimEventPattern.of(SimEventBridgePutRule.patternIn(input)),
      state: SimEventRuleState.of(input.State),
      description: input.Description,
    });

    this.rules.put(rule);

    return { $metadata: {}, RuleArn: rule.arn };
  }
}
