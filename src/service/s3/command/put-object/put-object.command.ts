import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimS3WriteBody } from "../../object/s3-write-body.js";
import type { SimS3ObjectWriteMetadata } from "../../object/s3-write-metadata.js";
import type { SimS3ObjectWriteStorage } from "../../object/s3-write-storage.js";

/**
 * Minimal structural sim S3 PutObject command.
 */
export interface SimPutObjectCommand {
  readonly input: SimPutObjectCommandInput;
}

/**
 * Minimal structural sim S3 PutObject input.
 *
 * The metadata members it carries are the ones every write that describes an
 * Object carries, which is why they are declared once in
 * `SimS3ObjectWriteMetadata` and shared with `CreateMultipartUpload`.
 */
export interface SimPutObjectCommandInput
  extends SimS3ObjectWriteMetadata, SimS3ObjectWriteStorage {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  readonly Body?: SimPutObjectBody;
}

/**
 * Minimal structural sim S3 PutObject output.
 *
 * `ETag` is the quoted MD5 of the body S3 has just stored, which is what a
 * caller keeps to recognise the same content later without reading it back.
 * `VersionId` is the version a Bucket keeping versions gave the write, and is
 * absent on a Bucket without versioning.
 */
export interface SimPutObjectCommandOutput {
  readonly ETag?: string;
  readonly VersionId?: string | undefined;
  /** The encryption S3 stamped on the Object it stored. */
  readonly ServerSideEncryption?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal supported sim S3 PutObject body type.
 */
export type SimPutObjectBody = SimS3WriteBody;
