import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimCloudFrontOriginRequest } from "../sim-cloudfront-request-response.js";
import type { SimCloudFrontOrigin } from "../sim-cloudfront-origin.js";
import type { SimCloudFrontOriginAccessControl } from "../../origin-access-control/sim-cf-origin-access-control.js";
import type { SimCfS3OriginBucket } from "./sim-cf-s3-origin-bucket.js";
import { SimCfS3OriginObjectKey } from "./sim-cf-s3-origin-object-key.js";
import { SimCfS3OriginObjectLoader } from "./sim-cf-s3-origin-object-loader.js";
import { SimCfS3OriginResponses } from "./sim-cf-s3-origin-responses.js";

export type SimCloudFrontS3OriginResolver = (
  originDomainName: string,
) => SimCfS3OriginBucket | undefined;

/**
 * Default S3 Origin Resolver that returns undefined for all origin domains.
 */
export function emptyCloudFrontS3OriginResolver(): undefined {
  /* v8 ignore next */
  return;
}

interface SimCloudFrontS3OriginProperties {
  readonly originBucket: SimCfS3OriginBucket;
  readonly originPath?: string | undefined;
  readonly originAccessControl?: SimCloudFrontOriginAccessControl | undefined;
}

/**
 * Simulated CloudFront S3 Origin.
 *
 * This represents a basic S3 object origin, not an S3 static website endpoint.
 *
 * Objects are read through the ordinary GetObject command as an anonymous
 * caller, which is the unsigned request real CloudFront sends to the S3 REST
 * endpoint when the Origin has no origin access control. An Object the Bucket
 * policy has not made publicly readable is therefore refused, and the refusal
 * reaches the viewer as the Origin answering 403.
 */
export class SimCloudFrontS3Origin implements SimCloudFrontOrigin {
  /**
   * The origin access control this Origin was created with, if any.
   *
   * It is stored and reported, and it does not yet sign the read below: the
   * Object is read anonymously either way, so a Bucket only an origin access
   * control could reach answers 403 until signing is simulated.
   */
  public readonly originAccessControl:
    | SimCloudFrontOriginAccessControl
    | undefined;

  private readonly loader: SimCfS3OriginObjectLoader;
  private readonly responses: SimCfS3OriginResponses;
  private readonly objectKey: SimCfS3OriginObjectKey;

  constructor(properties: SimCloudFrontS3OriginProperties) {
    this.loader = new SimCfS3OriginObjectLoader(properties.originBucket);
    this.responses = new SimCfS3OriginResponses(
      properties.originBucket.bucket.bucketName,
    );
    this.objectKey = new SimCfS3OriginObjectKey(properties.originPath ?? "");
    this.originAccessControl = properties.originAccessControl;
  }

  /**
   * Fetch an object from the backing simulated S3 Bucket.
   */
  async fetch(request: SimCloudFrontOriginRequest): Promise<Response> {
    const { method } = request.req;

    if (!this.methodSupported(method)) {
      return this.responses.methodNotAllowed(method);
    }

    const objectKey = this.objectKey.forRequest(request);
    const object = await this.loader.load(objectKey);

    if (object instanceof SimIamAccessDenied) {
      return this.responses.accessDenied(objectKey);
    }

    if (object === undefined) {
      return this.responses.notFound(objectKey);
    }

    return this.responses.foundObject(object, request.req);
  }

  private methodSupported(method: string): boolean {
    return method === "GET" || method === "HEAD";
  }
}
