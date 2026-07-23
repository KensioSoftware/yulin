import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface ListCertificatesAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to an ACM ListCertificates request.
 *
 * AWS maps the ListCertificates API operation to the acm:ListCertificates IAM
 * action. This is a list operation whose authorization resource is "*", rather
 * than an individual Certificate ARN.
 *
 * Authorization applies to the complete operation. A denied caller receives
 * AccessDenied rather than an empty or filtered certificate listing.
 */
export class ListCertificatesAuthorizer {
  private static readonly action = "acm:ListCertificates";
  private static readonly resource = "*";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: ListCertificatesAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may list the simulated Account and Region's certificates.
   *
   * The caller is passed through unchanged so sim IAM can distinguish an
   * omitted caller, which defaults to Account root, from an explicit anonymous
   * caller.
   */
  authorize(caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: ListCertificatesAuthorizer.action,
      resource: ListCertificatesAuthorizer.resource,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: ListCertificatesAuthorizer.action,
        resource: ListCertificatesAuthorizer.resource,
      });
    }
  }
}
