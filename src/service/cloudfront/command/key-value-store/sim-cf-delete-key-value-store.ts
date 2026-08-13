import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimCloudFrontCannotDeleteEntityWhileInUse } from "../../error/sim-cloudfront.error.js";
import type { SimCfKeyValueStoreAccess } from "../../key-value-store/sim-cf-key-value-store-access.js";
import type { SimCloudFrontKeyValueStoreId } from "../../key-value-store/sim-cf-key-value-store.js";
import type { SimCfKeyValueStoreUsers } from "../../key-value-store/sim-cf-key-value-store-users.js";
import type {
  SimDeleteKeyValueStoreCommand,
  SimDeleteKeyValueStoreCommandOutput,
} from "./sim-cf-key-value-store-command.types.js";

/**
 * Simulated CloudFront DeleteKeyValueStore command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/command/DeleteKeyValueStoreCommand/
 */
export class SimCfDeleteKeyValueStore {
  private static readonly action = "cloudfront:DeleteKeyValueStore";

  constructor(
    private readonly access: SimCfKeyValueStoreAccess,
    private readonly users: SimCfKeyValueStoreUsers,
  ) {}

  /**
   * Delete a sim CloudFront key value store.
   */
  async handle(
    command: SimDeleteKeyValueStoreCommand,
    options?: { readonly caller?: SimAwsCaller },
  ): Promise<SimDeleteKeyValueStoreCommandOutput> {
    assertDefined(command.input.Name, "DeleteKeyValueStoreCommand.input.Name");
    assertDefined(
      command.input.IfMatch,
      "DeleteKeyValueStoreCommand.input.IfMatch",
    );

    await this.access.background.sequence();

    const store = this.access.authorizedByName(
      SimCfDeleteKeyValueStore.action,
      command.input.Name,
      options?.caller,
    );

    store.assertResourceETag(command.input.IfMatch);
    this.assertNotInUse(store.id, store.name);

    this.access.stores.remove(store.id);

    return { $metadata: {} };
  }

  /**
   * CloudFront will not delete a store a Function is still associated with.
   */
  private assertNotInUse(
    storeId: SimCloudFrontKeyValueStoreId,
    storeName: string,
  ): void {
    const functions = this.users.functionsUsing(storeId);

    if (functions.length > 0) {
      throw new SimCloudFrontCannotDeleteEntityWhileInUse(
        `Sim CloudFront key value store ${storeName} is still associated with ` +
          `CloudFront Function ${functions.join(", ")}`,
      );
    }
  }
}
