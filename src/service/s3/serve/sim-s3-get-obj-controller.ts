import type { SimS3Bucket } from "../bucket/s3-bucket.js";
import type {
  SimAwsHttpRequest,
  SimAwsHttpResponse,
} from "../../../serve/http/sim-aws-req-res.js";

/**
 * Serves a simulated S3 Object over localhost HTTP.
 */
export class SimS3GetObjectController {
  /**
   * Handle a GET request for an S3 Object via simulated S3.
   */
  async handleRequest(
    bucket: SimS3Bucket,
    objectKey: string,
    request: SimAwsHttpRequest,
    response: SimAwsHttpResponse,
  ): Promise<void> {
    const object = await bucket.getObject(objectKey);

    if (object === undefined) {
      response.sendText(404, "Object not found\n");
      return;
    }

    const contentType = object.metadata.values["content-type"];

    const headers = {
      "content-length": object.body.length,
      ...(contentType === undefined ? {} : { "content-type": contentType }),
    };

    if (request.method === "HEAD") {
      response.sendHead(200, headers);
      return;
    }

    response.send(200, object.body, headers);
  }
}
