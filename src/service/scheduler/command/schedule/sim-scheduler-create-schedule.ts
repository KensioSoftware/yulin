import { SimSchedulerConflictException } from "../../error/sim-scheduler.error.js";
import type { SimSchedulerSchedules } from "../../schedule/sim-scheduler-schedules.js";
import type { SimSchedulerScheduleStore } from "../../schedule/sim-scheduler-schedule-store.js";
import type { SimSchedulerRequestOptions } from "../sim-scheduler-request-options.js";
import type { SimSchedulerScheduleAccess } from "./sim-scheduler-schedule-access.js";
import type { SimSchedulerScheduleWriter } from "./sim-scheduler-schedule-writer.js";
import type {
  SimCreateScheduleCommand,
  SimCreateScheduleCommandOutput,
} from "./schedule.command.js";

interface SimSchedulerCreateScheduleProperties {
  readonly schedules: SimSchedulerScheduleStore;
  readonly access: SimSchedulerScheduleAccess;
  readonly writer: SimSchedulerScheduleWriter;
  readonly firing: SimSchedulerSchedules;
}

/**
 * The CreateSchedule command.
 *
 * Creating a schedule that already exists is refused with a
 * ConflictException rather than replacing it. That is the difference between
 * this and EventBridge's `PutRule`, which creates and updates alike, and it is
 * worth reproducing: a deployment that runs `CreateSchedule` twice fails on
 * real AWS the second time.
 */
export class SimSchedulerCreateSchedule {
  private readonly schedules: SimSchedulerScheduleStore;
  private readonly access: SimSchedulerScheduleAccess;
  private readonly writer: SimSchedulerScheduleWriter;
  private readonly firing: SimSchedulerSchedules;

  constructor(properties: SimSchedulerCreateScheduleProperties) {
    this.schedules = properties.schedules;
    this.access = properties.access;
    this.writer = properties.writer;
    this.firing = properties.firing;
  }

  /**
   * Create a schedule.
   */
  handle(
    command: SimCreateScheduleCommand,
    options?: SimSchedulerRequestOptions,
  ): SimCreateScheduleCommandOutput {
    const input = command.input;
    const requested = this.access.requested(input);

    this.access.authorize("scheduler:CreateSchedule", requested, options);

    if (
      this.schedules.find(requested.groupName, requested.name.value) !==
      undefined
    ) {
      throw new SimSchedulerConflictException(
        `Schedule ${requested.name.value} already exists in group ` +
          `${requested.groupName}.`,
      );
    }

    const schedule = this.writer.write(input, requested);

    this.schedules.put(schedule);
    this.firing.arm(schedule);

    return { $metadata: {}, ScheduleArn: schedule.arn };
  }
}
