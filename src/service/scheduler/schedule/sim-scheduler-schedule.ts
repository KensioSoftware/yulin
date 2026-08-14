import type { SimSchedule } from "../../../util/schedule/sim-schedule.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimSchedulerTarget } from "../target/sim-scheduler-target.js";
import { schedulerScheduleArn } from "./sim-scheduler-schedule-arn.js";
import type { SimSchedulerScheduleName } from "./sim-scheduler-schedule-name.js";
import type { SimSchedulerScheduleState } from "./sim-scheduler-schedule-state.js";

/**
 * What Scheduler does with a schedule once it has finished invoking its target.
 *
 * `DELETE` is worth knowing about: a one-time schedule left at the default
 * `NONE` stays in the Account after it has fired, counting against the quota
 * and turning up in listings, which surprises people who expected a one-time
 * schedule to clean up after itself.
 */
export type SimSchedulerActionAfterCompletion = "NONE" | "DELETE";

interface SimSchedulerScheduleProperties {
  readonly name: SimSchedulerScheduleName;
  readonly groupName: string;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly schedule: SimSchedule;
  readonly target: SimSchedulerTarget;
  readonly state: SimSchedulerScheduleState;
  readonly actionAfterCompletion: SimSchedulerActionAfterCompletion;
  readonly description?: string | undefined;
  readonly createdAt: Date;
}

/**
 * One simulated EventBridge Scheduler schedule.
 *
 * A schedule is an expression, a target, and a state. Unlike an EventBridge
 * rule it owns its target rather than holding it in a store beside it, because
 * a schedule has exactly one and cannot exist without it: AWS requires
 * `Target` on the request that creates one.
 */
export class SimSchedulerSchedule {
  public readonly name: SimSchedulerScheduleName;
  public readonly groupName: string;
  public readonly arn: string;
  public readonly target: SimSchedulerTarget;
  public readonly actionAfterCompletion: SimSchedulerActionAfterCompletion;
  public readonly description: string | undefined;
  public readonly creationDate: Date;

  /**
   * When this schedule falls due, which is read as simulated time advances.
   */
  public readonly schedule: SimSchedule;

  private readonly held: SimSchedulerScheduleState;
  private modified: Date;

  constructor(properties: SimSchedulerScheduleProperties) {
    this.name = properties.name;
    this.groupName = properties.groupName;
    this.arn = schedulerScheduleArn(
      properties.groupName,
      properties.name.value,
      properties.accountRegionScope,
    );
    this.schedule = properties.schedule;
    this.target = properties.target;
    this.actionAfterCompletion = properties.actionAfterCompletion;
    this.description = properties.description;
    this.creationDate = properties.createdAt;
    this.modified = properties.createdAt;
    this.held = properties.state;
  }

  /**
   * Whether this schedule is currently invoking its target.
   */
  get state(): SimSchedulerScheduleState {
    return this.held;
  }

  /**
   * When this schedule was last changed, which a describe reports.
   */
  get lastModificationDate(): Date {
    return this.modified;
  }

  /**
   * Note that an update changed this schedule.
   *
   * `UpdateSchedule` replaces rather than merges on real AWS, so a changed
   * schedule is a new object in the store rather than this being how a change
   * is applied. This carries the modification stamp onto the replacement.
   */
  modifiedAt(instant: Date): void {
    this.modified = instant;
  }
}
