import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type {
  SimCloudWatchAlarm,
  SimCloudWatchAlarmTransition,
} from "../sim-cloudwatch-alarm.js";
import { simCloudWatchActionsFieldFor } from "../sim-cloudwatch-alarm-state.js";
import { SimCloudWatchAlarmActionFailures } from "./sim-cloudwatch-alarm-action-failures.js";
import {
  simCloudWatchAlarmMessage,
  simCloudWatchAlarmSubject,
} from "./sim-cloudwatch-alarm-notification.js";
import type { SimCloudWatchAlarmTargets } from "./sim-cloudwatch-alarm-targets.js";

interface SimCloudWatchAlarmActionsProperties {
  readonly targets: SimCloudWatchAlarmTargets;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Fires an alarm's actions when it changes state.
 *
 * Only a change fires anything. An alarm that evaluates ten periods and stays
 * in ALARM throughout notifies once, at the transition, which is what real
 * CloudWatch does and what stops a test's queue filling with duplicates.
 */
export class SimCloudWatchAlarmActions {
  readonly failures = new SimCloudWatchAlarmActionFailures();

  readonly #targets: SimCloudWatchAlarmTargets;
  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimCloudWatchAlarmActionsProperties) {
    this.#targets = properties.targets;
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Notify everything the alarm's new state names.
   *
   * A failing action never stops the others, and never stops the alarm: the
   * state has already changed by the time this runs, and real CloudWatch does
   * not roll one back because a topic was missing.
   */
  async fire(
    alarm: SimCloudWatchAlarm,
    transition: SimCloudWatchAlarmTransition,
  ): Promise<void> {
    if (!alarm.definition.actionsEnabled) {
      return;
    }

    const actions =
      alarm.definition[simCloudWatchActionsFieldFor(transition.state)];
    const message = {
      subject: simCloudWatchAlarmSubject({
        alarm,
        transition,
        accountRegionScope: this.#accountRegionScope,
      }),
      message: simCloudWatchAlarmMessage({
        alarm,
        transition,
        accountRegionScope: this.#accountRegionScope,
      }),
    };

    await Promise.all(
      actions.map(async (actionArn) => {
        try {
          await this.#targets.notify({ ...message, topicArn: actionArn });
        } catch (error) {
          this.failures.record({
            alarmName: alarm.name,
            alarmArn: alarm.arn,
            actionArn,
            error,
          });
        }
      }),
    );
  }
}
