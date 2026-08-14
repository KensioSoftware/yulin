import type { SimSchedulerScheduleStore } from "../../schedule/sim-scheduler-schedule-store.js";
import { SimSchedulerPage } from "../sim-scheduler-page.js";
import type { SimSchedulerRequestOptions } from "../sim-scheduler-request-options.js";
import {
  describedSchedule,
  listedSchedule,
} from "./sim-scheduler-described-schedule.js";
import type { SimSchedulerScheduleAccess } from "./sim-scheduler-schedule-access.js";
import { narrowedSchedules } from "./sim-scheduler-listed-schedules.js";
import type {
  SimDeleteScheduleCommand,
  SimDeleteScheduleCommandOutput,
  SimGetScheduleCommand,
  SimGetScheduleCommandOutput,
  SimListSchedulesCommand,
  SimListSchedulesCommandOutput,
} from "./schedule.command.js";

interface SimSchedulerScheduleCommandsProperties {
  readonly schedules: SimSchedulerScheduleStore;
  readonly access: SimSchedulerScheduleAccess;
}

/**
 * The commands that read and delete schedules.
 *
 * Creating and updating are their own handlers, since those are the two with a
 * whole schedule to read out of the request and a resource to build.
 */
export class SimSchedulerScheduleCommands {
  private readonly schedules: SimSchedulerScheduleStore;
  private readonly access: SimSchedulerScheduleAccess;

  constructor(properties: SimSchedulerScheduleCommandsProperties) {
    this.schedules = properties.schedules;
    this.access = properties.access;
  }

  /**
   * Describe a schedule.
   */
  getSchedule(
    command: SimGetScheduleCommand,
    options?: SimSchedulerRequestOptions,
  ): SimGetScheduleCommandOutput {
    const schedule = this.access.require(
      "scheduler:GetSchedule",
      command.input,
      options,
    );

    return { $metadata: {}, ...describedSchedule(schedule) };
  }

  /**
   * Delete a schedule.
   *
   * Deleting one that is not there is a not-found, unlike EventBridge's
   * `DeleteRule`, which succeeds. AWS documents the error for this one.
   */
  deleteSchedule(
    command: SimDeleteScheduleCommand,
    options?: SimSchedulerRequestOptions,
  ): SimDeleteScheduleCommandOutput {
    const schedule = this.access.require(
      "scheduler:DeleteSchedule",
      command.input,
      options,
    );

    this.schedules.remove(schedule);

    return { $metadata: {} };
  }

  /**
   * List the schedules of one group, in creation order.
   */
  listSchedules(
    command: SimListSchedulesCommand,
    options?: SimSchedulerRequestOptions,
  ): SimListSchedulesCommandOutput {
    const input = command.input;
    const groupName = this.access.listedGroupName(
      "scheduler:ListSchedules",
      input.GroupName,
      options,
    );
    const page = new SimSchedulerPage(
      narrowedSchedules(this.schedules.all, groupName, input).map(
        listedSchedule,
      ),
      input.MaxResults,
      input.NextToken,
    );

    return {
      $metadata: {},
      Schedules: page.items,
      NextToken: page.nextToken,
    };
  }
}
