import type { SimS3Bucket } from "../../../s3/bucket/sim-s3-bucket.js";
import type { SimS3Object } from "../../../s3/object/s3-object.js";
import type { SimCloudFrontOriginRequest } from "../sim-cloudfront-req-res.js";
import type { SimCloudFrontOrigin } from "../sim-cloudfront-origin.js";

export type SimCloudFrontS3OriginResolver = (
  originDomainName: string,
) => SimS3Bucket | undefined;

/**
 * Default S3 Origin Resolver that returns undefined for all origin domains.
 */
export function emptyCloudFrontS3OriginResolver(): undefined {
  /* v8 ignore next */
  return;
}

interface SimCloudFrontS3OriginProps {
  readonly bucket: SimS3Bucket;
  readonly originPath?: string | undefined;
}

/**
 * Simulated CloudFront S3 Origin.
 *
 * This represents a basic S3 object origin, not an S3 static website endpoint.
 */
export class SimCloudFrontS3Origin implements SimCloudFrontOrigin {
  private readonly bucket: SimS3Bucket;
  private readonly originPath: string;

  constructor(props: SimCloudFrontS3OriginProps) {
    this.bucket = props.bucket;
    this.originPath = props.originPath ?? "";
  }

  /**
   * Fetch an object from the backing simulated S3 Bucket.
   */
  async fetch(request: SimCloudFrontOriginRequest): Promise<Response> {
    if (!this.methodSupported(request.req.method)) {
      return new Response(`Method ${request.req.method} not allowed`, {
        status: 405,
        headers: {
          allow: "GET, HEAD",
          "content-type": "text/plain; charset=utf-8",
        },
      });
    }

    const objectKey = this.objectKeyForRequest(request);
    const object = await this.bucket.getObject(objectKey);

    if (object === undefined) {
      return this.notFoundResponse(objectKey);
    }

    return this.foundObjectResponse(object, request.req);
  }

  private methodSupported(method: string): boolean {
    return method === "GET" || method === "HEAD";
  }

  private objectKeyForRequest(request: SimCloudFrontOriginRequest): string {
    const url = new URL(request.req.url);
    const requestPath = url.pathname;

    return this.normalizeObjectKey(`${this.originPath}/${requestPath}`);
  }

  private normalizeObjectKey(path: string): string {
    return decodeURIComponent(path)
      .replaceAll(/\/+/gu, "/")
      .replace(/^\/+/u, "");
  }

  private foundObjectResponse(object: SimS3Object, request: Request): Response {
    const contentType = object.metadata.values["content-type"];

    const headers = {
      "content-length": String(object.body.length),
      ...(contentType !== undefined && { "content-type": contentType }),
    };

    if (request.method === "HEAD") {
      return new Response(undefined, {
        status: 200,
        headers,
      });
    }

    return new Response(object.body, {
      status: 200,
      headers,
    });
  }

  private notFoundResponse(objectKey: string): Response {
    return new Response(
      `Object ${objectKey} not found in sim S3 Bucket ${this.bucket.bucketName}`,
      {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      },
    );
  }
}
