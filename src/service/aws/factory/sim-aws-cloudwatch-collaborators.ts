import { SimAwsCloudWatchAlarmTopics } from "../../cloudwatch/alarm/action/sim-aws-cloudwatch-alarm-topics.js";
import type { SimCloudWatchAlarmTargets } from "../../cloudwatch/alarm/action/sim-cloudwatch-alarm-targets.js";
import type { SimAwsAccountRegionScope } from "../sim-aws-account-region-scope.js";
import type { SimAws } from "../sim-aws.js";

/**
 * What simulated CloudWatch reaches for in the rest of the simulation.
 */
interface SimAwsCloudWatchCollaborators {
  readonly alarmTargets: SimCloudWatchAlarmTargets;
}

/**
 * Build the collaborators simulated CloudWatch takes beyond the scoped ones
 * every service gets.
 *
 * An alarm notifies an SNS topic, which real CloudWatch requires to be in the
 * same Account and Region as the alarm, so the scope is passed in for the
 * topic to be checked against. The topic is looked up when the alarm fires
 * rather than now, so that an alarm can name a topic created after it, and so
 * that building CloudWatch never reaches another service as it is built.
 */
export function simAwsCloudWatchCollaborators(
  simAws: SimAws,
  accountRegionScope: SimAwsAccountRegionScope,
): SimAwsCloudWatchCollaborators {
  return {
    alarmTargets: new SimAwsCloudWatchAlarmTopics({
      simAws,
      accountRegionScope,
    }),
  };
}
