import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCfKeyValueStoreAccess } from "../../key-value-store/sim-cf-key-value-store-access.js";
import type {
  SimKvsDescribeKeyValueStoreCommand,
  SimKvsDescribeKeyValueStoreCommandOutput,
  SimKvsGetKeyCommand,
  SimKvsGetKeyCommandOutput,
  SimKvsListKeysCommand,
  SimKvsListKeysCommandOutput,
} from "./sim-cf-key-value-store-data-command.types.js";

interface ReadOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that read a key value store without changing it.
 *
 * None of them take an IfMatch, since nothing is being overwritten.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront-keyvaluestore/
 */
export class SimKvsKeyReads {
  private static readonly getAction = "cloudfront-keyvaluestore:GetKey";
  private static readonly listAction = "cloudfront-keyvaluestore:ListKeys";
  private static readonly describeAction =
    "cloudfront-keyvaluestore:DescribeKeyValueStore";

  constructor(private readonly access: SimCfKeyValueStoreAccess) {}

  /**
   * Read one key, refusing one the store does not hold.
   */
  async getKey(
    command: SimKvsGetKeyCommand,
    options?: ReadOptions,
  ): Promise<SimKvsGetKeyCommandOutput> {
    assertDefined(command.input.KvsARN, "GetKeyCommand.input.KvsARN");
    assertDefined(command.input.Key, "GetKeyCommand.input.Key");

    await this.access.background.sequence();

    const store = this.access.authorizedByArn(
      SimKvsKeyReads.getAction,
      command.input.KvsARN,
      options?.caller,
    );

    return {
      $metadata: {},
      Key: command.input.Key,
      Value: store.keys.get(command.input.Key),
      ItemCount: store.keys.itemCount,
      TotalSizeInBytes: store.keys.totalSizeInBytes,
    };
  }

  /**
   * List every key and value the store holds.
   */
  async listKeys(
    command: SimKvsListKeysCommand,
    options?: ReadOptions,
  ): Promise<SimKvsListKeysCommandOutput> {
    assertDefined(command.input.KvsARN, "ListKeysCommand.input.KvsARN");

    await this.access.background.sequence();

    const store = this.access.authorizedByArn(
      SimKvsKeyReads.listAction,
      command.input.KvsARN,
      options?.caller,
    );

    return {
      $metadata: {},
      Items: store.listKeys().map((pair) => ({ ...pair })),
    };
  }

  /**
   * Describe the store's data: how much of it there is, and its status.
   *
   * The CloudFront client has a command of this name too, answering with the
   * resource rather than the data.
   */
  async describeKeyValueStore(
    command: SimKvsDescribeKeyValueStoreCommand,
    options?: ReadOptions,
  ): Promise<SimKvsDescribeKeyValueStoreCommandOutput> {
    assertDefined(
      command.input.KvsARN,
      "DescribeKeyValueStoreCommand.input.KvsARN",
    );

    await this.access.background.sequence();

    const store = this.access.authorizedByArn(
      SimKvsKeyReads.describeAction,
      command.input.KvsARN,
      options?.caller,
    );

    return {
      $metadata: {},
      KvsARN: store.arn,
      Created: store.createdTime,
      LastModified: store.lastModifiedTime,
      Status: store.status,
      ItemCount: store.keys.itemCount,
      TotalSizeInBytes: store.keys.totalSizeInBytes,
      ETag: store.dataETag,
    };
  }
}
