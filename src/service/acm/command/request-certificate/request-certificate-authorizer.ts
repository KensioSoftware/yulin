import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface RequestCertificateAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly resource: string;
}

/**
 * Applies IAM authorization to an ACM RequestCertificate request.
 *
 * ACM authorizes this operation against the wildcard certificate resource for
 * the current Account and Region because the certificate does not exist until
 * the request succeeds.
 */
export class RequestCertificateAuthorizer {
  private static readonly action = "acm:RequestCertificate";

  private readonly iam: SimIamInterServiceAuthZ;
  private readonly resource: string;

  constructor(properties: RequestCertificateAuthorizerProperties) {
    this.iam = properties.iam;
    this.resource = properties.resource;
  }

  /**
   * Ensure the caller may request a certificate in this Account and Region.
   *
   * The caller is passed through unchanged so IAM can distinguish an omitted
   * caller, which defaults to Account root, from an explicit anonymous caller.
   */
  authorize(caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: RequestCertificateAuthorizer.action,
      resource: this.resource,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: RequestCertificateAuthorizer.action,
        resource: this.resource,
      });
    }
  }
}
