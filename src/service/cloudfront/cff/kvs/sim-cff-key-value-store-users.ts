import type { SimCloudFrontFunctionMap } from "../../command/create-function/create-function.handler.js";
import type { SimCloudFrontKeyValueStoreId } from "../../key-value-store/sim-cf-key-value-store.js";
import type { SimCfKeyValueStoreUsers } from "../../key-value-store/sim-cf-key-value-store-users.js";

/**
 * The CloudFront Functions holding a key value store open.
 *
 * CloudFront will not delete a store a Function is still associated with, and
 * the Functions are the only thing here that can be, so this is what the delete
 * command asks. It reads the Function map live rather than keeping its own
 * index, so a Function deleted a moment ago stops holding its store open.
 */
export class SimCffKeyValueStoreUsers implements SimCfKeyValueStoreUsers {
  constructor(private readonly cloudFrontFunctions: SimCloudFrontFunctionMap) {}

  /**
   * The names of the Functions associated with a key value store.
   */
  functionsUsing(storeId: SimCloudFrontKeyValueStoreId): readonly string[] {
    return this.cloudFrontFunctions
      .values()
      .filter((cff) => cff.keyValueStore?.id === storeId)
      .map((cff) => cff.name as string)
      .toArray();
  }
}
