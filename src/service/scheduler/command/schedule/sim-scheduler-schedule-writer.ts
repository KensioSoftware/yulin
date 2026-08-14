import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { schedulerSchedule } from "../../schedule/sim-scheduler-schedule-expression.js";
import { actionAfterCompletionIn } from "../../schedule/sim-scheduler-action-after-completion.js";
import { SimSchedulerSchedule } from "../../schedule/sim-scheduler-schedule.js";
import { SimSchedulerScheduleState } from "../../schedule/sim-scheduler-schedule-state.js";
import { SimSchedulerTarget } from "../../target/sim-scheduler-target.js";
import type { SimSchedulerRequestedSchedule } from "./sim-scheduler-schedule-access.js";
import { refuseUnsimulatedScheduleInput } from "./sim-scheduler-unsimulated-input.js";
import type { SimSchedulerScheduleInput } from "./schedule.command.js";

interface SimSchedulerScheduleWriterProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: SimClock;
}

/**
 * Builds the schedule a Create or an Update request describes.
 *
 * Both commands carry the whole of a schedule, because `UpdateSchedule`
 * replaces rather than merges on real AWS: a request meaning to change only the
 * expression also clears the description if it leaves one out. Reading them in
 * one place is what keeps the two from drifting apart, and is why an update is
 * a newly built schedule rather than a mutation of the stored one.
 */
export class SimSchedulerScheduleWriter {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly clock: SimClock;

  constructor(properties: SimSchedulerScheduleWriterProperties) {
    this.accountRegionScope = properties.accountRegionScope;
    this.clock = properties.clock;
  }

  /**
   * Build a schedule from a request, refusing anything unmodelled first.
   *
   * `createdAt` is the existing schedule's creation date for an update, since
   * replacing a schedule does not create a new one as far as AWS is concerned.
   */
  write(
    input: SimSchedulerScheduleInput,
    requested: SimSchedulerRequestedSchedule,
    createdAt?: Date,
  ): SimSchedulerSchedule {
    refuseUnsimulatedScheduleInput(input);

    const now = this.clock.now();
    const schedule = new SimSchedulerSchedule({
      name: requested.name,
      groupName: requested.groupName,
      accountRegionScope: this.accountRegionScope,
      schedule: schedulerSchedule(input.ScheduleExpression),
      target: SimSchedulerTarget.of(input.Target),
      state: SimSchedulerScheduleState.of(input.State),
      actionAfterCompletion: actionAfterCompletionIn(
        input.ActionAfterCompletion,
      ),
      description: input.Description,
      createdAt: createdAt ?? now,
    });

    schedule.modifiedAt(now);

    return schedule;
  }
}
