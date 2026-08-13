/**
 * Structural types for the key value store commands on the CloudFront client.
 *
 * These are the commands that own the resource. They address a store by name,
 * which is what the CloudFront client takes. The commands that read and write
 * the keys are a separate client addressing a store by ARN, and their types
 * live beside them under `command/key-value-store-data/`.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/
 */

import type { SimArn } from "../../../aws/arn.js";
import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim CloudFront key value store summary.
 */
export interface SimCfKeyValueStoreSummary {
  Id: string;
  Name: string;
  Comment: string | undefined;
  ARN: SimArn;
  Status: string;
  LastModifiedTime: Date;
}

/**
 * Minimal structural sim CloudFront CreateKeyValueStore command.
 */
export interface SimCreateKeyValueStoreCommand {
  readonly input: {
    readonly Name?: string | undefined;
    readonly Comment?: string | undefined;
  };
}

/**
 * Minimal structural sim CloudFront CreateKeyValueStore output.
 */
export interface SimCreateKeyValueStoreCommandOutput {
  readonly $metadata: SimResponseMetadata;
  KeyValueStore: SimCfKeyValueStoreSummary;
  ETag: string;
  Location: string;
}

/**
 * Minimal structural sim CloudFront DescribeKeyValueStore command.
 */
export interface SimDescribeKeyValueStoreCommand {
  readonly input: {
    readonly Name?: string | undefined;
  };
}

/**
 * Minimal structural sim CloudFront DescribeKeyValueStore output.
 */
export interface SimDescribeKeyValueStoreCommandOutput {
  readonly $metadata: SimResponseMetadata;
  KeyValueStore: SimCfKeyValueStoreSummary;
  ETag: string;
}

/**
 * Minimal structural sim CloudFront ListKeyValueStores command.
 */
export interface SimListKeyValueStoresCommand {
  readonly input: {
    readonly Status?: string | undefined;
  };
}

/**
 * Minimal structural sim CloudFront ListKeyValueStores output.
 */
export interface SimListKeyValueStoresCommandOutput {
  readonly $metadata: SimResponseMetadata;
  KeyValueStoreList: {
    Quantity: number;
    Items: SimCfKeyValueStoreSummary[];
  };
}

/**
 * Minimal structural sim CloudFront UpdateKeyValueStore command.
 */
export interface SimUpdateKeyValueStoreCommand {
  readonly input: {
    readonly Name?: string | undefined;
    readonly Comment?: string | undefined;
    readonly IfMatch?: string | undefined;
  };
}

/**
 * Minimal structural sim CloudFront UpdateKeyValueStore output.
 */
export interface SimUpdateKeyValueStoreCommandOutput {
  readonly $metadata: SimResponseMetadata;
  KeyValueStore: SimCfKeyValueStoreSummary;
  ETag: string;
}

/**
 * Minimal structural sim CloudFront DeleteKeyValueStore command.
 */
export interface SimDeleteKeyValueStoreCommand {
  readonly input: {
    readonly Name?: string | undefined;
    readonly IfMatch?: string | undefined;
  };
}

/**
 * Minimal structural sim CloudFront DeleteKeyValueStore output.
 */
export interface SimDeleteKeyValueStoreCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
