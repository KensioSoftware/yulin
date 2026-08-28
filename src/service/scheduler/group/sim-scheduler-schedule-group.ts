import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { schedulerScheduleGroupArn } from "./sim-scheduler-schedule-group-arn.js";

/**
 * The state a schedule group is in.
 *
 * Real Scheduler also has `DELETING`, which a group sits in while the schedules
 * it holds are being removed. No group here is ever in it. Deleting a group
 * removes its schedules in the same call, and a group is `ACTIVE` or gone.
 */
const activeState = "ACTIVE";

interface SimSchedulerScheduleGroupProperties {
  readonly name: string;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly createdAt: Date;
}

/**
 * One simulated EventBridge Scheduler schedule group.
 *
 * A group is a namespace and a tagging handle. It carries no settings, and a
 * schedule in it behaves exactly as one in `default` would. What it changes is
 * identity. A schedule's name is unique within its group rather than within the
 * Account, and the group is in the schedule's ARN. Two deployments of the same
 * construct into one Account and Region collide on schedule names unless each
 * one has its own group.
 */
export class SimSchedulerScheduleGroup {
  public readonly name: string;
  public readonly arn: string;
  public readonly creationDate: Date;
  public readonly lastModificationDate: Date;
  public readonly state = activeState;

  constructor(properties: SimSchedulerScheduleGroupProperties) {
    this.name = properties.name;
    this.arn = schedulerScheduleGroupArn(
      properties.name,
      properties.accountRegionScope,
    );
    this.creationDate = properties.createdAt;
    this.lastModificationDate = properties.createdAt;
  }
}
