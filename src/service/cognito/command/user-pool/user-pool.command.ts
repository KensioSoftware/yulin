import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCognitoAdminCreateUserConfigType } from "../../user-pool/sim-cognito-admin-create-user-config.js";
import type { SimCognitoUserPoolPoliciesType } from "../../user-pool/sim-cognito-password-policy.js";
import type { SimCognitoUnsimulatedPoolSettingsType } from "../../user-pool/sim-cognito-unsimulated-pool-settings.js";

/**
 * A user pool as sim Cognito reports it.
 *
 * Only the properties this simulation models appear, alongside the ones it
 * accepts without acting on and reports back so a request's intent stays
 * visible. Real Cognito reports more, including the pool's schema attributes.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_UserPoolType.html
 */
export interface SimCognitoUserPoolType extends SimCognitoUnsimulatedPoolSettingsType {
  readonly Id?: string | undefined;
  readonly Name?: string | undefined;
  readonly Arn?: string | undefined;
  readonly Policies?: SimCognitoUserPoolPoliciesType | undefined;
  readonly DeletionProtection?: string | undefined;
  readonly MfaConfiguration?: string | undefined;
  readonly AdminCreateUserConfig?:
    SimCognitoAdminCreateUserConfigType | undefined;
  readonly AutoVerifiedAttributes?: readonly string[] | undefined;
  readonly EstimatedNumberOfUsers?: number | undefined;
  readonly CreationDate?: Date | undefined;
  readonly LastModifiedDate?: Date | undefined;
}

/**
 * The CreateUserPool inputs this simulation reads, and the ones it refuses.
 *
 * Every input real Cognito accepts is named here, whether or not it is
 * simulated, so a request carrying one this simulation does not model can be
 * refused rather than silently ignored.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/CreateUserPoolCommand/
 */
export interface SimCreateUserPoolCommandInput {
  readonly PoolName?: string | undefined;
  readonly Policies?: SimCognitoUserPoolPoliciesType | undefined;
  readonly DeletionProtection?: string | undefined;
  readonly MfaConfiguration?: string | undefined;
  readonly UserPoolTier?: string | undefined;
  readonly AccountRecoverySetting?: object | undefined;
  readonly AdminCreateUserConfig?:
    SimCognitoAdminCreateUserConfigType | undefined;
  readonly AliasAttributes?: readonly string[] | undefined;
  readonly AutoVerifiedAttributes?: readonly string[] | undefined;
  readonly DeviceConfiguration?: object | undefined;
  readonly EmailConfiguration?: object | undefined;
  readonly EmailVerificationMessage?: string | undefined;
  readonly EmailVerificationSubject?: string | undefined;
  readonly IssuerConfiguration?: object | undefined;
  readonly KeyConfiguration?: object | undefined;
  readonly LambdaConfig?: object | undefined;
  readonly Schema?: readonly object[] | undefined;
  readonly SmsAuthenticationMessage?: string | undefined;
  readonly SmsConfiguration?: object | undefined;
  readonly SmsVerificationMessage?: string | undefined;
  readonly UserAttributeUpdateSettings?: object | undefined;
  readonly UsernameAttributes?: readonly string[] | undefined;
  readonly UsernameConfiguration?: object | undefined;
  readonly UserPoolAddOns?: object | undefined;
  readonly UserPoolTags?: Readonly<Record<string, string>> | undefined;
  readonly VerificationMessageTemplate?: object | undefined;
}

/**
 * Minimal structural sim Cognito CreateUserPool command.
 */
export interface SimCreateUserPoolCommand {
  readonly input: SimCreateUserPoolCommandInput;
}

export interface SimCreateUserPoolCommandOutput {
  readonly UserPool?: SimCognitoUserPoolType | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Cognito DescribeUserPool command.
 */
export interface SimDescribeUserPoolCommand {
  readonly input: SimDescribeUserPoolCommandInput;
}

export interface SimDescribeUserPoolCommandInput {
  readonly UserPoolId?: string | undefined;
}

export interface SimDescribeUserPoolCommandOutput {
  readonly UserPool?: SimCognitoUserPoolType | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Cognito DeleteUserPool command.
 */
export interface SimDeleteUserPoolCommand {
  readonly input: SimDeleteUserPoolCommandInput;
}

export interface SimDeleteUserPoolCommandInput {
  readonly UserPoolId?: string | undefined;
}

export interface SimDeleteUserPoolCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
