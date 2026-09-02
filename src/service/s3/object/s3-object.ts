import { simS3ObjectETag } from "./s3-object-etag.js";
import type { SimS3ServerSideEncryption } from "./s3-server-side-encryption.js";
import {
  simS3DefaultStorageClass,
  type SimS3StorageClass,
} from "./s3-storage-class.js";
import {
  simS3SystemMetadataOutput,
  simS3UserDefinedMetadata,
  type SimS3SystemMetadataOutput,
} from "./s3-system-metadata-read.js";

/**
 * Simulated S3 object metadata.
 *
 * Held as one map of header names because that is the form every endpoint
 * serving the Object wants it in. A read through the SDK wants the two halves
 * apart, since S3 answers with what it knows about the Object in fields of its
 * own and keeps `Metadata` for what the caller attached.
 */
export class SimS3ObjectMetadata {
  constructor(public readonly values: Record<string, string> = {}) {}

  /**
   * What S3 knows about the Object, as the fields a read hands it back in.
   */
  get system(): SimS3SystemMetadataOutput {
    return simS3SystemMetadataOutput(this.values);
  }

  /**
   * What the caller attached to the Object, under the keys it was given with.
   */
  get userDefined(): Record<string, string> {
    return simS3UserDefinedMetadata(this.values);
  }
}

interface SimS3ObjectProperties {
  readonly key?: string;
  readonly body?: Buffer;
  readonly metadata?: SimS3ObjectMetadata;
  readonly lastModified?: Date;
  /**
   * The ETag S3 gave these bytes, for an Object whose ETag is not the MD5 of
   * them. Only a multipart upload produces one.
   */
  readonly etag?: string;
  /**
   * The storage class the Object is in. An Object nobody asked to store
   * elsewhere is in the default class.
   */
  readonly storageClass?: SimS3StorageClass;
  /**
   * The encryption S3 applied when it stored these bytes, from the write or
   * from the Bucket's default. The bytes are stored as they arrived whatever
   * this says, and it is what a read reports about them.
   */
  readonly serverSideEncryption?: SimS3ServerSideEncryption | undefined;
}

/**
 * Simulated S3 object.
 */
export class SimS3Object {
  public readonly key: string;
  public readonly body: Buffer;
  public readonly metadata: SimS3ObjectMetadata;
  public readonly storageClass: SimS3StorageClass;
  public readonly serverSideEncryption: SimS3ServerSideEncryption | undefined;

  private readonly writtenAt: Date;
  private readonly givenETag: string | undefined;

  constructor(properties: SimS3ObjectProperties = {}) {
    const {
      key = "object.json",
      body = Buffer.alloc(0),
      metadata = new SimS3ObjectMetadata(),
      lastModified = new Date(),
      storageClass = simS3DefaultStorageClass,
    } = properties;

    this.key = key;
    this.body = body;
    this.metadata = metadata;
    this.storageClass = storageClass;
    this.serverSideEncryption = properties.serverSideEncryption;
    this.writtenAt = new Date(lastModified);
    this.givenETag = properties.etag;
  }

  /**
   * The same Object in another storage class, for a lifecycle rule that has
   * transitioned it.
   *
   * The bytes are shared with the Object this came from. A transition moves
   * where S3 keeps an Object and leaves the Object itself alone, so its ETag,
   * its metadata and the instant it was last written all carry over.
   */
  withStorageClass(storageClass: SimS3StorageClass): SimS3Object {
    return new SimS3Object({
      key: this.key,
      body: this.body,
      metadata: this.metadata,
      lastModified: this.writtenAt,
      storageClass,
      serverSideEncryption: this.serverSideEncryption,
      ...(this.givenETag !== undefined && { etag: this.givenETag }),
    });
  }

  /**
   * When S3 last wrote these bytes.
   *
   * The write path passes the simulation's own clock, so a frozen clock dates
   * an Object at the instant it was frozen at, and filesystem-backed storage
   * passes the file's modification time. The default is for an Object made
   * outside either, which has no clock to ask and is being made now.
   *
   * A copy, because a Date is mutable and every read of an Object hands this
   * one out: a caller that adjusted the Date it was given would otherwise
   * change what the Bucket reports from then on.
   */
  get lastModified(): Date {
    return new Date(this.writtenAt);
  }

  /**
   * The ETag S3 identifies this Object's content by.
   *
   * Held as the bare digest rather than the quoted form a response carries,
   * because the two surfaces disagree about the quotes and only one of them can
   * be the stored value. It is computed on each read rather than kept, since a
   * Buffer can be written to in place and an ETag remembered from before that
   * would describe bytes the Bucket no longer holds.
   *
   * An Object uploaded in parts is the exception, and carries the ETag it was
   * given. That form says how many parts the bytes arrived in, which nothing
   * about the joined bytes records, so it cannot be recomputed from them.
   */
  get etag(): string {
    return this.givenETag ?? simS3ObjectETag(this.body);
  }
}
