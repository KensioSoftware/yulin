import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type { SimCreateStackCommand } from "../command/create-stack/create-stack.cmd.js";
import type { SimDescribeStacksCommand } from "../command/describe-stacks/describe-stacks.cmd.js";
import type { SimCloudFormation } from "../sim-cloudformation.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated CloudFormation
 * instance.
 */
export class SimCloudFormationSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simCloudFormation: SimCloudFormation) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateStackCommand",
        async (command, context): Promise<unknown> =>
          await simCloudFormation.createStack(
            command as SimCreateStackCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeStacksCommand",
        async (command, context): Promise<unknown> =>
          await simCloudFormation.describeStacks(
            command as SimDescribeStacksCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated CloudFormation can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated CloudFormation
   * supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
