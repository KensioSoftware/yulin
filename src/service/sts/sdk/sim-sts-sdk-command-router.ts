import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type { SimAssumeRoleCommand } from "../command/assume-role/assume-role.command.js";
import type { SimGetCallerIdentityCommand } from "../command/get-caller-identity/get-caller-identity.command.js";
import type { SimSts } from "../sim-sts.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated STS instance.
 */
export class SimStsSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simSts: SimSts) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "GetCallerIdentityCommand",
        async (command, context): Promise<unknown> =>
          await simSts.getCallerIdentity(
            command as SimGetCallerIdentityCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "AssumeRoleCommand",
        async (command, context): Promise<unknown> =>
          await simSts.assumeRole(
            command as SimAssumeRoleCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated STS can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated STS supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
