import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimDeleteParameterCommand,
  SimDeleteParametersCommand,
  SimPutParameterCommand,
} from "../command/parameter/parameter.command.js";
import type {
  SimDescribeParametersCommand,
  SimGetParameterCommand,
  SimGetParametersByPathCommand,
  SimGetParametersCommand,
} from "../command/parameter/query.command.js";
import type { SimSsm } from "../sim-ssm.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated SSM.
 */
export class SimSsmSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simSsm: SimSsm) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "PutParameterCommand",
        async (command, context): Promise<unknown> =>
          await simSsm.putParameter(
            command as SimPutParameterCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetParameterCommand",
        async (command, context): Promise<unknown> =>
          await simSsm.getParameter(
            command as SimGetParameterCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetParametersCommand",
        async (command, context): Promise<unknown> =>
          await simSsm.getParameters(
            command as SimGetParametersCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetParametersByPathCommand",
        async (command, context): Promise<unknown> =>
          await simSsm.getParametersByPath(
            command as SimGetParametersByPathCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteParameterCommand",
        async (command, context): Promise<unknown> =>
          await simSsm.deleteParameter(
            command as SimDeleteParameterCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteParametersCommand",
        async (command, context): Promise<unknown> =>
          await simSsm.deleteParameters(
            command as SimDeleteParametersCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeParametersCommand",
        async (command, context): Promise<unknown> =>
          await simSsm.describeParameters(
            command as SimDescribeParametersCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated SSM can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated SSM supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
