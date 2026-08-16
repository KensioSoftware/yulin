/**
 * One notification an alarm action sends.
 */
export interface SimCloudWatchAlarmNotification {
  readonly topicArn: string;
  readonly subject: string;
  readonly message: string;
}

/**
 * Where an alarm's actions reach.
 *
 * An alarm holds a topic ARN and nothing else, so what that ARN names is
 * resolved when the alarm fires rather than when it is created: a topic made
 * after the alarm is a topic the alarm can still reach, as it would be in an
 * account.
 */
export interface SimCloudWatchAlarmTargets {
  /**
   * Send one notification, or throw saying why it could not be sent.
   */
  notify(notification: SimCloudWatchAlarmNotification): Promise<void>;
}

/**
 * The targets a simulated CloudWatch built on its own has, which are none.
 *
 * Alarms still evaluate and change state without anything to notify. Firing at
 * nothing is reported as a failure rather than passing quietly, because an
 * alarm whose action reaches nowhere is exactly what a test setting one up is
 * checking against.
 */
export class SimCloudWatchNoAlarmTargets implements SimCloudWatchAlarmTargets {
  /**
   * Refuse every notification, since there is nothing here to notify.
   */
  notify(notification: SimCloudWatchAlarmNotification): Promise<void> {
    return Promise.reject(
      new Error(
        `${notification.topicArn} is not reachable: this simulated CloudWatch ` +
          `was built without the rest of the simulation, so it has no SNS to ` +
          `publish to.`,
      ),
    );
  }
}
