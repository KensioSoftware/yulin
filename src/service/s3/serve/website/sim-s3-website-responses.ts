import type { SimS3WebsiteObject } from "./sim-s3-website-object.js";

const plainTextHeaders = {
  "content-type": "text/plain; charset=utf-8",
} as const;

/**
 * The HTTP responses the simulated S3 static website endpoint answers with.
 *
 * Kept apart from the controller because deciding what to serve and building
 * the response that serves it are separate jobs, and only the first one is
 * interesting.
 */
export class SimS3WebsiteResponses {
  /**
   * Serve an Object, with no body when the request was a HEAD.
   */
  foundObject(
    object: SimS3WebsiteObject,
    request: Request,
    status = 200,
  ): Response {
    const headers = object.headers();

    if (request.method === "HEAD") {
      return new Response(undefined, { status, headers });
    }

    return new Response(object.body, { status, headers });
  }

  /**
   * Refuse a request for an Object the caller may not read.
   */
  accessDenied(bucketName: string): Response {
    return new Response(`Access denied for bucket ${bucketName}\n`, {
      status: 403,
      headers: plainTextHeaders,
    });
  }

  /**
   * Refuse a request to a Bucket that is not serving a website at all.
   */
  websiteNotEnabled(bucketName: string): Response {
    return new Response(
      `Static website hosting is not enabled for bucket ${bucketName}\n`,
      { status: 403, headers: plainTextHeaders },
    );
  }

  /**
   * Report an Object the Bucket does not hold.
   */
  notFound(bucketName: string, objectKey: string): Response {
    return new Response(
      `Object ${objectKey} not found in bucket ${bucketName}`,
      { status: 404, headers: plainTextHeaders },
    );
  }
}
