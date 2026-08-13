import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { SimCfCreateKeyValueStore } from "../command/key-value-store/sim-cf-create-key-value-store.js";
import { SimCfDeleteKeyValueStore } from "../command/key-value-store/sim-cf-delete-key-value-store.js";
import { SimCfDescribeKeyValueStore } from "../command/key-value-store/sim-cf-describe-key-value-store.js";
import { SimCfListKeyValueStores } from "../command/key-value-store/sim-cf-list-key-value-stores.js";
import { SimCfUpdateKeyValueStore } from "../command/key-value-store/sim-cf-update-key-value-store.js";
import type {
  SimCreateKeyValueStoreCommand,
  SimCreateKeyValueStoreCommandOutput,
  SimDeleteKeyValueStoreCommand,
  SimDeleteKeyValueStoreCommandOutput,
  SimDescribeKeyValueStoreCommand,
  SimDescribeKeyValueStoreCommandOutput,
  SimListKeyValueStoresCommand,
  SimListKeyValueStoresCommandOutput,
  SimUpdateKeyValueStoreCommand,
  SimUpdateKeyValueStoreCommandOutput,
} from "../command/key-value-store/sim-cf-key-value-store-command.types.js";
import type { SimCfKeyValueStoreAccess } from "./sim-cf-key-value-store-access.js";
import type {
  SimCloudFrontKeyValueStore,
  SimCloudFrontKeyValueStoreId,
} from "./sim-cf-key-value-store.js";
import {
  noKeyValueStoreUsers,
  type SimCfKeyValueStoreUsers,
} from "./sim-cf-key-value-store-users.js";

interface KeyValueStoreRequestOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The key value store commands on the CloudFront client.
 *
 * These are the five that own the resource. They are grouped here rather than
 * on SimCloudFrontCommands beside the Distribution and Function commands
 * because they share a collaborator none of those need, and because there are
 * enough of them to be their own thing.
 */
export class SimCfKeyValueStoreCommands {
  private readonly users: SimCfKeyValueStoreUsers;

  constructor(
    private readonly access: SimCfKeyValueStoreAccess,
    users: SimCfKeyValueStoreUsers = noKeyValueStoreUsers,
  ) {
    this.users = users;
  }

  /**
   * Get a key value store by name, for asserting on its state directly.
   */
  byName(storeName: string): SimCloudFrontKeyValueStore | undefined {
    return this.access.stores.byName(storeName);
  }

  /**
   * Get a key value store by ID.
   */
  byId(
    storeId: SimCloudFrontKeyValueStoreId | string,
  ): SimCloudFrontKeyValueStore | undefined {
    return this.access.stores.byId(storeId);
  }

  /**
   * Handle a Create Key Value Store Command from the SDK.
   */
  async createKeyValueStore(
    command: SimCreateKeyValueStoreCommand,
    options?: KeyValueStoreRequestOptions,
  ): Promise<SimCreateKeyValueStoreCommandOutput> {
    return await new SimCfCreateKeyValueStore(this.access).handle(
      command,
      options,
    );
  }

  /**
   * Handle a Describe Key Value Store Command from the SDK.
   */
  async describeKeyValueStore(
    command: SimDescribeKeyValueStoreCommand,
    options?: KeyValueStoreRequestOptions,
  ): Promise<SimDescribeKeyValueStoreCommandOutput> {
    return await new SimCfDescribeKeyValueStore(this.access).handle(
      command,
      options,
    );
  }

  /**
   * Handle a List Key Value Stores Command from the SDK.
   */
  async listKeyValueStores(
    command: SimListKeyValueStoresCommand,
    options?: KeyValueStoreRequestOptions,
  ): Promise<SimListKeyValueStoresCommandOutput> {
    return await new SimCfListKeyValueStores(this.access).handle(
      command,
      options,
    );
  }

  /**
   * Handle an Update Key Value Store Command from the SDK.
   */
  async updateKeyValueStore(
    command: SimUpdateKeyValueStoreCommand,
    options?: KeyValueStoreRequestOptions,
  ): Promise<SimUpdateKeyValueStoreCommandOutput> {
    return await new SimCfUpdateKeyValueStore(this.access).handle(
      command,
      options,
    );
  }

  /**
   * Handle a Delete Key Value Store Command from the SDK.
   */
  async deleteKeyValueStore(
    command: SimDeleteKeyValueStoreCommand,
    options?: KeyValueStoreRequestOptions,
  ): Promise<SimDeleteKeyValueStoreCommandOutput> {
    return await new SimCfDeleteKeyValueStore(this.access, this.users).handle(
      command,
      options,
    );
  }
}
