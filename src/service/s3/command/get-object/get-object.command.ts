import type { Readable } from "node:stream";
import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3ObjectLockOutput } from "../../bucket/lock/sim-s3-object-lock-output.js";
import type { SimS3SystemMetadataOutput } from "../../object/s3-system-metadata-read.js";

/**
 * Minimal structural sim S3 GetObject command.
 */
export interface SimGetObjectCommand {
  readonly input: SimGetObjectCommandInput;
}

/**
 * Minimal structural sim S3 GetObject input.
 */
export interface SimGetObjectCommandInput {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  /**
   * The bytes of the Object to read, as an HTTP `Range` header: `bytes=0-499`,
   * `bytes=500-` or `bytes=-500`. A read that states no range reads the whole
   * Object.
   */
  readonly Range?: string | undefined;
  /**
   * The version to read. A request naming none reads the current version, and
   * a Bucket keeping no versions answers the Object under the key.
   */
  readonly VersionId?: string | undefined;
}

/**
 * Minimal structural sim S3 GetObject output.
 *
 * `ETag` is quoted, as real S3 and the SDK give it. `LastModified` is when the
 * Object was written, by the simulation's clock.
 *
 * `ContentLength` describes the body being sent rather than the Object, so a
 * ranged read reports the size of its slice. `ContentRange` says which bytes
 * of the Object those are, and is set only for a read that asked for some of
 * them.
 *
 * The system metadata fields it extends are what S3 was told about the Object
 * when it was written. `Metadata` is what the caller attached to it, and holds
 * nothing else.
 */
export interface SimGetObjectCommandOutput
  extends SimS3SystemMetadataOutput, SimS3ObjectLockOutput {
  readonly Body?: Readable;
  readonly Metadata?: Record<string, string>;
  readonly ETag?: string;
  readonly LastModified?: Date;
  readonly ContentLength?: number;
  readonly ContentRange?: string;
  /** The version read, on a Bucket keeping versions. */
  readonly VersionId?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
