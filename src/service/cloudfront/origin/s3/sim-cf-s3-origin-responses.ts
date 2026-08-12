import type { SimS3BucketName } from "../../../s3/bucket/sim-s3-bucket.js";
import type { SimS3Object } from "../../../s3/object/s3-object.js";
import { simS3ObjectResponseHeaders } from "../../../s3/object/s3-object-response-headers.js";
import { simS3QuotedETag } from "../../../s3/object/s3-object-etag.js";

const plainTextHeaders = {
  "content-type": "text/plain; charset=utf-8",
} as const;

/**
 * The responses a CloudFront S3 Origin answers a Distribution with.
 *
 * Kept apart from the Origin because deciding what to serve and building the
 * response that serves it are separate jobs, and only the first one is
 * interesting.
 */
export class SimCfS3OriginResponses {
  constructor(private readonly bucketName: SimS3BucketName) {}

  /**
   * Serve an Object, with no body when the request was a HEAD.
   */
  foundObject(object: SimS3Object, request: Request): Response {
    const headers = simS3ObjectResponseHeaders({
      metadata: object.metadata.values,
      bodyLength: object.body.length,
      etag: simS3QuotedETag(object.etag),
      lastModified: object.lastModified,
    });

    if (request.method === "HEAD") {
      return new Response(undefined, { status: 200, headers });
    }

    return new Response(object.body, { status: 200, headers });
  }

  /**
   * Report an Object the Bucket does not hold.
   */
  notFound(objectKey: string): Response {
    return new Response(
      `Object ${objectKey} not found in sim S3 Bucket ${this.bucketName}`,
      { status: 404, headers: plainTextHeaders },
    );
  }

  /**
   * The 403 S3 answers an unsigned read of an Object it has not been told to
   * make public, which the Distribution's custom error response for 403 can
   * then replace, as it does in CloudFront.
   */
  accessDenied(objectKey: string): Response {
    return new Response(
      `Access denied reading Object ${objectKey} from sim S3 Bucket ${this.bucketName}`,
      { status: 403, headers: plainTextHeaders },
    );
  }

  /**
   * Refuse a method an S3 Origin does not answer.
   */
  methodNotAllowed(method: string): Response {
    return new Response(`Method ${method} not allowed`, {
      status: 405,
      headers: { allow: "GET, HEAD", ...plainTextHeaders },
    });
  }
}
