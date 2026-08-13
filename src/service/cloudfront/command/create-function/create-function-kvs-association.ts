import { SimCloudFrontInvalidKeyValueStoreAssociation } from "../../error/sim-cf-key-value-store.error.js";
import { assertConsistentQuantity } from "../sim-cf-list-quantity.js";
import type { SimCloudFrontKeyValueStore } from "../../key-value-store/sim-cf-key-value-store.js";
import type { SimCloudFrontKeyValueStoreRegistry } from "../../key-value-store/sim-cf-key-value-store-registry.js";
import type { SimCreateFunctionCommandInput } from "./create-function.command.js";

type FunctionConfig = SimCreateFunctionCommandInput["FunctionConfig"];

/**
 * Resolve the key value store a new Function is associated with.
 *
 * CloudFront takes at most one association, and only on the 2.0 runtime: 1.0
 * has no `cf` module to reach a store through, so an association on it would
 * deploy and then fail at the edge. Both are refused here rather than being
 * accepted and quietly doing nothing.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/kvs-with-functions-associate.html
 */
export class CreateFunctionKeyValueStoreAssociation {
  constructor(private readonly stores: SimCloudFrontKeyValueStoreRegistry) {}

  /**
   * The store the Function may read, or nothing if it names none.
   */
  resolve(
    functionName: string,
    config: FunctionConfig,
  ): SimCloudFrontKeyValueStore | undefined {
    assertConsistentQuantity(
      "KeyValueStoreAssociations",
      config?.KeyValueStoreAssociations,
    );

    const items = config?.KeyValueStoreAssociations?.Items ?? [];

    if (items.length === 0) {
      return undefined;
    }

    if (items.length > 1) {
      throw new SimCloudFrontInvalidKeyValueStoreAssociation(
        `CloudFront Function ${functionName} associates ` +
          `${String(items.length)} key value stores, and CloudFront takes at ` +
          `most one`,
      );
    }

    if (config?.Runtime === "cloudfront-js-1.0") {
      throw new SimCloudFrontInvalidKeyValueStoreAssociation(
        `CloudFront Function ${functionName} associates a key value store on ` +
          `the cloudfront-js-1.0 runtime, which cannot read one. Use ` +
          `cloudfront-js-2.0.`,
      );
    }

    const storeArn = items[0]?.KeyValueStoreARN;

    if (storeArn === undefined) {
      throw new SimCloudFrontInvalidKeyValueStoreAssociation(
        `CloudFront Function ${functionName} has a key value store ` +
          `association with no KeyValueStoreARN`,
      );
    }

    const store = this.stores.byArn(storeArn);

    if (store === undefined) {
      throw new SimCloudFrontInvalidKeyValueStoreAssociation(
        `CloudFront Function ${functionName} associates key value store ` +
          `${storeArn}, which this Account does not hold`,
      );
    }

    return store;
  }
}
