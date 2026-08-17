import {
  simAwsCallerHeaderName,
  simAwsCallerHeaderValue,
} from "../../../iam/request/sim-aws-caller-header.js";
import {
  simAwsSourceAccountHeaderName,
  simAwsSourceArnHeaderName,
} from "../../../iam/request/sim-aws-request-source.js";
import {
  simIamSigV4ContentSha256Header,
  simIamSigV4UnsignedPayload,
} from "../../../iam/sigv4/canonical/sim-iam-sigv4-payload-hash.js";
import { simCloudFrontDistributionArn } from "../../distribution/sim-cf-distribution-view.js";
import type { SimCloudFrontOriginAccessControl } from "../../origin-access-control/sim-cf-origin-access-control.js";
import { simCloudFrontServicePrincipal } from "../../sim-cloudfront-service-principal.js";
import type { SimCloudFrontOriginRequest } from "../sim-cloudfront-request-response.js";

/**
 * The viewer methods CloudFront has a body to hash for.
 *
 * These are the two AWS names on the Function URL Origin documentation, and
 * the two a viewer sends a body with in practice. Anything else is left alone
 * rather than guessed at, since refusing a method real CloudFront lets through
 * would be the more expensive mistake.
 */
const bodyCarryingMethods = new Set(["POST", "PUT"]);

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
 * The payload hash a real signature covers is stated as itself, since it is
 * the one part of a signature an Origin turns a request away over.
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
   * The headers stating who one Origin request is from and what its signature
   * covers, which are none when the Origin is reached anonymously.
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
      ...payloadDeclaration(request.req),
    };
  }
}

/**
 * What the signature says the Origin request body hashes to.
 *
 * CloudFront streams the viewer's body on to the Origin rather than buffering
 * it, so it has no hash of its own to sign with. It signs the viewer's
 * `x-amz-content-sha256` when the viewer sent one, and `UNSIGNED-PAYLOAD` when
 * it did not. A Lambda Function URL does not accept an unsigned payload, so a
 * POST or PUT that carried no hash through a signing origin access control is
 * refused at the Origin, which is what real CloudFront and Lambda do with one.
 *
 * A viewer's own header travels with the rest of its headers, so nothing is
 * stated for it here.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html
 */
function payloadDeclaration(viewerRequest: Request): Record<string, string> {
  if (
    !bodyCarryingMethods.has(viewerRequest.method.toUpperCase()) ||
    viewerRequest.headers.has(simIamSigV4ContentSha256Header)
  ) {
    return {};
  }

  return { [simIamSigV4ContentSha256Header]: simIamSigV4UnsignedPayload };
}
