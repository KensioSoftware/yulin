import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import type * as simSchedulerCommands from "./command/sim-scheduler-command.types.js";
import { SimSchedulerCommands } from "./command/sim-scheduler-commands.js";
import type { SimSchedulerRequestOptions } from "./command/sim-scheduler-request-options.js";
import { SimSchedulerScheduleStore } from "./schedule/sim-scheduler-schedule-store.js";
import { SimSchedulerSdkCommandRouter } from "./sdk/sim-scheduler-sdk-command-router.js";
import { SimSchedulerInspection } from "./sim-scheduler-inspection.js";

interface SimSchedulerProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated EventBridge Scheduler. Handles SDK commands. Emulates AWS
 * behaviour and state.
 *
 * Scheduler is a separate service from EventBridge rather than a corner of it,
 * and this is a separate simulator for the same reasons: its own SDK client,
 * its own ARN shape carrying a schedule group, and its own execution model,
 * where a schedule assumes an IAM role to reach its target instead of relying
 * on a resource policy admitting a service principal.
 *
 * Schedules are scoped to an account and region, as they are on real AWS.
 */
export class SimScheduler extends SimSchedulerInspection {
  protected readonly scheduleStore = new SimSchedulerScheduleStore();
  private readonly commands: SimSchedulerCommands;
  private readonly background: BackgroundScheduler;
  private readonly sdkRouter = new SimSchedulerSdkCommandRouter(this);

  constructor(properties: SimSchedulerProperties = {}) {
    super();

    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.background = background;
    this.commands = new SimSchedulerCommands({
      schedules: this.scheduleStore,
      iam,
      clock: background,
      accountRegionScope,
    });
  }

  /**
   * Handle a CreateSchedule Command from the SDK.
   */
  async createSchedule(
    command: simSchedulerCommands.SimCreateScheduleCommand,
    options?: SimSchedulerRequestOptions,
  ): Promise<simSchedulerCommands.SimCreateScheduleCommandOutput> {
    await this.background.sequence();
    return this.commands.scheduleCreation.handle(command, options);
  }

  /**
   * Handle an UpdateSchedule Command from the SDK.
   */
  async updateSchedule(
    command: simSchedulerCommands.SimUpdateScheduleCommand,
    options?: SimSchedulerRequestOptions,
  ): Promise<simSchedulerCommands.SimUpdateScheduleCommandOutput> {
    await this.background.sequence();
    return this.commands.scheduleUpdate.handle(command, options);
  }

  /**
   * Handle a GetSchedule Command from the SDK.
   */
  async getSchedule(
    command: simSchedulerCommands.SimGetScheduleCommand,
    options?: SimSchedulerRequestOptions,
  ): Promise<simSchedulerCommands.SimGetScheduleCommandOutput> {
    await this.background.sequence();
    return this.commands.schedules.getSchedule(command, options);
  }

  /**
   * Handle a DeleteSchedule Command from the SDK.
   */
  async deleteSchedule(
    command: simSchedulerCommands.SimDeleteScheduleCommand,
    options?: SimSchedulerRequestOptions,
  ): Promise<simSchedulerCommands.SimDeleteScheduleCommandOutput> {
    await this.background.sequence();
    return this.commands.schedules.deleteSchedule(command, options);
  }

  /**
   * Handle a ListSchedules Command from the SDK.
   */
  async listSchedules(
    command: simSchedulerCommands.SimListSchedulesCommand,
    options?: SimSchedulerRequestOptions,
  ): Promise<simSchedulerCommands.SimListSchedulesCommandOutput> {
    await this.background.sequence();
    return this.commands.schedules.listSchedules(command, options);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
