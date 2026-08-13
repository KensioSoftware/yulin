import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimKvsDeleteKeyCommand,
  SimKvsDescribeKeyValueStoreCommand,
  SimKvsGetKeyCommand,
  SimKvsListKeysCommand,
  SimKvsPutKeyCommand,
  SimKvsUpdateKeysCommand,
} from "../command/key-value-store-data/sim-cf-key-value-store-data-command.types.js";
import type { SimCloudFrontKeyValueStoreApi } from "../sim-cloudfront-key-value-store.js";

/**
 * Routes intercepted key value store SDK Commands to one scoped simulated
 * CloudFront's stores.
 *
 * DescribeKeyValueStore is a command name both this client and the CloudFront
 * client have, answering with different things. They do not collide because
 * interception resolves the router by the client's AWS service first, and only
 * then looks up the command name.
 */
export class SimCloudFrontKeyValueStoreSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(keyValueStore: SimCloudFrontKeyValueStoreApi) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "DescribeKeyValueStoreCommand",
        async (command, context): Promise<unknown> =>
          await keyValueStore.describeKeyValueStore(
            command as SimKvsDescribeKeyValueStoreCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetKeyCommand",
        async (command, context): Promise<unknown> =>
          await keyValueStore.getKey(
            command as SimKvsGetKeyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListKeysCommand",
        async (command, context): Promise<unknown> =>
          await keyValueStore.listKeys(
            command as SimKvsListKeysCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutKeyCommand",
        async (command, context): Promise<unknown> =>
          await keyValueStore.putKey(
            command as SimKvsPutKeyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteKeyCommand",
        async (command, context): Promise<unknown> =>
          await keyValueStore.deleteKey(
            command as SimKvsDeleteKeyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "UpdateKeysCommand",
        async (command, context): Promise<unknown> =>
          await keyValueStore.updateKeys(
            command as SimKvsUpdateKeysCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names the simulated key value store data API can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if the data API supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
