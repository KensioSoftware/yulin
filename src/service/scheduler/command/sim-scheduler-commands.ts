import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimSchedulerDeliveryTargets } from "../delivery/sim-scheduler-delivery.js";
import { SimSchedulerNoDeliveryTargets } from "../delivery/sim-scheduler-no-delivery-targets.js";
import { SimSchedulerTargetDelivery } from "../delivery/sim-scheduler-target-delivery.js";
import type { SimSchedulerScheduleGroupStore } from "../group/sim-scheduler-schedule-group-store.js";
import { SimSchedulerSchedules } from "../schedule/sim-scheduler-schedules.js";
import type { SimSchedulerScheduleStore } from "../schedule/sim-scheduler-schedule-store.js";
import { SimSchedulerAuthorizer } from "./authorize/sim-scheduler-authorizer.js";
import { SimSchedulerGroupAccess } from "./group/sim-scheduler-group-access.js";
import { SimSchedulerGroupCommands } from "./group/sim-scheduler-group-commands.js";
import { SimSchedulerCreateSchedule } from "./schedule/sim-scheduler-create-schedule.js";
import { SimSchedulerScheduleAccess } from "./schedule/sim-scheduler-schedule-access.js";
import { SimSchedulerScheduleCommands } from "./schedule/sim-scheduler-schedule-commands.js";
import { SimSchedulerScheduleWriter } from "./schedule/sim-scheduler-schedule-writer.js";
import { SimSchedulerUpdateSchedule } from "./schedule/sim-scheduler-update-schedule.js";

interface SimSchedulerCommandsProperties {
  readonly schedules: SimSchedulerScheduleStore;
  readonly groups: SimSchedulerScheduleGroupStore;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
  readonly deliveryTargets?: SimSchedulerDeliveryTargets | undefined;
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
  public readonly groups: SimSchedulerGroupCommands;
  public readonly delivery: SimSchedulerTargetDelivery;
  public readonly firing: SimSchedulerSchedules;

  constructor(properties: SimSchedulerCommandsProperties) {
    const { schedules, groups, accountRegionScope, background } = properties;
    const authorizer = new SimSchedulerAuthorizer({ iam: properties.iam });
    const access = new SimSchedulerScheduleAccess({
      schedules,
      groups,
      authorizer,
      accountRegionScope,
    });
    const writer = new SimSchedulerScheduleWriter({
      accountRegionScope,
      clock: background,
    });

    this.delivery = new SimSchedulerTargetDelivery({
      endpoints:
        properties.deliveryTargets ?? new SimSchedulerNoDeliveryTargets(),
      background,
    });
    this.firing = new SimSchedulerSchedules({
      schedules,
      delivery: this.delivery,
      background,
    });

    this.scheduleCreation = new SimSchedulerCreateSchedule({
      schedules,
      access,
      writer,
      firing: this.firing,
    });
    this.scheduleUpdate = new SimSchedulerUpdateSchedule({
      schedules,
      access,
      writer,
      firing: this.firing,
    });
    this.schedules = new SimSchedulerScheduleCommands({ schedules, access });
    this.groups = new SimSchedulerGroupCommands({
      groups,
      schedules,
      access: new SimSchedulerGroupAccess({
        groups,
        authorizer,
        accountRegionScope,
      }),
    });
  }
}
