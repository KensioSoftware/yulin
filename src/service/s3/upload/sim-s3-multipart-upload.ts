import { createHash } from "node:crypto";

import type { Brand } from "../../../util/brand.type.js";
import type { SimS3ObjectMetadata } from "../object/s3-object.js";
import type { SimS3ServerSideEncryption } from "../object/s3-server-side-encryption.js";
import {
  simS3DefaultStorageClass,
  type SimS3StorageClass,
} from "../object/s3-storage-class.js";

export type SimS3UploadId = Brand<string, "SimS3UploadId">;

/**
 * One numbered part of a multipart upload, as S3 holds it between the
 * `UploadPart` that stored it and the `CompleteMultipartUpload` that joins it
 * to the rest.
 *
 * The ETag is the MD5 of the part's own bytes, which is both what `UploadPart`
 * answers with and what the completed Object's ETag is computed from.
 */
export class SimS3UploadPart {
  public readonly partNumber: number;
  public readonly body: Buffer;
  public readonly etag: string;
  public readonly lastModified: Date;

  constructor(partNumber: number, body: Buffer, lastModified: Date) {
    this.partNumber = partNumber;
    this.body = body;
    this.etag = createHash("md5").update(body).digest("hex");
    this.lastModified = new Date(lastModified);
  }
}

interface SimS3MultipartUploadProperties {
  readonly uploadId: SimS3UploadId | string;
  readonly key: string;
  readonly metadata: SimS3ObjectMetadata;
  readonly initiated: Date;
  /**
   * Where and how the completed Object will be stored. Real S3 takes both at
   * `CreateMultipartUpload`, alongside the metadata, rather than at completion.
   */
  readonly storageClass?: SimS3StorageClass;
  readonly serverSideEncryption?: SimS3ServerSideEncryption | undefined;
}

/**
 * A simulated S3 multipart upload in progress.
 *
 * S3 keeps the parts of an upload apart from the Bucket's Objects until the
 * upload is completed, which is why an unfinished upload is invisible to a
 * listing and an abandoned one leaves nothing behind. This holds them the same
 * way: a Bucket's Objects and its uploads in progress are separate collections,
 * and only `CompleteMultipartUpload` moves anything between them.
 *
 * The system metadata is taken at `CreateMultipartUpload` rather than at
 * completion, as real S3 takes it, because the request that says what the
 * Object is arrives before any of its bytes do.
 */
export class SimS3MultipartUpload {
  public readonly uploadId: SimS3UploadId;
  public readonly key: string;
  public readonly metadata: SimS3ObjectMetadata;
  public readonly initiated: Date;
  public readonly storageClass: SimS3StorageClass;
  public readonly serverSideEncryption: SimS3ServerSideEncryption | undefined;

  private readonly parts = new Map<number, SimS3UploadPart>();

  constructor(properties: SimS3MultipartUploadProperties) {
    this.uploadId = properties.uploadId as SimS3UploadId;
    this.key = properties.key;
    this.metadata = properties.metadata;
    this.initiated = new Date(properties.initiated);
    this.storageClass = properties.storageClass ?? simS3DefaultStorageClass;
    this.serverSideEncryption = properties.serverSideEncryption;
  }

  /**
   * Store a numbered part, replacing whatever was under that number.
   *
   * Real S3 lets a client re-send a part it is not sure arrived, and the last
   * one to arrive is the one the completed Object is built from.
   */
  putPart(partNumber: number, body: Buffer, at: Date): SimS3UploadPart {
    const part = new SimS3UploadPart(partNumber, body, at);
    this.parts.set(partNumber, part);

    return part;
  }

  /**
   * The part stored under a number, if one has been.
   */
  getPart(partNumber: number): SimS3UploadPart | undefined {
    return this.parts.get(partNumber);
  }

  /**
   * Every part stored so far, in part-number order.
   *
   * The order is the upload's rather than the arrival order kept by the Map,
   * because part numbers are what a completed Object is assembled by and a
   * client is free to send them in any order it likes.
   */
  storedParts(): readonly SimS3UploadPart[] {
    return this.parts
      .values()
      .toArray()
      .toSorted((one, other) => one.partNumber - other.partNumber);
  }
}
