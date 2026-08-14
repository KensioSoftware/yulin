import type { SimSchedule } from "../../../util/schedule/sim-schedule.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimEventBusName } from "../bus/sim-event-bus-name.js";
import type { SimEventBridgeEnvelope } from "../event/sim-event-bridge-event.js";
import type { SimEventPattern } from "../pattern/sim-event-pattern.js";
import { eventRuleArn } from "./sim-event-rule-arn.js";
import type { SimEventRuleName } from "./sim-event-rule-name.js";
import type { SimEventRuleState } from "./sim-event-rule-state.js";

interface SimEventRuleProperties {
  readonly name: SimEventRuleName;
  readonly busName: SimEventBusName;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly pattern?: SimEventPattern | undefined;
  readonly schedule?: SimSchedule | undefined;
  readonly state: SimEventRuleState;
  readonly description?: string | undefined;
}

/**
 * One simulated rule on one event bus.
 *
 * A rule is a state and something that triggers it: an event pattern, a
 * schedule, or on real EventBridge both. What it does when it triggers is held
 * apart from it, in the targets of the rule, because a rule with no targets is
 * a rule that triggers and sends the event nowhere, which is a thing real
 * EventBridge lets you have.
 */
export class SimEventRule {
  public readonly name: SimEventRuleName;
  public readonly busName: SimEventBusName;
  public readonly arn: string;
  public readonly pattern: SimEventPattern | undefined;

  /**
   * When this rule fires of its own accord, if it does.
   *
   * A scheduled rule is armed on the simulation's clock rather than the host's,
   * so it fires when a test advances time past a due instant.
   */
  public readonly schedule: SimSchedule | undefined;

  public readonly description: string | undefined;

  private held: SimEventRuleState;

  constructor(properties: SimEventRuleProperties) {
    this.name = properties.name;
    this.busName = properties.busName;
    this.arn = eventRuleArn(
      properties.name.value,
      properties.busName,
      properties.accountRegionScope,
    );
    this.pattern = properties.pattern;
    this.schedule = properties.schedule;
    this.description = properties.description;
    this.held = properties.state;
  }

  /**
   * Whether this rule is currently matching events.
   */
  get state(): SimEventRuleState {
    return this.held;
  }

  /**
   * Turn matching on or off, which EnableRule and DisableRule do.
   */
  setState(state: SimEventRuleState): void {
    this.held = state;
  }

  /**
   * Whether an event on this rule's bus should go to its targets.
   *
   * A disabled rule matches nothing at all, rather than matching and sending
   * nowhere. That is the difference between disabling a rule and removing its
   * targets, and it is why a rule enabled again picks up from the next event
   * rather than replaying what it missed.
   *
   * A rule with only a schedule matches nothing either. It fires on its own
   * timing, and an event put onto its bus has nothing to do with it.
   */
  matches(envelope: SimEventBridgeEnvelope): boolean {
    if (!this.held.isEnabled) {
      return false;
    }

    return this.pattern?.matches(envelope) ?? false;
  }
}
