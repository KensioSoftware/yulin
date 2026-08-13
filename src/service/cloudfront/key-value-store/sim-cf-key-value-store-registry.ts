import {
  SimCloudFrontEntityAlreadyExists,
  SimCloudFrontEntityNotFound,
} from "../error/sim-cloudfront.error.js";
import type {
  SimCloudFrontKeyValueStore,
  SimCloudFrontKeyValueStoreId,
  SimCloudFrontKeyValueStoreMap,
} from "./sim-cf-key-value-store.js";

/**
 * The key value stores one simulated CloudFront holds.
 *
 * A store is found three ways, because each API reaches for a different one.
 * The CloudFront client names a store by ID, the data API addresses it by ARN,
 * and the name is what decides whether a new one may be stored.
 */
export class SimCloudFrontKeyValueStoreRegistry {
  private readonly stores: SimCloudFrontKeyValueStoreMap = new Map();

  /**
   * Store a key value store, refusing a name another one already holds as
   * CloudFront refuses it.
   */
  add(store: SimCloudFrontKeyValueStore): void {
    if (this.byName(store.name) !== undefined) {
      throw new SimCloudFrontEntityAlreadyExists(
        `Sim CloudFront key value store ${store.name} already exists`,
      );
    }

    this.stores.set(store.id, store);
  }

  /**
   * Forget a key value store.
   */
  remove(storeId: SimCloudFrontKeyValueStoreId): void {
    this.stores.delete(storeId);
  }

  /**
   * Get a key value store by ID.
   */
  byId(
    storeId: SimCloudFrontKeyValueStoreId | string,
  ): SimCloudFrontKeyValueStore | undefined {
    return this.stores.get(storeId as SimCloudFrontKeyValueStoreId);
  }

  /**
   * Get a key value store by name.
   */
  byName(storeName: string): SimCloudFrontKeyValueStore | undefined {
    return this.stores.values().find((store) => store.name === storeName);
  }

  /**
   * Get a key value store by ARN.
   */
  byArn(storeArn: string): SimCloudFrontKeyValueStore | undefined {
    return this.stores.values().find((store) => store.arn === storeArn);
  }

  /**
   * Get a key value store by ID, refusing one this Account does not hold.
   */
  requireById(
    storeId: SimCloudFrontKeyValueStoreId | string,
  ): SimCloudFrontKeyValueStore {
    const store = this.byId(storeId);

    if (store === undefined) {
      throw new SimCloudFrontEntityNotFound(
        `Sim CloudFront has no key value store with ID ${storeId}`,
      );
    }

    return store;
  }

  /**
   * Get a key value store by name, refusing one this Account does not hold.
   *
   * This is how the CloudFront client reaches a store: Describe, Update and
   * Delete all take the name rather than the ID.
   */
  requireByName(storeName: string): SimCloudFrontKeyValueStore {
    const store = this.byName(storeName);

    if (store === undefined) {
      throw new SimCloudFrontEntityNotFound(
        `Sim CloudFront has no key value store named ${storeName}`,
      );
    }

    return store;
  }

  /**
   * Get a key value store by ARN, refusing one this Account does not hold.
   *
   * This is the data API's way in, so the ARN it was given is quoted back on
   * a miss: a store in another Account and a store that was deleted both
   * arrive here, and the ARN is what tells them apart.
   */
  requireByArn(storeArn: string): SimCloudFrontKeyValueStore {
    const store = this.byArn(storeArn);

    if (store === undefined) {
      throw new SimCloudFrontEntityNotFound(
        `Sim CloudFront has no key value store with ARN ${storeArn}`,
      );
    }

    return store;
  }

  /**
   * Every key value store this Account holds.
   */
  all(): readonly SimCloudFrontKeyValueStore[] {
    return this.stores.values().toArray();
  }
}
