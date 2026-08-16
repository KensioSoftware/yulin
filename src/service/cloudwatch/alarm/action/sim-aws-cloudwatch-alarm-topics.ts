import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import { parseSnsTopicArn } from "../../../sns/topic/sim-sns-topic-arn.js";
import type {
  SimCloudWatchAlarmNotification,
  SimCloudWatchAlarmTargets,
} from "./sim-cloudwatch-alarm-targets.js";

interface SimAwsCloudWatchAlarmTopicsProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The simulated SNS topics an alarm's actions reach.
 *
 * Real CloudWatch requires an alarm's SNS topic to be in the same Account and
 * Region as the alarm, so a topic ARN naming another one reaches nothing here
 * either, and says so rather than passing quietly.
 *
 * The topic is resolved when the alarm fires rather than when it is created,
 * so a topic made after the alarm is one the alarm can still reach.
 */
export class SimAwsCloudWatchAlarmTopics implements SimCloudWatchAlarmTargets {
  readonly #simAws: SimAws;
  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimAwsCloudWatchAlarmTopicsProperties) {
    this.#simAws = properties.simAws;
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Publish one notification to the topic an action names.
   *
   * It goes through the ordinary Publish path so a notification fans out to
   * the topic's subscriptions exactly as an SDK caller's message would, and
   * with no caller, so it arrives as the Account root. Real CloudWatch
   * publishes as a service principal that a same-Account topic's default
   * policy already admits; authorizing here as a principal that policy says
   * nothing about would fail for requests an account takes.
   */
  async notify(notification: SimCloudWatchAlarmNotification): Promise<void> {
    const scope = this.#accountRegionScope;
    const location = parseSnsTopicArn(notification.topicArn);

    if (
      location === undefined ||
      location.regionName !== scope.regionName ||
      location.accountId !== scope.accountId
    ) {
      throw new Error(
        `${notification.topicArn} is not a simulated SNS topic in ` +
          `${scope.accountId} ${scope.regionName}: an alarm can only notify a ` +
          `topic in its own Account and Region.`,
      );
    }

    await this.#simAws
      .accountRegionScope(scope.accountId, scope.regionName)
      .sns()
      .publish({
        input: {
          TopicArn: notification.topicArn,
          Subject: notification.subject,
          Message: notification.message,
        },
      });
  }
}
