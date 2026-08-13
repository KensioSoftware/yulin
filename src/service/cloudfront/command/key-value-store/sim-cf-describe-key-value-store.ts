import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCfKeyValueStoreAccess } from "../../key-value-store/sim-cf-key-value-store-access.js";
import { simCfKeyValueStoreSummary } from "./sim-cf-key-value-store-summary.js";
import type {
  SimDescribeKeyValueStoreCommand,
  SimDescribeKeyValueStoreCommandOutput,
} from "./sim-cf-key-value-store-command.types.js";

/**
 * Simulated CloudFront DescribeKeyValueStore command.
 *
 * This is the CloudFront client's describe, which answers with the resource
 * and its ETag. The key value store client has a command of the same name that
 * answers with the data instead: item count, size and status.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/command/DescribeKeyValueStoreCommand/
 */
export class SimCfDescribeKeyValueStore {
  private static readonly action = "cloudfront:DescribeKeyValueStore";

  constructor(private readonly access: SimCfKeyValueStoreAccess) {}

  /**
   * Describe a sim CloudFront key value store.
   */
  async handle(
    command: SimDescribeKeyValueStoreCommand,
    options?: { readonly caller?: SimAwsCaller },
  ): Promise<SimDescribeKeyValueStoreCommandOutput> {
    assertDefined(
      command.input.Name,
      "DescribeKeyValueStoreCommand.input.Name",
    );

    await this.access.background.sequence();

    const store = this.access.authorizedByName(
      SimCfDescribeKeyValueStore.action,
      command.input.Name,
      options?.caller,
    );

    return {
      $metadata: {},
      KeyValueStore: simCfKeyValueStoreSummary(store),
      ETag: store.resourceETag,
    };
  }
}
