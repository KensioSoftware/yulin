import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { LambdaAtEdge } from "../../typings/lambda-at-edge.namespace.js";
import {
  s3OriginDomainName,
  s3OriginEdgeOrigin,
  s3OriginEdgePath,
} from "./sim-cf-s3-origin-edge.js";
import type { SimCloudFrontOriginRequest } from "../sim-cloudfront-request-response.js";
import type { SimCloudFrontOrigin } from "../sim-cloudfront-origin.js";
import type { SimCloudFrontOriginAccessControl } from "../../origin-access-control/sim-cf-origin-access-control.js";
import type { SimCfS3OriginBucket } from "./sim-cf-s3-origin-bucket.js";
import { SimCfS3OriginObjectKey } from "./sim-cf-s3-origin-object-key.js";
import { SimCfS3OriginObjectLoader } from "./sim-cf-s3-origin-object-loader.js";
import { SimCfS3OriginResponses } from "./sim-cf-s3-origin-responses.js";
import { SimCfS3OriginSigner } from "./sim-cf-s3-origin-signer.js";

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

export interface SimCloudFrontS3OriginProperties {
  readonly originBucket: SimCfS3OriginBucket;
  readonly originPath?: string | undefined;
  readonly originAccessControl?: SimCloudFrontOriginAccessControl | undefined;
  /**
   * The domain name the Origin was configured with, which an origin event
   * reports. An Origin built without one reports the Bucket's REST endpoint.
   */
  readonly domainName?: string | undefined;
}

/**
 * Simulated CloudFront S3 Origin.
 *
 * This represents a basic S3 object origin, not an S3 static website endpoint.
 *
 * Objects are read through the ordinary GetObject command, so the Bucket policy
 * decides what the Origin can serve. An Origin whose origin access control
 * signs reads as the CloudFront service principal, and one without reads
 * anonymously, which is the unsigned request real CloudFront sends to the S3
 * REST endpoint. An Object the Bucket policy does not make readable by whoever
 * the Origin is reading as is refused, and the refusal reaches the viewer as
 * the Origin answering 403.
 */
export class SimCloudFrontS3Origin implements SimCloudFrontOrigin {
  /**
   * The origin access control this Origin was created with, if any.
   *
   * One that signs is what makes the read below a request from the CloudFront
   * service principal carrying this Distribution's ARN, so a Bucket policy
   * written for an origin access control is what decides the read.
   */
  public readonly originAccessControl:
    | SimCloudFrontOriginAccessControl
    | undefined;

  private readonly loader: SimCfS3OriginObjectLoader;
  private readonly responses: SimCfS3OriginResponses;
  private readonly objectKey: SimCfS3OriginObjectKey;
  private readonly signer: SimCfS3OriginSigner;
  private readonly domainName: string;

  constructor(private readonly properties: SimCloudFrontS3OriginProperties) {
    this.loader = new SimCfS3OriginObjectLoader(properties.originBucket);
    this.signer = new SimCfS3OriginSigner(properties.originAccessControl);
    this.responses = new SimCfS3OriginResponses(
      properties.originBucket.bucket.bucketName,
    );
    this.objectKey = new SimCfS3OriginObjectKey(properties.originPath ?? "");
    this.originAccessControl = properties.originAccessControl;
    this.domainName = s3OriginDomainName(properties);
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
    const object = await this.loader.load(
      objectKey,
      this.signer.forRequest(request),
    );

    if (object instanceof SimIamAccessDenied) {
      return this.responses.accessDenied(objectKey);
    }

    if (object === undefined) {
      return this.responses.notFound(objectKey);
    }

    return this.responses.foundObject(object, request.req);
  }

  /**
   * This Origin as an origin event presents it.
   */
  toEdgeOrigin(): LambdaAtEdge.Origin {
    return s3OriginEdgeOrigin(this.properties, this.domainName);
  }

  /**
   * This Origin as an origin-request handler left it.
   */
  withEdgeOrigin(edgeOrigin: LambdaAtEdge.Origin): SimCloudFrontOrigin {
    return new SimCloudFrontS3Origin({
      ...this.properties,
      originPath: s3OriginEdgePath(this.domainName, edgeOrigin),
    });
  }

  private methodSupported(method: string): boolean {
    return method === "GET" || method === "HEAD";
  }
}
