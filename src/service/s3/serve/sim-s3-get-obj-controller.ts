import type { SimS3Bucket } from "../bucket/s3-bucket.js";

/**
 * Serves a simulated S3 Object over HTTP.
 */
export class SimS3GetObjectController {
  /**
   * Handle a GET request for an S3 Object via simulated S3.
   */
  async handleRequest(
    bucket: SimS3Bucket,
    objectKey: string,
    request: Request,
  ): Promise<Response> {
    const object = await bucket.getObject(objectKey);

    if (object === undefined) {
      return new Response("Object not found\n", {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      });
    }

    const contentType = object.metadata.values["content-type"];

    const headers = {
      "content-length": String(object.body.length),
      ...(contentType === undefined ? {} : { "content-type": contentType }),
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
}
