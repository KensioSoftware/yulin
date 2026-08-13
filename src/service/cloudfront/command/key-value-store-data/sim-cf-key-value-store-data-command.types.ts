/**
 * Structural types for the commands on the key value store data client.
 *
 * These are the commands that read and write the keys. They are a separate AWS
 * SDK client from CloudFront's own, and they address a store by ARN rather
 * than by name. The commands that own the resource live beside them under
 * `command/key-value-store/`.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront-keyvaluestore/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * What every write answers with: the store's new size and ETag.
 */
export interface SimCfKeyValueStoreWriteOutput {
  readonly $metadata: SimResponseMetadata;
  ItemCount: number;
  TotalSizeInBytes: number;
  ETag: string;
}

/**
 * Minimal structural sim key value store DescribeKeyValueStore command.
 */
export interface SimKvsDescribeKeyValueStoreCommand {
  readonly input: {
    readonly KvsARN?: string | undefined;
  };
}

/**
 * Minimal structural sim key value store DescribeKeyValueStore output.
 */
export interface SimKvsDescribeKeyValueStoreCommandOutput {
  readonly $metadata: SimResponseMetadata;
  KvsARN: string;
  Created: Date;
  LastModified: Date;
  Status: string;
  ItemCount: number;
  TotalSizeInBytes: number;
  ETag: string;
}

/**
 * Minimal structural sim key value store GetKey command.
 */
export interface SimKvsGetKeyCommand {
  readonly input: {
    readonly KvsARN?: string | undefined;
    readonly Key?: string | undefined;
  };
}

/**
 * Minimal structural sim key value store GetKey output.
 */
export interface SimKvsGetKeyCommandOutput {
  readonly $metadata: SimResponseMetadata;
  Key: string;
  Value: string;
  ItemCount: number;
  TotalSizeInBytes: number;
}

/**
 * Minimal structural sim key value store PutKey command.
 */
export interface SimKvsPutKeyCommand {
  readonly input: {
    readonly KvsARN?: string | undefined;
    readonly Key?: string | undefined;
    readonly Value?: string | undefined;
    readonly IfMatch?: string | undefined;
  };
}

/**
 * Minimal structural sim key value store DeleteKey command.
 */
export interface SimKvsDeleteKeyCommand {
  readonly input: {
    readonly KvsARN?: string | undefined;
    readonly Key?: string | undefined;
    readonly IfMatch?: string | undefined;
  };
}

/**
 * Minimal structural sim key value store ListKeys command.
 */
export interface SimKvsListKeysCommand {
  readonly input: {
    readonly KvsARN?: string | undefined;
  };
}

/**
 * Minimal structural sim key value store ListKeys output.
 */
export interface SimKvsListKeysCommandOutput {
  readonly $metadata: SimResponseMetadata;
  Items: { Key: string; Value: string }[];
}

/**
 * Minimal structural sim key value store UpdateKeys command.
 */
export interface SimKvsUpdateKeysCommand {
  readonly input: {
    readonly KvsARN?: string | undefined;
    readonly IfMatch?: string | undefined;
    // The SDK types a required member as `string | undefined`, so a batch
    // entry has to be read as possibly missing its key or value even though
    // neither is optional. Both are checked before the batch is applied.
    readonly Puts?:
      | readonly { Key: string | undefined; Value: string | undefined }[]
      | undefined;
    readonly Deletes?: readonly { Key: string | undefined }[] | undefined;
  };
}
