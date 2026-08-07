import type { SimCloudFrontOriginRequest } from "../sim-cloudfront-request-response.js";

/**
 * The Bucket object key an S3 Origin reads for a request.
 *
 * The Origin path goes in front of the request path, and the result is decoded
 * and tidied into a key: repeated slashes collapse into one, and the leading
 * slash goes, because an S3 object key has neither.
 */
export class SimCfS3OriginObjectKey {
  private readonly originPath: string;

  constructor(originPath: string) {
    this.originPath = originPath;
  }

  /**
   * The object key one Origin request reads.
   */
  forRequest(request: SimCloudFrontOriginRequest): string {
    const { pathname } = new URL(request.req.url);

    return decodeURIComponent(`${this.originPath}/${pathname}`)
      .replaceAll(/\/+/gu, "/")
      .replace(/^\/+/u, "");
  }
}
