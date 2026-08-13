import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCfKeyValueStoreAccess } from "../../key-value-store/sim-cf-key-value-store-access.js";
import { simCfKeyValueStoreSummary } from "./sim-cf-key-value-store-summary.js";
import type {
  SimUpdateKeyValueStoreCommand,
  SimUpdateKeyValueStoreCommandOutput,
} from "./sim-cf-key-value-store-command.types.js";

/**
 * Simulated CloudFront UpdateKeyValueStore command.
 *
 * Only the comment can be changed. The name identifies the store in this API,
 * so it is what the command looks the store up by rather than something the
 * command can set.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/command/UpdateKeyValueStoreCommand/
 */
export class SimCfUpdateKeyValueStore {
  private static readonly action = "cloudfront:UpdateKeyValueStore";

  constructor(private readonly access: SimCfKeyValueStoreAccess) {}

  /**
   * Update a sim CloudFront key value store's comment.
   */
  async handle(
    command: SimUpdateKeyValueStoreCommand,
    options?: { readonly caller?: SimAwsCaller },
  ): Promise<SimUpdateKeyValueStoreCommandOutput> {
    assertDefined(command.input.Name, "UpdateKeyValueStoreCommand.input.Name");
    assertDefined(
      command.input.IfMatch,
      "UpdateKeyValueStoreCommand.input.IfMatch",
    );

    await this.access.background.sequence();

    const store = this.access.authorizedByName(
      SimCfUpdateKeyValueStore.action,
      command.input.Name,
      options?.caller,
    );

    store.assertResourceETag(command.input.IfMatch);
    store.update({ comment: command.input.Comment });

    return {
      $metadata: {},
      KeyValueStore: simCfKeyValueStoreSummary(store),
      ETag: store.resourceETag,
    };
  }
}
