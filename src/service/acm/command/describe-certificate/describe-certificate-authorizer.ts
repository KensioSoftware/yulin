import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface DescribeCertificateAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to an ACM DescribeCertificate request.
 *
 * DescribeCertificate authorizes against the requested Certificate ARN. This
 * differs from ListCertificates, which is an account and Region-level operation
 * using "*". A policy can therefore grant access to one certificate without
 * granting access to every certificate in the Account and Region.
 *
 * Authorization occurs before ACM looks up the Certificate. An unauthorized
 * caller receives AccessDenied whether the requested ARN exists or not, which
 * prevents the operation from exposing certificate existence.
 */
export class DescribeCertificateAuthorizer {
  private static readonly action = "acm:DescribeCertificate";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: DescribeCertificateAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may describe the certificate identified by the ARN.
   *
   * The caller is passed through unchanged so sim IAM can apply the account-root
   * fallback only for an omitted caller and preserve explicit anonymous callers.
   */
  authorize(certificateArn: string, caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: DescribeCertificateAuthorizer.action,
      resource: certificateArn,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action: DescribeCertificateAuthorizer.action,
        resource: certificateArn,
      });
    }
  }
}
