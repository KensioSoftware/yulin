import {
  simAwsCallerHeaderName,
  simAwsCallerHeaderValue,
} from "../../../iam/request/sim-aws-caller-header.js";
import {
  simAwsSourceAccountHeaderName,
  simAwsSourceArnHeaderName,
} from "../../../iam/request/sim-aws-request-source.js";
import { simCloudFrontDistributionArn } from "../../distribution/sim-cf-distribution-view.js";
import type { SimCloudFrontOriginAccessControl } from "../../origin-access-control/sim-cf-origin-access-control.js";
import { simCloudFrontServicePrincipal } from "../../sim-cloudfront-service-principal.js";
import type { SimCloudFrontOriginRequest } from "../sim-cloudfront-request-response.js";

/**
 * Who a CloudFront custom Origin is reached as.
 *
 * An origin access control that signs makes the Origin request one from the
 * CloudFront service principal carrying the Distribution's ARN, which is the
 * pair a Function URL's `lambda:InvokeFunctionUrl` permission for CloudFront is
 * written against. Without one, or with a `SigningBehavior` of `never`, the
 * Origin is reached anonymously, so a Function URL with `AWS_IAM` refuses it.
 *
 * Real CloudFront states that by signing the request with SigV4. Nothing here
 * computes a signature, so it is stated at the simulated HTTP boundary instead,
 * the same way anything else calling into simulated AWS in process says who it
 * is.
 *
 * Which Distribution the request belongs to is only known per request, so this
 * answers per fetch rather than when the Origin is built.
 */
export class SimCfCustomOriginSigner {
  private readonly originAccessControl:
    | SimCloudFrontOriginAccessControl
    | undefined;

  constructor(originAccessControl?: SimCloudFrontOriginAccessControl) {
    this.originAccessControl = originAccessControl;
  }

  /**
   * The headers stating who one Origin request is from, which are none when the
   * Origin is reached anonymously.
   */
  forRequest(request: SimCloudFrontOriginRequest): Record<string, string> {
    if (this.originAccessControl?.signs !== true) {
      return {};
    }

    return {
      [simAwsCallerHeaderName]: simAwsCallerHeaderValue({
        kind: "service",
        service: simCloudFrontServicePrincipal,
      }),
      [simAwsSourceArnHeaderName]: simCloudFrontDistributionArn(
        request.distribution,
      ),
      [simAwsSourceAccountHeaderName]: request.distribution.accountId,
    };
  }
}
