import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

/**
 * The start of every SES ARN in one account and region.
 */
export function simSesArnPrefix(scope: SimAwsAccountRegionScope): string {
  return `arn:aws:ses:${scope.regionName}:${scope.accountId}:`;
}

/**
 * The ARN of an email identity.
 *
 * This is the resource IAM evaluates an SES request against: a policy allowing
 * `ses:SendEmail` names the identity being sent from, not the recipient.
 */
export function simSesIdentityArn(
  scope: SimAwsAccountRegionScope,
  emailIdentity: string,
): string {
  return `${simSesArnPrefix(scope)}identity/${emailIdentity}`;
}
