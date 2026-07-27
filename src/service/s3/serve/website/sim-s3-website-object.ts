/**
 * An Object the static website endpoint is about to serve.
 *
 * The website endpoint reads Objects through the ordinary GetObject command
 * rather than out of Bucket storage, so what it gets back is a stream and a
 * metadata record. This is that, collapsed into the two things an HTTP
 * response needs.
 */
export class SimS3WebsiteObject {
  constructor(
    public readonly body: Buffer,
    public readonly contentType: string | undefined,
  ) {}

  /**
   * The headers describing this Object in a website response.
   */
  headers(): Record<string, string> {
    return {
      "content-length": String(this.body.length),
      ...(this.contentType !== undefined && {
        "content-type": this.contentType,
      }),
    };
  }
}
