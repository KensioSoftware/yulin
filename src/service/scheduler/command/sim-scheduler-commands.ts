import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimSchedulerScheduleStore } from "../schedule/sim-scheduler-schedule-store.js";
import { SimSchedulerAuthorizer } from "./authorize/sim-scheduler-authorizer.js";
import { SimSchedulerCreateSchedule } from "./schedule/sim-scheduler-create-schedule.js";
import { SimSchedulerScheduleAccess } from "./schedule/sim-scheduler-schedule-access.js";
import { SimSchedulerScheduleCommands } from "./schedule/sim-scheduler-schedule-commands.js";
import { SimSchedulerScheduleWriter } from "./schedule/sim-scheduler-schedule-writer.js";
import { SimSchedulerUpdateSchedule } from "./schedule/sim-scheduler-update-schedule.js";

interface SimSchedulerCommandsProperties {
  readonly schedules: SimSchedulerScheduleStore;
  readonly iam: SimIamInterServiceAuthZ;
  readonly clock: SimClock;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Every command handler one simulated Scheduler scope delegates to.
 *
 * The wiring lives here rather than in the facade so that `SimScheduler` stays
 * what it is meant to be: state and delegation.
 */
export class SimSchedulerCommands {
  public readonly scheduleCreation: SimSchedulerCreateSchedule;
  public readonly scheduleUpdate: SimSchedulerUpdateSchedule;
  public readonly schedules: SimSchedulerScheduleCommands;

  constructor(properties: SimSchedulerCommandsProperties) {
    const { schedules, accountRegionScope } = properties;
    const authorizer = new SimSchedulerAuthorizer({ iam: properties.iam });
    const access = new SimSchedulerScheduleAccess({
      schedules,
      authorizer,
      accountRegionScope,
    });
    const writer = new SimSchedulerScheduleWriter({
      accountRegionScope,
      clock: properties.clock,
    });

    this.scheduleCreation = new SimSchedulerCreateSchedule({
      schedules,
      access,
      writer,
    });
    this.scheduleUpdate = new SimSchedulerUpdateSchedule({
      schedules,
      access,
      writer,
    });
    this.schedules = new SimSchedulerScheduleCommands({ schedules, access });
  }
}
