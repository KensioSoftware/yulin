import { SimSchedulerConflictException } from "../../error/sim-scheduler.error.js";
import type { SimSchedulerScheduleGroupStore } from "../../group/sim-scheduler-schedule-group-store.js";
import type { SimSchedulerScheduleStore } from "../../schedule/sim-scheduler-schedule-store.js";
import { SimSchedulerPage } from "../sim-scheduler-page.js";
import type { SimSchedulerRequestOptions } from "../sim-scheduler-request-options.js";
import type { SimSchedulerGroupAccess } from "./sim-scheduler-group-access.js";
import { narrowedScheduleGroups } from "./sim-scheduler-listed-groups.js";
import { refuseUnsimulatedGroupInput } from "./sim-scheduler-unsimulated-group-input.js";
import {
  describedScheduleGroup,
  listedScheduleGroup,
} from "./sim-scheduler-described-group.js";
import type {
  SimCreateScheduleGroupCommand,
  SimCreateScheduleGroupCommandOutput,
  SimDeleteScheduleGroupCommand,
  SimDeleteScheduleGroupCommandOutput,
  SimGetScheduleGroupCommand,
  SimGetScheduleGroupCommandOutput,
  SimListScheduleGroupsCommand,
  SimListScheduleGroupsCommandOutput,
} from "./group.command.js";

interface SimSchedulerGroupCommandsProperties {
  readonly groups: SimSchedulerScheduleGroupStore;
  readonly schedules: SimSchedulerScheduleStore;
  readonly access: SimSchedulerGroupAccess;
}

/**
 * The commands that manage schedule groups.
 *
 * All four in one handler, unlike schedules, where creating and updating are
 * their own. A group is a name. There is no request to read into a resource,
 * and no update at all, since `Name` is the only thing a group has and AWS
 * replaces the group to change it.
 */
export class SimSchedulerGroupCommands {
  private readonly groups: SimSchedulerScheduleGroupStore;
  private readonly schedules: SimSchedulerScheduleStore;
  private readonly access: SimSchedulerGroupAccess;

  constructor(properties: SimSchedulerGroupCommandsProperties) {
    this.groups = properties.groups;
    this.schedules = properties.schedules;
    this.access = properties.access;
  }

  /**
   * Create a schedule group.
   */
  createScheduleGroup(
    command: SimCreateScheduleGroupCommand,
    options?: SimSchedulerRequestOptions,
  ): SimCreateScheduleGroupCommandOutput {
    const input = command.input;

    refuseUnsimulatedGroupInput(input);

    const groupName = this.access.authorized(
      "scheduler:CreateScheduleGroup",
      input.Name,
      options,
    );

    if (this.groups.find(groupName) !== undefined) {
      throw new SimSchedulerConflictException(
        `Schedule group ${groupName} already exists.`,
      );
    }

    return {
      $metadata: {},
      ScheduleGroupArn: this.groups.create(groupName).arn,
    };
  }

  /**
   * Describe a schedule group.
   */
  getScheduleGroup(
    command: SimGetScheduleGroupCommand,
    options?: SimSchedulerRequestOptions,
  ): SimGetScheduleGroupCommandOutput {
    const group = this.access.require(
      "scheduler:GetScheduleGroup",
      command.input.Name,
      options,
    );

    return { $metadata: {}, ...describedScheduleGroup(group) };
  }

  /**
   * Delete a schedule group, and the schedules in it.
   *
   * AWS deletes the schedules with the group rather than refusing a group that
   * still holds some, and leaves the group in a `DELETING` state until they
   * have gone. Here they go in the same call, so nothing is ever seen in that
   * state.
   */
  deleteScheduleGroup(
    command: SimDeleteScheduleGroupCommand,
    options?: SimSchedulerRequestOptions,
  ): SimDeleteScheduleGroupCommandOutput {
    const group = this.access.requireDeletable(
      "scheduler:DeleteScheduleGroup",
      command.input.Name,
      options,
    );

    this.schedules.removeGroup(group.name);
    this.groups.remove(group);

    return { $metadata: {} };
  }

  /**
   * List the schedule groups of this scope, in creation order.
   */
  listScheduleGroups(
    command: SimListScheduleGroupsCommand,
    options?: SimSchedulerRequestOptions,
  ): SimListScheduleGroupsCommandOutput {
    const input = command.input;

    this.access.authorizeListing("scheduler:ListScheduleGroups", options);

    const page = new SimSchedulerPage(
      narrowedScheduleGroups(this.groups.all, input).map(listedScheduleGroup),
      input.MaxResults,
      input.NextToken,
    );

    return {
      $metadata: {},
      ScheduleGroups: page.items,
      NextToken: page.nextToken,
    };
  }
}
