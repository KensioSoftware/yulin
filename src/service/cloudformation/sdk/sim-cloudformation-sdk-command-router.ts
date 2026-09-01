import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type { SimCreateStackCommand } from "../command/create-stack/create-stack.command.js";
import type { SimDeleteStackCommand } from "../command/delete-stack/delete-stack.command.js";
import type { SimDescribeStacksCommand } from "../command/describe-stacks/describe-stacks.command.js";
import type { SimUpdateStackCommand } from "../command/update-stack/update-stack.command.js";
import type { SimCreateChangeSetCommand } from "../command/create-change-set/create-change-set.command.js";
import type { SimDescribeChangeSetCommand } from "../command/describe-change-set/describe-change-set.command.js";
import type { SimExecuteChangeSetCommand } from "../command/execute-change-set/execute-change-set.command.js";
import type { SimDeleteChangeSetCommand } from "../command/delete-change-set/delete-change-set.command.js";
import type { SimListChangeSetsCommand } from "../command/list-change-sets/list-change-sets.command.js";
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
        "DeleteStackCommand",
        async (command, context): Promise<unknown> =>
          await simCloudFormation.deleteStack(
            command as SimDeleteStackCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "UpdateStackCommand",
        async (command, context): Promise<unknown> =>
          await simCloudFormation.updateStack(
            command as SimUpdateStackCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateChangeSetCommand",
        async (command, context): Promise<unknown> =>
          await simCloudFormation.createChangeSet(
            command as SimCreateChangeSetCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeChangeSetCommand",
        async (command, context): Promise<unknown> =>
          await simCloudFormation.describeChangeSet(
            command as SimDescribeChangeSetCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ExecuteChangeSetCommand",
        async (command, context): Promise<unknown> =>
          await simCloudFormation.executeChangeSet(
            command as SimExecuteChangeSetCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteChangeSetCommand",
        async (command, context): Promise<unknown> =>
          await simCloudFormation.deleteChangeSet(
            command as SimDeleteChangeSetCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListChangeSetsCommand",
        async (command, context): Promise<unknown> =>
          await simCloudFormation.listChangeSets(
            command as SimListChangeSetsCommand,
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
