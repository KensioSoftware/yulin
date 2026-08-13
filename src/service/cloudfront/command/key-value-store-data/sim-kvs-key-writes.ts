import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCfKeyValueStoreAccess } from "../../key-value-store/sim-cf-key-value-store-access.js";
import type {
  SimCfKeyValueStoreWriteOutput,
  SimKvsDeleteKeyCommand,
  SimKvsPutKeyCommand,
  SimKvsUpdateKeysCommand,
} from "./sim-cf-key-value-store-data-command.types.js";
import { kvsBatchDeletes, kvsBatchPuts } from "./sim-kvs-batch.js";

interface WriteOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * One write, whichever command asked for it.
 */
interface KeyValueStoreWrite {
  readonly action: string;
  readonly KvsARN?: string | undefined;
  readonly IfMatch?: string | undefined;
  readonly puts: readonly { Key: string; Value: string }[];
  readonly deletes: readonly { Key: string }[];
}

/**
 * The three commands that write keys: PutKey, DeleteKey and UpdateKeys.
 *
 * They are one class because they are the same operation three ways: a batch
 * of puts and deletes against a store, checked against its ETag. PutKey is a
 * batch of one put and DeleteKey a batch of one delete, so each only has to say
 * what its batch is.
 *
 * IfMatch is required on all three, as it is in the real data API, and a stale
 * one is refused rather than accepted. A caller therefore has to read the
 * current ETag before each write, which is what writing against CloudFront
 * involves.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront-keyvaluestore/
 */
export class SimKvsKeyWrites {
  constructor(private readonly access: SimCfKeyValueStoreAccess) {}

  /**
   * Write one key.
   */
  async putKey(
    command: SimKvsPutKeyCommand,
    options?: WriteOptions,
  ): Promise<SimCfKeyValueStoreWriteOutput> {
    assertDefined(command.input.Key, "PutKeyCommand.input.Key");
    assertDefined(command.input.Value, "PutKeyCommand.input.Value");

    return await this.write(
      {
        action: "cloudfront-keyvaluestore:PutKey",
        KvsARN: command.input.KvsARN,
        IfMatch: command.input.IfMatch,
        puts: [{ Key: command.input.Key, Value: command.input.Value }],
        deletes: [],
      },
      options,
    );
  }

  /**
   * Forget one key.
   */
  async deleteKey(
    command: SimKvsDeleteKeyCommand,
    options?: WriteOptions,
  ): Promise<SimCfKeyValueStoreWriteOutput> {
    assertDefined(command.input.Key, "DeleteKeyCommand.input.Key");

    return await this.write(
      {
        action: "cloudfront-keyvaluestore:DeleteKey",
        KvsARN: command.input.KvsARN,
        IfMatch: command.input.IfMatch,
        puts: [],
        deletes: [{ Key: command.input.Key }],
      },
      options,
    );
  }

  /**
   * Apply a batch of puts and deletes together.
   */
  async updateKeys(
    command: SimKvsUpdateKeysCommand,
    options?: WriteOptions,
  ): Promise<SimCfKeyValueStoreWriteOutput> {
    return await this.write(
      {
        action: "cloudfront-keyvaluestore:UpdateKeys",
        KvsARN: command.input.KvsARN,
        IfMatch: command.input.IfMatch,
        puts: kvsBatchPuts(command.input),
        deletes: kvsBatchDeletes(command.input),
      },
      options,
    );
  }

  /**
   * Resolve, authorize, check the ETag, apply the batch and report the size.
   */
  private async write(
    write: KeyValueStoreWrite,
    options: WriteOptions | undefined,
  ): Promise<SimCfKeyValueStoreWriteOutput> {
    assertDefined(write.KvsARN, "key value store write input KvsARN");
    assertDefined(write.IfMatch, "key value store write input IfMatch");

    await this.access.background.sequence();

    const store = this.access.authorizedByArn(
      write.action,
      write.KvsARN,
      options?.caller,
    );

    store.assertDataETag(write.IfMatch);

    store.keys.applyBatch(write.puts, write.deletes);
    store.touchData(this.access.background.now());

    return {
      $metadata: {},
      ItemCount: store.keys.itemCount,
      TotalSizeInBytes: store.keys.totalSizeInBytes,
      ETag: store.dataETag,
    };
  }
}
