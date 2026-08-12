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
}

/**
 * Simulated S3 object.
 */
export class SimS3Object {
  public readonly key: string;
  public readonly body: Buffer;
  public readonly metadata: SimS3ObjectMetadata;

  /**
   * When S3 last wrote these bytes.
   *
   * The write path passes the simulation's own clock, so a frozen clock dates
   * an Object at the instant it was frozen at, and filesystem-backed storage
   * passes the file's modification time. The default here is for an Object made
   * outside either, which has no clock to ask and is being made now.
   */
  public readonly lastModified: Date;

  private cachedETag: string | undefined;

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
    this.lastModified = new Date(lastModified);
  }

  /**
   * The ETag S3 identifies this Object's content by.
   *
   * Held as the bare digest rather than the quoted form a response carries,
   * because the two surfaces disagree about the quotes and only one of them can
   * be the stored value. It is computed on demand and kept, since the bytes it
   * describes cannot change.
   */
  get etag(): string {
    this.cachedETag ??= simS3ObjectETag(this.body);

    return this.cachedETag;
  }
}
