import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type * as simEcsCommands from "../command/sim-ecs-command.types.js";
import type { SimEcs } from "../sim-ecs.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated ECS instance.
 */
export class SimEcsSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simEcs: SimEcs) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateClusterCommand",
        async (command, context): Promise<unknown> =>
          await simEcs.createCluster(
            command as simEcsCommands.SimCreateClusterCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeClustersCommand",
        async (command, context): Promise<unknown> =>
          await simEcs.describeClusters(
            command as simEcsCommands.SimDescribeClustersCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteClusterCommand",
        async (command, context): Promise<unknown> =>
          await simEcs.deleteCluster(
            command as simEcsCommands.SimDeleteClusterCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListClustersCommand",
        async (command, context): Promise<unknown> =>
          await simEcs.listClusters(
            command as simEcsCommands.SimListClustersCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "RegisterTaskDefinitionCommand",
        async (command, context): Promise<unknown> =>
          await simEcs.registerTaskDefinition(
            command as simEcsCommands.SimRegisterTaskDefinitionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeregisterTaskDefinitionCommand",
        async (command, context): Promise<unknown> =>
          await simEcs.deregisterTaskDefinition(
            command as simEcsCommands.SimDeregisterTaskDefinitionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeTaskDefinitionCommand",
        async (command, context): Promise<unknown> =>
          await simEcs.describeTaskDefinition(
            command as simEcsCommands.SimDescribeTaskDefinitionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListTaskDefinitionsCommand",
        async (command, context): Promise<unknown> =>
          await simEcs.listTaskDefinitions(
            command as simEcsCommands.SimListTaskDefinitionsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListTaskDefinitionFamiliesCommand",
        async (command, context): Promise<unknown> =>
          await simEcs.listTaskDefinitionFamilies(
            command as simEcsCommands.SimListTaskDefinitionFamiliesCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated ECS can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated ECS supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
