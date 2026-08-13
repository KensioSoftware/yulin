import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCfKeyValueStoreAccess } from "../../key-value-store/sim-cf-key-value-store-access.js";
import { simCfKeyValueStoreSummary } from "./sim-cf-key-value-store-summary.js";
import type {
  SimListKeyValueStoresCommand,
  SimListKeyValueStoresCommandOutput,
} from "./sim-cf-key-value-store-command.types.js";

/**
 * Simulated CloudFront ListKeyValueStores command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/command/ListKeyValueStoresCommand/
 */
export class SimCfListKeyValueStores {
  private static readonly action = "cloudfront:ListKeyValueStores";

  constructor(private readonly access: SimCfKeyValueStoreAccess) {}

  /**
   * List this Account's sim CloudFront key value stores.
   */
  async handle(
    command: SimListKeyValueStoresCommand,
    options?: { readonly caller?: SimAwsCaller },
  ): Promise<SimListKeyValueStoresCommandOutput> {
    await this.access.background.sequence();

    // Listing is authorized across the Account rather than per store, which is
    // what a policy for this action grants.
    this.access.authorizeAnyStore(
      SimCfListKeyValueStores.action,
      options?.caller,
    );

    const status = command.input.Status;
    const stores = this.access.stores
      .all()
      .filter((store) => status === undefined || store.status === status);

    return {
      $metadata: {},
      KeyValueStoreList: {
        Quantity: stores.length,
        Items: stores.map((store) => simCfKeyValueStoreSummary(store)),
      },
    };
  }
}
