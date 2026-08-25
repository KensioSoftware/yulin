import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type * as simAthenaCommands from "../command/sim-athena-command.types.js";
import type { SimAthena } from "../sim-athena.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated Athena.
 */
export class SimAthenaSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simAthena: SimAthena) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateWorkGroupCommand",
        async (command, context): Promise<unknown> =>
          await simAthena.createWorkGroup(
            command as simAthenaCommands.SimCreateWorkGroupCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetWorkGroupCommand",
        async (command, context): Promise<unknown> =>
          await simAthena.getWorkGroup(
            command as simAthenaCommands.SimGetWorkGroupCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "UpdateWorkGroupCommand",
        async (command, context): Promise<unknown> =>
          await simAthena.updateWorkGroup(
            command as simAthenaCommands.SimUpdateWorkGroupCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteWorkGroupCommand",
        async (command, context): Promise<unknown> =>
          await simAthena.deleteWorkGroup(
            command as simAthenaCommands.SimDeleteWorkGroupCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListWorkGroupsCommand",
        async (command, context): Promise<unknown> =>
          await simAthena.listWorkGroups(
            command as simAthenaCommands.SimListWorkGroupsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateNamedQueryCommand",
        async (command, context): Promise<unknown> =>
          await simAthena.createNamedQuery(
            command as simAthenaCommands.SimCreateNamedQueryCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetNamedQueryCommand",
        async (command, context): Promise<unknown> =>
          await simAthena.getNamedQuery(
            command as simAthenaCommands.SimGetNamedQueryCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "BatchGetNamedQueryCommand",
        async (command, context): Promise<unknown> =>
          await simAthena.batchGetNamedQuery(
            command as simAthenaCommands.SimBatchGetNamedQueryCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListNamedQueriesCommand",
        async (command, context): Promise<unknown> =>
          await simAthena.listNamedQueries(
            command as simAthenaCommands.SimListNamedQueriesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteNamedQueryCommand",
        async (command, context): Promise<unknown> =>
          await simAthena.deleteNamedQuery(
            command as simAthenaCommands.SimDeleteNamedQueryCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated Athena handles.
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
