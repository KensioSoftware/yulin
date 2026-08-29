import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simCfAuthorize } from "../sim-cf-authorize.js";
import type { SimCloudFrontKeyValueStore } from "./sim-cf-key-value-store.js";
import type { SimCloudFrontKeyValueStoreRegistry } from "./sim-cf-key-value-store-registry.js";

interface SimCfKeyValueStoreAccessProperties {
  readonly accountId: SimAwsAccountId;
  readonly stores: SimCloudFrontKeyValueStoreRegistry;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

/**
 * What every key value store command needs: the stores, IAM, and the clock.
 *
 * The commands across the two clients all authorize the same way and work on
 * the same registry, so the wiring is here once rather than repeated in each
 * of them. Each command class is then only its own AWS behaviour.
 */
export class SimCfKeyValueStoreAccess {
  public readonly accountId: SimAwsAccountId;
  public readonly stores: SimCloudFrontKeyValueStoreRegistry;
  public readonly background: BackgroundScheduler;

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimCfKeyValueStoreAccessProperties) {
    this.accountId = properties.accountId;
    this.stores = properties.stores;
    this.iam = properties.iam;
    this.background = properties.background;
  }

  /**
   * Ensure the caller may take an action on a key value store ARN.
   */
  authorize(action: string, resource: string, caller?: SimAwsCaller): void {
    simCfAuthorize({ iam: this.iam, action, resource, caller });
  }

  /**
   * Ensure the caller may take an action on any key value store.
   *
   * CreateKeyValueStore has no store to name yet, and a command naming a store
   * that does not exist has no ARN to authorize against either, so both go
   * through the wildcard. A policy granting these actions has to use one too.
   */
  authorizeAnyStore(action: string, caller?: SimAwsCaller): void {
    this.authorize(
      action,
      `arn:aws:cloudfront::${this.accountId}:key-value-store/*`,
      caller,
    );
  }

  /**
   * Resolve a store by name, having authorized the action against it.
   *
   * The ARN carries the store's ID rather than its name, so the store has to be
   * found before the action can be authorized on it. A name that resolves to
   * nothing is authorized against the wildcard first, so a caller without
   * permission is refused either way rather than learning which names exist.
   */
  authorizedByName(
    action: string,
    storeName: string,
    caller?: SimAwsCaller,
  ): SimCloudFrontKeyValueStore {
    const store = this.stores.byName(storeName);

    if (store === undefined) {
      this.authorizeAnyStore(action, caller);

      return this.stores.requireByName(storeName);
    }

    this.authorize(action, store.arn, caller);

    return store;
  }

  /**
   * Resolve a store by ARN, having authorized the action against it.
   *
   * This is the data API's way in. The ARN it was given is the resource the
   * action is authorized on whether or not it resolves, so an unknown ARN is
   * authorized before it is refused.
   */
  authorizedByArn(
    action: string,
    storeArn: string,
    caller?: SimAwsCaller,
  ): SimCloudFrontKeyValueStore {
    this.authorize(action, storeArn, caller);

    return this.stores.requireByArn(storeArn);
  }
}
