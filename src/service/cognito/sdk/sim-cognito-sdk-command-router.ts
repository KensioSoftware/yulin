import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimCreateUserPoolClientCommand,
  SimDeleteUserPoolClientCommand,
  SimDescribeUserPoolClientCommand,
} from "../command/client/user-pool-client.command.js";
import type { SimListUserPoolClientsCommand } from "../command/client/list-user-pool-clients.command.js";
import type { SimListUserPoolsCommand } from "../command/user-pool/list-user-pools.command.js";
import type {
  SimCreateUserPoolCommand,
  SimDeleteUserPoolCommand,
  SimDescribeUserPoolCommand,
} from "../command/user-pool/user-pool.command.js";
import type { SimCognitoIdentityProvider } from "../sim-cognito-identity-provider.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated Cognito.
 */
export class SimCognitoSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simCognito: SimCognitoIdentityProvider) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateUserPoolCommand",
        async (command, context): Promise<unknown> =>
          await simCognito.createUserPool(
            command as SimCreateUserPoolCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeUserPoolCommand",
        async (command, context): Promise<unknown> =>
          await simCognito.describeUserPool(
            command as SimDescribeUserPoolCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteUserPoolCommand",
        async (command, context): Promise<unknown> =>
          await simCognito.deleteUserPool(
            command as SimDeleteUserPoolCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListUserPoolsCommand",
        async (command, context): Promise<unknown> =>
          await simCognito.listUserPools(
            command as SimListUserPoolsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateUserPoolClientCommand",
        async (command, context): Promise<unknown> =>
          await simCognito.createUserPoolClient(
            command as SimCreateUserPoolClientCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeUserPoolClientCommand",
        async (command, context): Promise<unknown> =>
          await simCognito.describeUserPoolClient(
            command as SimDescribeUserPoolClientCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteUserPoolClientCommand",
        async (command, context): Promise<unknown> =>
          await simCognito.deleteUserPoolClient(
            command as SimDeleteUserPoolClientCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListUserPoolClientsCommand",
        async (command, context): Promise<unknown> =>
          await simCognito.listUserPoolClients(
            command as SimListUserPoolClientsCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated Cognito can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated Cognito supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
