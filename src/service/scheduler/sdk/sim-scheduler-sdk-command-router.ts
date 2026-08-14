import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimCreateScheduleCommand,
  SimDeleteScheduleCommand,
  SimGetScheduleCommand,
  SimListSchedulesCommand,
  SimUpdateScheduleCommand,
} from "../command/schedule/schedule.command.js";
import type { SimScheduler } from "../sim-scheduler.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated Scheduler.
 */
export class SimSchedulerSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simScheduler: SimScheduler) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateScheduleCommand",
        async (command, context): Promise<unknown> =>
          await simScheduler.createSchedule(
            command as SimCreateScheduleCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "UpdateScheduleCommand",
        async (command, context): Promise<unknown> =>
          await simScheduler.updateSchedule(
            command as SimUpdateScheduleCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetScheduleCommand",
        async (command, context): Promise<unknown> =>
          await simScheduler.getSchedule(
            command as SimGetScheduleCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteScheduleCommand",
        async (command, context): Promise<unknown> =>
          await simScheduler.deleteSchedule(
            command as SimDeleteScheduleCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListSchedulesCommand",
        async (command, context): Promise<unknown> =>
          await simScheduler.listSchedules(
            command as SimListSchedulesCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated Scheduler handles.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Find the route for an intercepted SDK Command, if this service has one.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
