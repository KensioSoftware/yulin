import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimCloudWatchAlarmActions } from "../../alarm/action/sim-cloudwatch-alarm-actions.js";
import type { SimCloudWatchAlarmSchedule } from "../../alarm/sim-cloudwatch-alarm-schedule.js";
import type { SimCloudWatchAlarmStore } from "../../alarm/sim-cloudwatch-alarm-store.js";
import type { SimCloudWatchAuthorizer } from "../authorize/sim-cloudwatch-authorizer.js";

/**
 * What every alarm command works from.
 *
 * The alarm commands all reach the same handful of collaborators, so they take
 * them as one thing rather than each restating the list as a properties
 * interface, five fields and five constructor assignments.
 */
export interface SimCloudWatchAlarmContext {
  readonly alarms: SimCloudWatchAlarmStore;
  readonly schedule: SimCloudWatchAlarmSchedule;
  readonly actions: SimCloudWatchAlarmActions;
  readonly authorizer: SimCloudWatchAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: SimClock;
}
