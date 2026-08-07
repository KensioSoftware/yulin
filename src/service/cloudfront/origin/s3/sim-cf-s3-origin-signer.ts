import type { SimS3RequestOptions } from "../../../s3/command/sim-s3-request-options.js";
import { simCloudFrontDistributionArn } from "../../distribution/sim-cf-distribution-view.js";
import type { SimCloudFrontOriginAccessControl } from "../../origin-access-control/sim-cf-origin-access-control.js";
import { simCloudFrontServicePrincipal } from "../../sim-cloudfront-service-principal.js";
import type { SimCloudFrontOriginRequest } from "../sim-cloudfront-request-response.js";

/**
 * Who a CloudFront S3 Origin reads its Bucket as.
 *
 * An origin access control that signs makes the read a request from the
 * CloudFront service principal carrying the Distribution's ARN, which is the
 * pair a Bucket policy for an origin access control is written against. Without
 * one, or with a `SigningBehavior` of `never`, CloudFront sends the S3 REST
 * endpoint an unsigned request, so the read is anonymous.
 *
 * Which Distribution the read belongs to is only known per request, so this
 * answers per read rather than when the Origin is built. Nothing about the read
 * could be settled earlier anyway: in a CDK stack the Bucket policy is created
 * after the Distribution, because it names the Distribution's ARN.
 */
export class SimCfS3OriginSigner {
  private readonly originAccessControl:
    | SimCloudFrontOriginAccessControl
    | undefined;

  constructor(originAccessControl?: SimCloudFrontOriginAccessControl) {
    this.originAccessControl = originAccessControl;
  }

  /**
   * The S3 request options one Origin read is made with.
   */
  forRequest(request: SimCloudFrontOriginRequest): SimS3RequestOptions {
    if (this.originAccessControl?.signs !== true) {
      return { caller: { kind: "anonymous" } };
    }

    return {
      caller: { kind: "service", service: simCloudFrontServicePrincipal },
      sourceArn: simCloudFrontDistributionArn(request.distribution),
      sourceAccount: request.distribution.accountId,
    };
  }
}
