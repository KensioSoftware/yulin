import type { SimS3Bucket } from "../../../s3/bucket/sim-s3-bucket.js";
import type { SimS3Object } from "../../../s3/object/s3-object.js";
import { simS3ObjectResponseHeaders } from "../../../s3/object/s3-object-response-headers.js";
import type { SimCloudFrontOriginRequest } from "../sim-cloudfront-request-response.js";
import type { SimCloudFrontOrigin } from "../sim-cloudfront-origin.js";
import type { SimCloudFrontOriginAccessControl } from "../../origin-access-control/sim-cf-origin-access-control.js";
import { SimCfS3OriginObjectKey } from "./sim-cf-s3-origin-object-key.js";

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

interface SimCloudFrontS3OriginProperties {
  readonly bucket: SimS3Bucket;
  readonly originPath?: string | undefined;
  readonly originAccessControl?: SimCloudFrontOriginAccessControl | undefined;
}

/**
 * Simulated CloudFront S3 Origin.
 *
 * This represents a basic S3 object origin, not an S3 static website endpoint.
 */
export class SimCloudFrontS3Origin implements SimCloudFrontOrigin {
  /**
   * The origin access control this Origin was created with, if any.
   *
   * It is stored and reported, and it does not yet decide whether the read
   * below is allowed: the object is fetched from the Bucket model either way.
   */
  public readonly originAccessControl:
    | SimCloudFrontOriginAccessControl
    | undefined;

  private readonly bucket: SimS3Bucket;
  private readonly objectKey: SimCfS3OriginObjectKey;

  constructor(properties: SimCloudFrontS3OriginProperties) {
    this.bucket = properties.bucket;
    this.objectKey = new SimCfS3OriginObjectKey(properties.originPath ?? "");
    this.originAccessControl = properties.originAccessControl;
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

    const objectKey = this.objectKey.forRequest(request);
    const object = await this.bucket.getObject(objectKey);

    if (object === undefined) {
      return this.notFoundResponse(objectKey);
    }

    return this.foundObjectResponse(object, request.req);
  }

  private methodSupported(method: string): boolean {
    return method === "GET" || method === "HEAD";
  }

  private foundObjectResponse(object: SimS3Object, request: Request): Response {
    const headers = simS3ObjectResponseHeaders(
      object.metadata.values,
      object.body.length,
    );

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
