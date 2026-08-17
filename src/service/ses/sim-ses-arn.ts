import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";

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

/**
 * The ARN of an email template.
 *
 * This is the resource IAM evaluates a template operation against, so a policy
 * can allow a caller to manage one template and not the others.
 */
export function simSesTemplateArn(
  scope: SimAwsAccountRegionScope,
  templateName: string,
): string {
  return `${simSesArnPrefix(scope)}template/${templateName}`;
}
