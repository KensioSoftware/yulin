import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCfKeyValueStoreAccess } from "../../key-value-store/sim-cf-key-value-store-access.js";
import { SimCloudFrontKeyValueStore } from "../../key-value-store/sim-cf-key-value-store.js";
import { simCfKeyValueStoreSummary } from "./sim-cf-key-value-store-summary.js";
import type {
  SimCreateKeyValueStoreCommand,
  SimCreateKeyValueStoreCommandOutput,
} from "./sim-cf-key-value-store-command.types.js";

/**
 * Simulated CloudFront CreateKeyValueStore command.
 *
 * A new store is PROVISIONING when the command returns and becomes READY in
 * the background, which is what CloudFront does: the store exists immediately
 * but is not servable until provisioning finishes.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/command/CreateKeyValueStoreCommand/
 */
export class SimCfCreateKeyValueStore {
  private static readonly action = "cloudfront:CreateKeyValueStore";

  constructor(private readonly access: SimCfKeyValueStoreAccess) {}

  /**
   * Create a sim CloudFront key value store.
   */
  async handle(
    command: SimCreateKeyValueStoreCommand,
    options?: { readonly caller?: SimAwsCaller },
  ): Promise<SimCreateKeyValueStoreCommandOutput> {
    assertDefined(command.input.Name, "CreateKeyValueStoreCommand.input.Name");

    await this.access.background.sequence();

    this.access.authorizeAnyStore(
      SimCfCreateKeyValueStore.action,
      options?.caller,
    );

    const store = new SimCloudFrontKeyValueStore({
      name: command.input.Name,
      comment: command.input.Comment,
      accountId: this.access.accountId,
      lastModifiedTime: this.access.background.now(),
    });

    this.access.stores.add(store);

    // A new store becomes servable asynchronously, as in CloudFront.
    this.access.background.schedule(() => store.ready());

    return {
      $metadata: {},
      KeyValueStore: simCfKeyValueStoreSummary(store),
      ETag: store.eTag,
      Location: `https://cloudfront.amazonaws.com/2020-05-31/key-value-store/${store.id}`,
    };
  }
}
