import type { SimS3SystemMetadataDeclaration } from "./s3-system-metadata-declaration.type.js";
import type { SimS3SystemMetadataValues } from "./s3-system-metadata.js";

/**
 * System metadata declared for the Objects under one key prefix.
 */
export interface SimS3KeyPrefixMetadata {
  /**
   * The Object key prefix this applies to, such as `br/`. An empty prefix
   * applies to every Object.
   */
  readonly keyPrefix: string;

  /** What S3 reports about the Objects under that prefix. */
  readonly metadata: SimS3SystemMetadataValues;
}

/**
 * A declaration that describes the Objects under a key prefix.
 *
 * This is the plain form, and the one a mount is written in: a prefix and what
 * to report about everything under it. It is a standing statement rather than a
 * record of what was published, so it answers the same for a file that is there
 * and a file that turns up later.
 */
export class SimS3KeyPrefixDeclaration implements SimS3SystemMetadataDeclaration {
  readonly metadata: SimS3SystemMetadataValues;

  private readonly keyPrefix: string;

  constructor(declared: SimS3KeyPrefixMetadata) {
    this.keyPrefix = declared.keyPrefix;
    this.metadata = declared.metadata;
  }

  /** Whether an Object key is under the declared prefix. */
  describes(objectKey: string): boolean {
    return objectKey.startsWith(this.keyPrefix);
  }

  /** The same question, because a prefix describes what has not arrived yet. */
  wouldDescribe(objectKey: string): boolean {
    return this.describes(objectKey);
  }
}
