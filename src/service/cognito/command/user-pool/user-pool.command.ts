import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCognitoAdminCreateUserConfigType } from "../../user-pool/sim-cognito-admin-create-user-config.js";
import type { SimCognitoUserPoolPoliciesType } from "../../user-pool/sim-cognito-password-policy.js";
import type { SimCognitoVerificationMessagesType } from "../../user-pool/message/sim-cognito-verification-messages.js";
import type { SimCognitoUnsimulatedPoolSettingsType } from "../../user-pool/sim-cognito-unsimulated-pool-settings.js";
import type { SimCognitoSchemaAttributeType } from "../../user-pool/schema/sim-cognito-schema-attribute.js";
import type { SimCognitoUserPoolSettingsInput } from "../../user-pool/sim-cognito-user-pool-settings.js";
import type { SimCognitoLambdaConfigType } from "../../user-pool/trigger/sim-cognito-lambda-config.js";

/**
 * A user pool as sim Cognito reports it.
 *
 * Only the properties this simulation models appear, alongside the ones it
 * accepts without acting on and reports back so a request's intent stays
 * visible.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_UserPoolType.html
 */
export interface SimCognitoUserPoolType
  extends
    SimCognitoUnsimulatedPoolSettingsType,
    SimCognitoVerificationMessagesType {
  readonly Id?: string | undefined;
  readonly Name?: string | undefined;
  readonly Arn?: string | undefined;
  readonly Policies?: SimCognitoUserPoolPoliciesType | undefined;
  readonly DeletionProtection?: string | undefined;
  readonly LambdaConfig?: SimCognitoLambdaConfigType | undefined;
  readonly MfaConfiguration?: string | undefined;
  readonly AdminCreateUserConfig?:
    | SimCognitoAdminCreateUserConfigType
    | undefined;
  readonly AutoVerifiedAttributes?: readonly string[] | undefined;
  readonly SchemaAttributes?:
    | readonly SimCognitoSchemaAttributeType[]
    | undefined;
  readonly EstimatedNumberOfUsers?: number | undefined;
  readonly CreationDate?: Date | undefined;
  readonly LastModifiedDate?: Date | undefined;
}

/**
 * The pool inputs `CreateUserPool` and `UpdateUserPool` both carry.
 *
 * Every input real Cognito accepts on both is named here, whether or not it
 * is simulated, so a request carrying one this simulation does not model can
 * be refused rather than silently ignored. The ones a pool acts on are on the
 * settings input this extends, `MfaConfiguration` among them.
 */
export interface SimCognitoUserPoolCommandInput extends SimCognitoUserPoolSettingsInput {
  readonly UserPoolTier?: string | undefined;
  readonly DeviceConfiguration?: object | undefined;
  readonly EmailConfiguration?: object | undefined;
  readonly IssuerConfiguration?: object | undefined;
  readonly KeyConfiguration?: object | undefined;
  readonly SmsAuthenticationMessage?: string | undefined;
  readonly SmsConfiguration?: object | undefined;
  readonly UserAttributeUpdateSettings?: object | undefined;
  readonly UserPoolAddOns?: object | undefined;
  readonly UserPoolTags?: Readonly<Record<string, string>> | undefined;
}

/**
 * The CreateUserPool inputs this simulation reads, and the ones it refuses.
 *
 * The three beside the shared ones are the inputs only a creation carries.
 * They decide how a pool identifies its users, and none of them can be
 * changed afterwards on real Cognito either.
 *
 * `Schema` is a creation-only input too, and is named among the shared
 * settings because it is a pool's schema that is built from it.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/CreateUserPoolCommand/
 */
export interface SimCreateUserPoolCommandInput extends SimCognitoUserPoolCommandInput {
  readonly PoolName?: string | undefined;
  readonly AliasAttributes?: readonly string[] | undefined;
  readonly UsernameAttributes?: readonly string[] | undefined;
  readonly UsernameConfiguration?: object | undefined;
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
 * The UpdateUserPool inputs this simulation reads, and the ones it refuses.
 *
 * `PoolName` is among the refused ones. Real `UpdateUserPool` renames a pool
 * with it, and nothing here does, so a request carrying it is refused rather
 * than answered with a pool still under its old name.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/UpdateUserPoolCommand/
 */
export interface SimUpdateUserPoolCommandInput extends SimCognitoUserPoolCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly PoolName?: string | undefined;
}

/**
 * Minimal structural sim Cognito UpdateUserPool command.
 */
export interface SimUpdateUserPoolCommand {
  readonly input: SimUpdateUserPoolCommandInput;
}

/**
 * What `UpdateUserPool` answers with, which is nothing but the metadata: real
 * Cognito reports no pool back, so a caller reads the change with
 * `DescribeUserPool`.
 */
export interface SimUpdateUserPoolCommandOutput {
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
