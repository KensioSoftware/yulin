import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimSchedule } from "../../../util/schedule/sim-schedule.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimEventBridgeRouter } from "../routing/sim-event-bridge-router.js";
import type { SimEventRule } from "../rule/sim-event-rule.js";
import type { SimEventRuleStore } from "../rule/sim-event-rule-store.js";
import { simEventBridgeScheduledEvent } from "./sim-event-bridge-scheduled-event.js";

interface SimEventBridgeRuleSchedulesProperties {
  readonly rules: SimEventRuleStore;
  readonly router: SimEventBridgeRouter;
  readonly background: BackgroundScheduler;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * What makes a scheduled rule fire, which is simulated time reaching it.
 *
 * Nothing here runs on the host's clock. A scheduled rule is armed for its next
 * due instant on the simulation's own clock, so it fires when a test advances
 * time past that instant and never otherwise. Advancing an hour with a
 * `rate(1 minute)` rule therefore fires it sixty times, at sixty distinct
 * simulated instants, rather than once at the end: `advanceBy` walks the
 * interval, and each firing arms the next before the walk moves on.
 *
 * A rule is re-armed whether or not it fired, so a rule disabled while time
 * passes picks up from the next due instant when it is enabled again rather
 * than replaying what it missed. A rule that has been deleted, or replaced by a
 * PutRule of the same name, is no longer the rule its store holds, and that is
 * what stops it: there is no timer to cancel, only a firing that finds itself
 * out of date.
 */
export class SimEventBridgeRuleSchedules {
  private readonly rules: SimEventRuleStore;
  private readonly router: SimEventBridgeRouter;
  private readonly background: BackgroundScheduler;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimEventBridgeRuleSchedulesProperties) {
    this.rules = properties.rules;
    this.router = properties.router;
    this.background = properties.background;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Start a rule's schedule, if it has one.
   *
   * A rate runs from the moment the rule was created, as it does on real
   * EventBridge, so a `rate(1 hour)` rule made at half past nine falls due at
   * half past ten rather than on the hour.
   */
  arm(rule: SimEventRule): void {
    if (rule.schedule !== undefined) {
      this.armAfter(rule, rule.schedule, this.background.now());
    }
  }

  /**
   * Wait for the next instant a schedule falls due after an instant.
   *
   * A schedule with nothing left, such as a cron expression whose years have
   * run out, is simply not armed again.
   */
  private armAfter(
    rule: SimEventRule,
    schedule: SimSchedule,
    from: Date,
  ): void {
    const due = schedule.nextAfter(from);

    if (due === undefined) {
      return;
    }

    this.background.scheduleAt(due, () => {
      this.fire(rule, schedule, due);

      return Promise.resolve();
    });
  }

  /**
   * Fire a rule that has fallen due, and arm it for the next time.
   *
   * The next firing is counted from the due instant rather than from the clock,
   * so a schedule keeps its own timing however far a single advance moved time.
   */
  private fire(rule: SimEventRule, schedule: SimSchedule, due: Date): void {
    if (this.rules.find(rule.busName.value, rule.name.value) !== rule) {
      return;
    }

    if (rule.state.isEnabled) {
      this.router.fire(
        rule,
        simEventBridgeScheduledEvent({
          rule,
          at: due,
          accountRegionScope: this.accountRegionScope,
        }),
      );
    }

    this.armAfter(rule, schedule, due);
  }
}
