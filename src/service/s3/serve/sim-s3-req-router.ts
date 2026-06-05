import type { SimAws } from "../../aws/sim-aws.js";
import type { SimS3Bucket } from "../bucket/s3-bucket.js";
import type { SimS3BucketName } from "../bucket/s3-bucket.js";
import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import type { SimAwsHttpRequest } from "../../../serve/http/sim-aws-req-res.js";

export interface SimS3GetObjectRoute {
  readonly action: "getObject";
  readonly bucket: SimS3Bucket;
  readonly objectKey: string;
}

export interface SimS3RouteFailure {
  readonly action: "failure";
  readonly statusCode: number;
  readonly message: string;
}

export type SimS3Route = SimS3GetObjectRoute | SimS3RouteFailure;

/**
 * Resolves localhost HTTP requests into simulated S3 actions.
 */
export class SimS3RequestRouter {
  constructor(private readonly simAws: SimAws) {}

  /**
   * Route an incoming service target and HTTP request to a simulated S3 action.
   */
  route(target: SimAwsServiceTarget, request: SimAwsHttpRequest): SimS3Route {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return {
        action: "failure",
        statusCode: 405,
        message: "Method not allowed\n",
      };
    }

    if (target.resourceName.length === 0) {
      return {
        action: "failure",
        statusCode: 400,
        message: "Missing S3 Bucket name\n",
      };
    }

    if (target.regionName === undefined) {
      return {
        action: "failure",
        statusCode: 400,
        message: "Missing S3 Bucket region\n",
      };
    }

    const url = request.urlWithHost();
    const objectKey = decodeURIComponent(url.pathname.replace(/^\/+/u, ""));

    if (objectKey.length === 0) {
      return {
        action: "failure",
        statusCode: 501,
        message: "S3 Bucket indexes are not implemented\n",
      };
    }

    const bucketName = target.resourceName as SimS3BucketName;
    const bucketScope = this.simAws
      .s3GlobalRegistry()
      .findBucketScope(bucketName);

    if (bucketScope === undefined) {
      return {
        action: "failure",
        statusCode: 404,
        message: `S3 bucket named ${bucketName} not found`,
      };
    }

    if (bucketScope.regionName !== target.regionName) {
      return {
        action: "failure",
        statusCode: 404,
        message: `S3 bucket named ${bucketName} is in region ${bucketScope.regionName}, not requested ${target.regionName}`,
      };
    }

    const bucket = this.simAws
      .accountRegionScope(bucketScope.accountId, bucketScope.regionName)
      .s3()
      .getSimBucketByName(bucketName);

    if (bucket === undefined) {
      return {
        action: "failure",
        statusCode: 404,
        message: `S3 bucket named ${bucketName} not found`,
      };
    }

    return {
      action: "getObject",
      bucket,
      objectKey,
    };
  }
}
