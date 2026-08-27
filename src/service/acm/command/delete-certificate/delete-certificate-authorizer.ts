import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface DeleteCertificateAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to an ACM DeleteCertificate request.
 *
 * DeleteCertificate authorizes against the requested Certificate ARN, so a
 * policy can grant deleting one certificate without granting deleting every
 * certificate in the Account and Region.
 *
 * Authorization occurs before ACM looks up the Certificate, so an unauthorized
 * caller receives AccessDenied whether the requested ARN exists or not.
 */
export class DeleteCertificateAuthorizer {
  private static readonly action = "acm:DeleteCertificate";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: DeleteCertificateAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may delete the certificate identified by the ARN.
   */
  authorize(certificateArn: string, caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: DeleteCertificateAuthorizer.action,
      resource: certificateArn,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action: DeleteCertificateAuthorizer.action,
        resource: certificateArn,
      });
    }
  }
}
