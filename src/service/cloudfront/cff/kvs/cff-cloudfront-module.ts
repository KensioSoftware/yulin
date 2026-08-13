import { SimCloudFrontCffKvsUnavailable } from "../../error/sim-cf-key-value-store.error.js";
import type { SimCloudFrontKeyValueStore } from "../../key-value-store/sim-cf-key-value-store.js";
import { CffKvsHandle } from "./cff-kvs-handle.js";

/**
 * What a Function can reach a key value store through.
 *
 * The Function's own association is the only store it can open, so this is
 * given the store the Function was created with, or nothing.
 */
export interface CffCloudFrontModule {
  /**
   * Open the key value store this Function is associated with.
   */
  kvs(kvsId?: string): CffKvsHandle;
}

/**
 * Build the `cloudfront` module a Function sees as `cf`.
 *
 * `cf.kvs()` opens the Function's associated store. An ID may be passed, and it
 * has to be the associated store's: a Function can only reach the one it names
 * in its own configuration, so an ID for any other store is refused rather than
 * opened.
 *
 * A Function with no association has nothing to open, so `cf.kvs()` fails
 * rather than handing back an empty store. An empty store would let a Function
 * that forgot its association run to completion and quietly take every default.
 */
export function cffCloudFrontModule(
  store: SimCloudFrontKeyValueStore | undefined,
): CffCloudFrontModule {
  return {
    kvs: (kvsId?: string): CffKvsHandle => {
      if (store === undefined) {
        throw new SimCloudFrontCffKvsUnavailable(
          "This CloudFront Function is not associated with a key value store, " +
            "so cf.kvs() has nothing to open",
        );
      }

      if (kvsId !== undefined && kvsId !== store.id && kvsId !== store.arn) {
        throw new SimCloudFrontCffKvsUnavailable(
          `This CloudFront Function is associated with key value store ` +
            `${store.id}, so cf.kvs() cannot open ${kvsId}`,
        );
      }

      return new CffKvsHandle(store);
    },
  };
}
