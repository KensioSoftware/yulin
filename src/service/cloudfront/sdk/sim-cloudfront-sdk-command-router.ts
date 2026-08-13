import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type { SimCreateDistributionCommand } from "../command/create-distribution/create-distribution.command.js";
import type { SimCreateFunctionCommand } from "../command/create-function/create-function.command.js";
import type { SimDeleteDistributionCommand } from "../command/delete-distribution/delete-distribution.command.js";
import type { SimDeleteFunctionCommand } from "../command/delete-function/delete-function.command.js";
import type { SimGetDistributionCommand } from "../command/get-distribution/get-distribution.command.js";
import type {
  SimCreateKeyValueStoreCommand,
  SimDeleteKeyValueStoreCommand,
  SimDescribeKeyValueStoreCommand,
  SimListKeyValueStoresCommand,
  SimUpdateKeyValueStoreCommand,
} from "../command/key-value-store/sim-cf-key-value-store-command.types.js";
import type { SimUpdateDistributionCommand } from "../command/update-distribution/update-distribution.command.js";
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
        "DeleteDistributionCommand",
        async (command, context): Promise<unknown> =>
          await simCloudFront.deleteDistribution(
            command as SimDeleteDistributionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteFunctionCommand",
        async (command, context): Promise<unknown> =>
          await simCloudFront.deleteFunction(
            command as SimDeleteFunctionCommand,
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
      [
        "CreateKeyValueStoreCommand",
        async (command, context): Promise<unknown> =>
          await simCloudFront
            .keyValueStores()
            .createKeyValueStore(
              command as SimCreateKeyValueStoreCommand,
              simSdkCallerOptions(context),
            ),
      ],
      [
        "DescribeKeyValueStoreCommand",
        async (command, context): Promise<unknown> =>
          await simCloudFront
            .keyValueStores()
            .describeKeyValueStore(
              command as SimDescribeKeyValueStoreCommand,
              simSdkCallerOptions(context),
            ),
      ],
      [
        "ListKeyValueStoresCommand",
        async (command, context): Promise<unknown> =>
          await simCloudFront
            .keyValueStores()
            .listKeyValueStores(
              command as SimListKeyValueStoresCommand,
              simSdkCallerOptions(context),
            ),
      ],
      [
        "UpdateKeyValueStoreCommand",
        async (command, context): Promise<unknown> =>
          await simCloudFront
            .keyValueStores()
            .updateKeyValueStore(
              command as SimUpdateKeyValueStoreCommand,
              simSdkCallerOptions(context),
            ),
      ],
      [
        "DeleteKeyValueStoreCommand",
        async (command, context): Promise<unknown> =>
          await simCloudFront
            .keyValueStores()
            .deleteKeyValueStore(
              command as SimDeleteKeyValueStoreCommand,
              simSdkCallerOptions(context),
            ),
      ],
      [
        "UpdateDistributionCommand",
        async (command, context): Promise<unknown> =>
          await simCloudFront.updateDistribution(
            command as SimUpdateDistributionCommand,
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
