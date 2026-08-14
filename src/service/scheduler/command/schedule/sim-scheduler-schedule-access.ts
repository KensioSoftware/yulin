import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { schedulerScheduleArn } from "../../schedule/sim-scheduler-schedule-arn.js";
import {
  requestedScheduleGroupName,
  SimSchedulerScheduleName,
} from "../../schedule/sim-scheduler-schedule-name.js";
import type { SimSchedulerSchedule } from "../../schedule/sim-scheduler-schedule.js";
import type { SimSchedulerScheduleStore } from "../../schedule/sim-scheduler-schedule-store.js";
import type { SimSchedulerAuthorizer } from "../authorize/sim-scheduler-authorizer.js";
import type { SimSchedulerRequestOptions } from "../sim-scheduler-request-options.js";

/**
 * Which schedule a request names, in which group.
 */
export interface SimSchedulerRequestedSchedule {
  readonly name: SimSchedulerScheduleName;
  readonly groupName: string;
}

interface SimSchedulerScheduleAccessProperties {
  readonly schedules: SimSchedulerScheduleStore;
  readonly authorizer: SimSchedulerAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

interface SimSchedulerScheduleRequest {
  readonly Name?: string | undefined;
  readonly GroupName?: string | undefined;
}

/**
 * How a request reaches the schedule it names.
 *
 * The caller is authorized before the schedule is looked up, as everywhere else
 * in the simulation, so a caller with no permission is refused whether or not
 * the schedule is there.
 */
export class SimSchedulerScheduleAccess {
  private readonly schedules: SimSchedulerScheduleStore;
  private readonly authorizer: SimSchedulerAuthorizer;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimSchedulerScheduleAccessProperties) {
    this.schedules = properties.schedules;
    this.authorizer = properties.authorizer;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Read the schedule and group a request names.
   */
  requested(
    request: SimSchedulerScheduleRequest,
  ): SimSchedulerRequestedSchedule {
    return {
      name: SimSchedulerScheduleName.required(request.Name),
      groupName: requestedScheduleGroupName(request.GroupName),
    };
  }

  /**
   * Ensure the caller may perform an action on a schedule, which need not
   * exist.
   */
  authorize(
    action: string,
    requested: SimSchedulerRequestedSchedule,
    options?: SimSchedulerRequestOptions,
  ): void {
    this.authorizer.authorizeSchedule(action, this.arnFor(requested), options);
  }

  /**
   * Resolve the schedule a request names, authorizing the action first.
   */
  require(
    action: string,
    request: SimSchedulerScheduleRequest,
    options?: SimSchedulerRequestOptions,
  ): SimSchedulerSchedule {
    const requested = this.requested(request);

    this.authorize(action, requested, options);

    return this.schedules.require(requested.groupName, requested.name.value);
  }

  /**
   * The group a listing is for, once the caller may list schedules.
   *
   * `ListSchedules` names no schedule, so it authorizes against every schedule
   * in the Account rather than against the group named, and does not filter the
   * listing by what the caller can reach.
   */
  listedGroupName(
    action: string,
    requested: string | undefined,
    options?: SimSchedulerRequestOptions,
  ): string {
    this.authorizer.authorizeAnySchedule(action, options);

    return requestedScheduleGroupName(requested);
  }

  /**
   * The ARN a schedule of this name in this group has, or would have.
   */
  private arnFor(requested: SimSchedulerRequestedSchedule): string {
    return schedulerScheduleArn(
      requested.groupName,
      requested.name.value,
      this.accountRegionScope,
    );
  }
}
