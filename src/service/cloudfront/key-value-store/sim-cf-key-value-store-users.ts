import type { SimCloudFrontKeyValueStoreId } from "./sim-cf-key-value-store.js";

/**
 * What still uses a key value store, which decides whether it can be deleted.
 *
 * CloudFront refuses to delete a store a Function is still associated with, so
 * the delete command has to ask something what is using it. SimCffKeyValueStoreUsers
 * is what answers: it reads the Function map, which is the only thing here that
 * can hold a store open.
 *
 * This stays an interface because the delete command has no business knowing
 * about Functions, and because a standalone SimCloudFront with no Functions
 * has nothing to ask.
 */
export interface SimCfKeyValueStoreUsers {
  /**
   * The names of the CloudFront Functions associated with a key value store.
   */
  functionsUsing(storeId: SimCloudFrontKeyValueStoreId): readonly string[];
}

/**
 * Nothing uses any key value store.
 */
export const noKeyValueStoreUsers: SimCfKeyValueStoreUsers = {
  functionsUsing: (): readonly string[] => [],
};
