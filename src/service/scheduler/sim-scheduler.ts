import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimIamInterServiceAuthZ } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simIamInRegion } from "../iam/authorize/sim-iam-region-auth-z.js";
import type * as simSchedulerCommands from "./command/sim-scheduler-command.types.js";
import type { SimSchedulerDeliveryTargets } from "./delivery/sim-scheduler-delivery.js";
import type { SimSchedulerDeliveryFailure } from "./delivery/sim-scheduler-delivery-failures.js";
import { SimSchedulerCommands } from "./command/sim-scheduler-commands.js";
import type { SimSchedulerRequestOptions } from "./command/sim-scheduler-request-options.js";
import { SimSchedulerScheduleStore } from "./schedule/sim-scheduler-schedule-store.js";
import { SimSchedulerCfnResourceFactory } from "./cfn/sim-scheduler-cfn-resource-factory.js";
import { SimSchedulerSdkCommandRouter } from "./sdk/sim-scheduler-sdk-command-router.js";
import { SimSchedulerInspection } from "./sim-scheduler-inspection.js";

interface SimSchedulerProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;

  /**
   * Where this scope's schedules invoke.
   *
   * A SimScheduler built on its own has none, since a function, queue or topic
   * in another simulated service is only reachable through SimAws.
   */
  readonly deliveryTargets?: SimSchedulerDeliveryTargets;
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
  private readonly cfnFactory = new SimSchedulerCfnResourceFactory({
    scheduler: this,
  });

  constructor(properties: SimSchedulerProperties = {}) {
    super();

    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
    } = properties;

    const iam = simIamInRegion(properties.iam, accountRegionScope.regionName);

    this.background = background;
    this.commands = new SimSchedulerCommands({
      schedules: this.scheduleStore,
      iam,
      background,
      deliveryTargets: properties.deliveryTargets,
      accountRegionScope,
    });
  }

  /**
   * Every invocation this scope's schedules could not make.
   *
   * Real Scheduler tells nobody about a failed invocation as it happens, and
   * neither does this. A target that is unexpectedly empty is explained here.
   */
  get deliveryFailures(): readonly SimSchedulerDeliveryFailure[] {
    return this.commands.delivery.deliveryFailures;
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

  /**
   * Get this service's CloudFormation Resource factory.
   */
  cfnResourceFactory(): SimSchedulerCfnResourceFactory {
    return this.cfnFactory;
  }
}
