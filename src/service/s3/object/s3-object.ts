import { simS3ObjectETag } from "./s3-object-etag.js";

/**
 * Simulated S3 object metadata.
 */
export class SimS3ObjectMetadata {
  constructor(public readonly values: Record<string, string> = {}) {}
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
}

/**
 * Simulated S3 object.
 */
export class SimS3Object {
  public readonly key: string;
  public readonly body: Buffer;
  public readonly metadata: SimS3ObjectMetadata;

  private readonly writtenAt: Date;
  private readonly givenETag: string | undefined;

  constructor(properties: SimS3ObjectProperties = {}) {
    const {
      key = "object.json",
      body = Buffer.alloc(0),
      metadata = new SimS3ObjectMetadata(),
      lastModified = new Date(),
    } = properties;

    this.key = key;
    this.body = body;
    this.metadata = metadata;
    this.writtenAt = new Date(lastModified);
    this.givenETag = properties.etag;
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
