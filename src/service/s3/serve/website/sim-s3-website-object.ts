import { simS3ObjectResponseHeaders } from "../../object/s3-object-response-headers.js";

/**
 * An Object the static website endpoint is about to serve.
 *
 * The website endpoint reads Objects through the ordinary GetObject command
 * rather than out of Bucket storage, so what it gets back is a stream and a
 * metadata record. This is that, with the stream drained.
 */
export class SimS3WebsiteObject {
  constructor(
    public readonly body: Buffer,
    public readonly metadata: Readonly<Record<string, string>> | undefined,
  ) {}

  /**
   * The headers describing this Object in a website response.
   */
  headers(): Record<string, string> {
    return simS3ObjectResponseHeaders(this.metadata, this.body.length);
  }
}
