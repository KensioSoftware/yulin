import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import { SimKvsKeyReads } from "./command/key-value-store-data/sim-kvs-key-reads.js";
import { SimKvsKeyWrites } from "./command/key-value-store-data/sim-kvs-key-writes.js";
import type {
  SimCfKeyValueStoreWriteOutput,
  SimKvsDeleteKeyCommand,
  SimKvsDescribeKeyValueStoreCommand,
  SimKvsDescribeKeyValueStoreCommandOutput,
  SimKvsGetKeyCommand,
  SimKvsGetKeyCommandOutput,
  SimKvsListKeysCommand,
  SimKvsListKeysCommandOutput,
  SimKvsPutKeyCommand,
  SimKvsUpdateKeysCommand,
} from "./command/key-value-store-data/sim-cf-key-value-store-data-command.types.js";
import type { SimCfKeyValueStoreAccess } from "./key-value-store/sim-cf-key-value-store-access.js";
import { SimCloudFrontKeyValueStoreSdkCommandRouter } from "./sdk/sim-cf-key-value-store-sdk-command-router.js";

/**
 * Options carried by any simulated key value store data request.
 */
export interface SimCfKeyValueStoreRequestOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated CloudFront key value store data API.
 *
 * This is a second API over one simulated CloudFront's stores rather than a
 * service of its own, which is what AWS has too: the stores here are the ones
 * this Account's CloudFront created, and the resource is owned by the
 * CloudFront client while the data is written through this one.
 *
 * It exists separately because the AWS SDK splits it that way. Application code
 * and deploy scripts that populate a store import
 * `@aws-sdk/client-cloudfront-keyvaluestore`, so a test exercising that code
 * needs the same split rather than the writes hanging off `cloudFront()`.
 */
export class SimCloudFrontKeyValueStoreApi {
  private readonly reads: SimKvsKeyReads;
  private readonly writes: SimKvsKeyWrites;
  private readonly sdkRouter = new SimCloudFrontKeyValueStoreSdkCommandRouter(
    this,
  );

  constructor(access: SimCfKeyValueStoreAccess) {
    this.reads = new SimKvsKeyReads(access);
    this.writes = new SimKvsKeyWrites(access);
  }

  /**
   * Handle a DescribeKeyValueStore Command from the key value store SDK.
   */
  async describeKeyValueStore(
    command: SimKvsDescribeKeyValueStoreCommand,
    options?: SimCfKeyValueStoreRequestOptions,
  ): Promise<SimKvsDescribeKeyValueStoreCommandOutput> {
    return await this.reads.describeKeyValueStore(command, options);
  }

  /**
   * Handle a GetKey Command from the SDK.
   */
  async getKey(
    command: SimKvsGetKeyCommand,
    options?: SimCfKeyValueStoreRequestOptions,
  ): Promise<SimKvsGetKeyCommandOutput> {
    return await this.reads.getKey(command, options);
  }

  /**
   * Handle a ListKeys Command from the SDK.
   */
  async listKeys(
    command: SimKvsListKeysCommand,
    options?: SimCfKeyValueStoreRequestOptions,
  ): Promise<SimKvsListKeysCommandOutput> {
    return await this.reads.listKeys(command, options);
  }

  /**
   * Handle a PutKey Command from the SDK.
   */
  async putKey(
    command: SimKvsPutKeyCommand,
    options?: SimCfKeyValueStoreRequestOptions,
  ): Promise<SimCfKeyValueStoreWriteOutput> {
    return await this.writes.putKey(command, options);
  }

  /**
   * Handle a DeleteKey Command from the SDK.
   */
  async deleteKey(
    command: SimKvsDeleteKeyCommand,
    options?: SimCfKeyValueStoreRequestOptions,
  ): Promise<SimCfKeyValueStoreWriteOutput> {
    return await this.writes.deleteKey(command, options);
  }

  /**
   * Handle an UpdateKeys Command from the SDK.
   */
  async updateKeys(
    command: SimKvsUpdateKeysCommand,
    options?: SimCfKeyValueStoreRequestOptions,
  ): Promise<SimCfKeyValueStoreWriteOutput> {
    return await this.writes.updateKeys(command, options);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
