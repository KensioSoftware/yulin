import type {
  SimSdkCommandRoute,
  SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type { SimAssumeRoleCommand } from "../command/assume-role/assume-role.cmd.js";
import type { SimSts } from "../sim-sts.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated STS instance.
 */
export class SimStsSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simSts: SimSts) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "AssumeRoleCommand",
        async (command): Promise<unknown> =>
          await simSts.assumeRole(command as SimAssumeRoleCommand),
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
