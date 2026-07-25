import { parseSimArn, type SimArn } from "../../aws/arn.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimAcmCertificate } from "../certificate/sim-acm-certificate.js";
import type { SimAcm } from "../sim-acm.js";

type SimAcmScopeKey = string;

/**
 * Simulation-wide registry of Account/Region-scoped ACM facades.
 *
 * One registry belongs to one SimAws environment. ACM is scoped to an account
 * and Region, but other services hold only a certificate ARN, so this is how
 * they get from that ARN back to the certificate it names. CloudFront uses it
 * to check the certificate on a Distribution.
 *
 * The registry indexes ACM facades but does not create or own them.
 */
export class SimAcmRegistry {
  private readonly acmByScope = new Map<SimAcmScopeKey, SimAcm>();

  /**
   * Register the ACM facade belonging to an Account and Region.
   */
  register(accountRegionScope: SimAwsAccountRegionScope, acm: SimAcm): void {
    this.acmByScope.set(scopeKey(accountRegionScope), acm);
  }

  /**
   * Find the Certificate an ARN names, wherever in the simulation it lives.
   *
   * Undefined covers every way an ARN can fail to name a certificate here: it
   * is not an ARN, it is not an ACM ARN, its account and Region hold no
   * simulated ACM, or that ACM holds no such certificate. Callers report the
   * failure in their own terms, as AWS services do.
   */
  certificate(certificateArn: string): SimAcmCertificate | undefined {
    const arn = parseSimArn(certificateArn);

    if (arn?.service !== "acm") {
      return undefined;
    }

    const acm = this.acmByScope.get(
      scopeKey({ accountId: arn.accountId, regionName: arn.region }),
    );

    return acm?.certificates.get(certificateArn as SimArn);
  }
}

function scopeKey(
  accountRegionScope: SimAwsAccountRegionScope,
): SimAcmScopeKey {
  return `${accountRegionScope.accountId}:${accountRegionScope.regionName}`;
}
