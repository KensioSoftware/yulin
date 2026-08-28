import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { schedulerScheduleGroupArn } from "../../group/sim-scheduler-schedule-group-arn.js";
import type { SimSchedulerScheduleGroup } from "../../group/sim-scheduler-schedule-group.js";
import type { SimSchedulerScheduleGroupStore } from "../../group/sim-scheduler-schedule-group-store.js";
import { SimSchedulerValidationException } from "../../error/sim-scheduler.error.js";
import {
  defaultScheduleGroupName,
  requiredScheduleGroupName,
} from "../../schedule/sim-scheduler-schedule-name.js";
import type { SimSchedulerAuthorizer } from "../authorize/sim-scheduler-authorizer.js";
import type { SimSchedulerRequestOptions } from "../sim-scheduler-request-options.js";

interface SimSchedulerGroupAccessProperties {
  readonly groups: SimSchedulerScheduleGroupStore;
  readonly authorizer: SimSchedulerAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * How a request reaches the schedule group it names.
 *
 * The same shape as `SimSchedulerScheduleAccess`, and for the same reason. The
 * caller is authorized before the group is looked up, and a caller with no
 * permission is refused whether or not the group is there.
 */
export class SimSchedulerGroupAccess {
  private readonly groups: SimSchedulerScheduleGroupStore;
  private readonly authorizer: SimSchedulerAuthorizer;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimSchedulerGroupAccessProperties) {
    this.groups = properties.groups;
    this.authorizer = properties.authorizer;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Read the group name a request names, and authorize the action on it.
   *
   * The group need not exist: `CreateScheduleGroup` authorizes against the ARN
   * the group is about to have.
   */
  authorized(
    action: string,
    name: string | undefined,
    options?: SimSchedulerRequestOptions,
  ): string {
    const groupName = requiredScheduleGroupName(name);

    this.authorizer.authorizeResource(action, this.arnFor(groupName), options);

    return groupName;
  }

  /**
   * Resolve the group a request names, authorizing the action first.
   */
  require(
    action: string,
    name: string | undefined,
    options?: SimSchedulerRequestOptions,
  ): SimSchedulerScheduleGroup {
    return this.groups.require(this.authorized(action, name, options));
  }

  /**
   * Resolve the group a request wants deleted, which `default` is never one
   * of.
   *
   * AWS leaves the answer for the `default` group undocumented, and a
   * simulation that let it go would have no way of getting it back. It comes
   * with the Account rather than being created, and every request naming no
   * group wants it.
   */
  requireDeletable(
    action: string,
    name: string | undefined,
    options?: SimSchedulerRequestOptions,
  ): SimSchedulerScheduleGroup {
    const groupName = this.authorized(action, name, options);

    if (groupName === defaultScheduleGroupName) {
      throw new SimSchedulerValidationException(
        `The ${defaultScheduleGroupName} schedule group comes with the ` +
          `Account and cannot be deleted.`,
      );
    }

    return this.groups.require(groupName);
  }

  /**
   * Let a listing through, which names no group.
   *
   * `ListScheduleGroups` authorizes against every group in the Account rather
   * than against each one it is about to report, and does not filter the
   * listing by what the caller can reach.
   */
  authorizeListing(action: string, options?: SimSchedulerRequestOptions): void {
    this.authorizer.authorizeAnyResource(action, options);
  }

  /**
   * The ARN a group of this name has, or would have.
   */
  private arnFor(groupName: string): string {
    return schedulerScheduleGroupArn(groupName, this.accountRegionScope);
  }
}
