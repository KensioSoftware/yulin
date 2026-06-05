import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  SimAwsServiceController,
  SimAwsServiceTarget,
} from "../../../serve/sim-service-controller.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimS3BucketName } from "../bucket/s3-bucket.js";

/**
 * Localhost HTTP controller for simulated S3.
 */
export class SimS3ServiceController implements SimAwsServiceController {
  constructor(private readonly simAws: SimAws) {}

  /**
   * Handle an HTTP request routed to a simulated S3 Bucket.
   */
  async handleRequest(
    target: SimAwsServiceTarget,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      this.sendText(response, 405, "Method not allowed\n");
      return;
    }

    if (target.resourceName.length === 0) {
      this.sendText(response, 400, "Missing S3 Bucket name\n");
      return;
    }

    if (target.regionName === undefined) {
      this.sendText(response, 400, "Missing S3 Bucket region\n");
      return;
    }

    const host = request.headers.host;
    if (host === undefined) {
      this.sendText(response, 400, "Missing host header\n");
      return;
    }

    const url = new URL(request.url ?? "/", `http://${host}`);
    const objectKey = decodeURIComponent(url.pathname.replace(/^\/+/u, ""));

    if (objectKey.length === 0) {
      this.sendText(response, 501, "S3 Bucket indexes are not implemented\n");
      return;
    }

    const bucketName = target.resourceName as SimS3BucketName;
    const bucketScope = this.simAws
      .s3GlobalRegistry()
      .findBucketScope(bucketName);
    if (bucketScope === undefined) {
      this.sendText(response, 404, `S3 bucket named ${bucketName} not found`);
      return;
    }
    if (bucketScope.regionName !== target.regionName) {
      this.sendText(
        response,
        404,
        `S3 bucket named ${bucketName} is in region ${bucketScope.regionName}, not requested ${target.regionName}`,
      );
      return;
    }
    const bucket = this.simAws
      .accountRegionScope(bucketScope.accountId, bucketScope.regionName)
      .s3()
      .getSimBucketByName(bucketName);
    if (bucket === undefined) {
      this.sendText(response, 404, `S3 bucket named ${bucketName} not found`);
      return;
    }

    const object = await bucket.getObject(objectKey);

    if (object === undefined) {
      this.sendText(response, 404, "Object not found\n");
      return;
    }

    const contentType = object.metadata.values["content-type"];

    response.writeHead(200, {
      "content-length": object.body.length,
      ...(contentType === undefined ? {} : { "content-type": contentType }),
    });

    if (request.method === "GET") {
      response.end(object.body);
      return;
    }

    response.end();
  }

  private sendText(
    response: ServerResponse,
    statusCode: number,
    body: string,
  ): void {
    response.writeHead(statusCode, {
      "content-type": "text/plain; charset=utf-8",
      "content-length": Buffer.byteLength(body),
    });
    response.end(body);
  }
}
