import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type { SimCreateDistributionCommand } from "../command/create-distribution/create-distribution.cmd.js";
import type { SimCreateFunctionCommand } from "../command/create-function/create-function.cmd.js";
import type { SimGetDistributionCommand } from "../command/get-distribution/get-distribution.cmd.js";
import type { SimCloudFront } from "../sim-cloudfront.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated CloudFront
 * instance.
 */
export class SimCloudFrontSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simCloudFront: SimCloudFront) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateDistributionCommand",
        async (command, context): Promise<unknown> =>
          await simCloudFront.createDistribution(
            command as SimCreateDistributionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateFunctionCommand",
        async (command, context): Promise<unknown> =>
          await simCloudFront.createFunction(
            command as SimCreateFunctionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetDistributionCommand",
        async (command, context): Promise<unknown> =>
          await simCloudFront.getDistribution(
            command as SimGetDistributionCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated CloudFront can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated CloudFront supports
   * it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
