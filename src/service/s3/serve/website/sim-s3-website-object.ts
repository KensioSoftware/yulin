import { simS3ObjectResponseHeaders } from "../../object/s3-object-response-headers.js";

interface SimS3WebsiteObjectProperties {
  readonly body: Buffer;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
  readonly etag?: string | undefined;
  readonly lastModified?: Date | undefined;
}

/**
 * An Object the static website endpoint is about to serve.
 *
 * The website endpoint reads Objects through the ordinary GetObject command
 * rather than out of Bucket storage, so what it gets back is a stream and what
 * S3 remembers about the Object. This is that, with the stream drained.
 */
export class SimS3WebsiteObject {
  public readonly body: Buffer;

  private readonly metadata: Readonly<Record<string, string>> | undefined;
  private readonly etag: string | undefined;
  private readonly lastModified: Date | undefined;

  constructor(properties: SimS3WebsiteObjectProperties) {
    this.body = properties.body;
    this.metadata = properties.metadata;
    this.etag = properties.etag;
    this.lastModified = properties.lastModified;
  }

  /**
   * The headers describing this Object in a website response.
   */
  headers(): Record<string, string> {
    return simS3ObjectResponseHeaders({
      metadata: this.metadata,
      bodyLength: this.body.length,
      etag: this.etag,
      lastModified: this.lastModified,
    });
  }
}
