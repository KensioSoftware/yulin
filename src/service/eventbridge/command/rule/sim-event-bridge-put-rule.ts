import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimEventRule } from "../../rule/sim-event-rule.js";
import { SimEventRuleState } from "../../rule/sim-event-rule-state.js";
import type { SimEventRuleStore } from "../../rule/sim-event-rule-store.js";
import type { SimEventBridgeRuleSchedules } from "../../schedule/sim-event-bridge-rule-schedules.js";
import type { SimEventBridgeRequestOptions } from "../sim-event-bridge-request-options.js";
import { refuseUnsimulatedRuleInput } from "./sim-event-bridge-unsimulated-rule-input.js";
import type { SimEventBridgeRuleAccess } from "./sim-event-bridge-rule-access.js";
import { eventBridgeRuleTrigger } from "./sim-event-bridge-rule-trigger.js";
import type {
  SimPutRuleCommand,
  SimPutRuleCommandOutput,
} from "./rule.command.js";

interface SimEventBridgePutRuleProperties {
  readonly rules: SimEventRuleStore;
  readonly access: SimEventBridgeRuleAccess;
  readonly schedules: SimEventBridgeRuleSchedules;
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
 * A rule carrying a `ScheduleExpression` is armed on the simulation's clock as
 * soon as it is created, so a test advancing time past a due instant fires it.
 * Replacing a scheduled rule restarts its schedule, since the rule the old one
 * was counting for is no longer the rule of that name.
 */
export class SimEventBridgePutRule {
  private readonly rules: SimEventRuleStore;
  private readonly access: SimEventBridgeRuleAccess;
  private readonly schedules: SimEventBridgeRuleSchedules;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimEventBridgePutRuleProperties) {
    this.rules = properties.rules;
    this.access = properties.access;
    this.schedules = properties.schedules;
    this.accountRegionScope = properties.accountRegionScope;
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

    const trigger = eventBridgeRuleTrigger(input, requested.busName.value);

    const rule = new SimEventRule({
      name: requested.name,
      busName: requested.busName,
      accountRegionScope: this.accountRegionScope,
      pattern: trigger.pattern,
      schedule: trigger.schedule,
      state: SimEventRuleState.of(input.State),
      description: input.Description,
    });

    this.rules.put(rule);
    this.schedules.arm(rule);

    return { $metadata: {}, RuleArn: rule.arn };
  }
}
