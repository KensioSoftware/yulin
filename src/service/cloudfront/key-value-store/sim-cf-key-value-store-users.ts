import type { SimCloudFrontKeyValueStoreId } from "./sim-cf-key-value-store.js";

/**
 * What still uses a key value store, which decides whether it can be deleted.
 *
 * CloudFront refuses to delete a store a Function is still associated with, so
 * the delete command has to ask something what is using it. That something is
 * the Function map, and a Function cannot be associated with a store yet: the
 * association arrives with the runtime read path. Until then the answer is
 * always nothing, and the guard is here so that wiring the real one in is a
 * change of collaborator rather than a change to the delete command.
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
