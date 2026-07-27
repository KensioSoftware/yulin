import { SimAws } from "../../aws/sim-aws.js";
import type { SimS3BucketName } from "../bucket/sim-s3-bucket.js";
import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import {
  type SimS3Route,
  simS3RouteFailure as failure,
} from "./sim-s3-route.js";
import {
  SimS3BucketLocator,
  SimS3BucketNotFound,
} from "./sim-s3-bucket-locator.js";
import { SimS3ObjectAddress } from "./sim-s3-object-address.js";
import { simS3RestRefusal } from "./sim-s3-rest-refusal.js";

interface SimS3RequestRouterProperties {
  readonly simAws?: SimAws;
}

/**
 * Resolves HTTP requests into simulated S3 actions.
 *
 * Which endpoint the request arrived at decides what it can be: the website
 * endpoint serves static sites and reads nothing but GET and HEAD, while the
 * REST endpoint is the API, and only it accepts an upload or authenticates a
 * caller. Real S3 draws the same line, and a test that could reach the API
 * through a website hostname would prove something about a deployment that
 * cannot happen.
 */
export class SimS3RequestRouter {
  private readonly buckets: SimS3BucketLocator;

  constructor(properties: SimS3RequestRouterProperties = {}) {
    const { simAws = new SimAws() } = properties;
    this.buckets = new SimS3BucketLocator({ simAws });
  }

  /**
   * Route an incoming service target and HTTP request to a simulated S3 action.
   */
  route(target: SimAwsServiceTarget, request: Request): SimS3Route {
    const regionName = target.regionName;

    if (regionName === undefined) {
      return failure(400, "Missing S3 Bucket region\n");
    }

    if (target.endpoint === "rest") {
      return this.restRoute(target, request, regionName);
    }

    return this.websiteRoute(target, request, regionName);
  }

  private websiteRoute(
    target: SimAwsServiceTarget,
    request: Request,
    regionName: string,
  ): SimS3Route {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return failure(405, "Method not allowed\n");
    }

    if (target.resourceName.length === 0) {
      return failure(400, "Missing S3 Bucket name\n");
    }

    const found = this.buckets.locate(
      target.resourceName as SimS3BucketName,
      regionName,
    );

    if (found instanceof SimS3BucketNotFound) {
      return failure(found.statusCode, found.message);
    }

    const url = new URL(request.url);

    return {
      action: "website",
      bucket: found.bucket,
      objectKey: decodeURIComponent(url.pathname.replace(/^\/+/u, "")),
    };
  }

  /**
   * Route a request that arrived at the REST API endpoint.
   *
   * Only the Object operations simulated S3 has are accepted. Anything else is
   * refused as unsupported rather than answered with something plausible, so a
   * gap in the simulation shows up in the test that found it.
   */
  private restRoute(
    target: SimAwsServiceTarget,
    request: Request,
    regionName: string,
  ): SimS3Route {
    const address = SimS3ObjectAddress.fromRestRequest(
      target,
      new URL(request.url),
    );
    if (address === undefined) {
      return failure(400, "Missing S3 Bucket name\n");
    }

    const refusal = simS3RestRefusal(request.method, address);

    if (refusal !== undefined) {
      return refusal;
    }

    const found = this.buckets.locate(address.bucketName, regionName);

    if (found instanceof SimS3BucketNotFound) {
      return failure(found.statusCode, found.message);
    }

    return {
      action: "restObject",
      bucket: found.bucket,
      bucketScope: found.bucketScope,
      objectKey: address.objectKey,
    };
  }
}
