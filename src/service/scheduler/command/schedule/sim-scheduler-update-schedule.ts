import type { SimSchedulerSchedules } from "../../schedule/sim-scheduler-schedules.js";
import type { SimSchedulerScheduleStore } from "../../schedule/sim-scheduler-schedule-store.js";
import type { SimSchedulerRequestOptions } from "../sim-scheduler-request-options.js";
import type { SimSchedulerScheduleAccess } from "./sim-scheduler-schedule-access.js";
import type { SimSchedulerScheduleWriter } from "./sim-scheduler-schedule-writer.js";
import type {
  SimUpdateScheduleCommand,
  SimUpdateScheduleCommandOutput,
} from "./schedule.command.js";

interface SimSchedulerUpdateScheduleProperties {
  readonly schedules: SimSchedulerScheduleStore;
  readonly access: SimSchedulerScheduleAccess;
  readonly writer: SimSchedulerScheduleWriter;
  readonly firing: SimSchedulerSchedules;
}

/**
 * The UpdateSchedule command.
 *
 * An update is a replacement rather than a merge, which is real behaviour and a
 * common surprise: a request meaning to change only the state also clears the
 * description, and has to carry the expression and target again or be refused
 * for leaving them out.
 *
 * The schedule has to exist, unlike `PutRule` on an EventBridge rule, so
 * updating one that is not there is a not-found rather than a create.
 */
export class SimSchedulerUpdateSchedule {
  private readonly schedules: SimSchedulerScheduleStore;
  private readonly access: SimSchedulerScheduleAccess;
  private readonly writer: SimSchedulerScheduleWriter;
  private readonly firing: SimSchedulerSchedules;

  constructor(properties: SimSchedulerUpdateScheduleProperties) {
    this.schedules = properties.schedules;
    this.access = properties.access;
    this.writer = properties.writer;
    this.firing = properties.firing;
  }

  /**
   * Replace a schedule with what the request describes.
   */
  handle(
    command: SimUpdateScheduleCommand,
    options?: SimSchedulerRequestOptions,
  ): SimUpdateScheduleCommandOutput {
    const input = command.input;
    const existing = this.access.require(
      "scheduler:UpdateSchedule",
      input,
      options,
    );
    const requested = this.access.requested(input);

    // The creation date survives a replacement, because AWS does not consider
    // an updated schedule to be a new one.
    const schedule = this.writer.write(input, requested, existing.creationDate);

    this.schedules.put(schedule);

    // Arming the replacement is what reschedules from the new expression. The
    // schedule it replaced is no longer the one the store holds, so its next
    // firing finds itself out of date and stops.
    this.firing.arm(schedule);

    return { $metadata: {}, ScheduleArn: schedule.arn };
  }
}
