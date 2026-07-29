import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCognitoAttributeType } from "../../user-pool/user/sim-cognito-user-attributes.js";

/**
 * A user as sim Cognito reports it in `AdminCreateUser` and `ListUsers`.
 *
 * The attributes arrive under `Attributes` here and under `UserAttributes` in
 * an `AdminGetUser` response. Real Cognito names them differently in the two
 * places, so code reading the wrong one finds nothing here as well.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_UserType.html
 */
export interface SimCognitoUserType {
  readonly Username?: string | undefined;
  readonly Attributes?: readonly SimCognitoAttributeType[] | undefined;
  readonly UserCreateDate?: Date | undefined;
  readonly UserLastModifiedDate?: Date | undefined;
  readonly Enabled?: boolean | undefined;
  readonly UserStatus?: string | undefined;
}

/**
 * A user as `AdminGetUser` reports it, which is a user pool response rather
 * than a `UserType`.
 */
export interface SimCognitoDescribedUser {
  readonly Username?: string | undefined;
  readonly UserAttributes?: readonly SimCognitoAttributeType[] | undefined;
  readonly UserCreateDate?: Date | undefined;
  readonly UserLastModifiedDate?: Date | undefined;
  readonly Enabled?: boolean | undefined;
  readonly UserStatus?: string | undefined;
}

/**
 * What every admin user operation names: the pool, and the user in it.
 */
export interface SimCognitoAdminUserCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly Username?: string | undefined;
}

/**
 * The AdminCreateUser inputs this simulation reads, and the ones it refuses.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/AdminCreateUserCommand/
 */
export interface SimAdminCreateUserCommandInput extends SimCognitoAdminUserCommandInput {
  readonly UserAttributes?: readonly SimCognitoAttributeType[] | undefined;
  readonly TemporaryPassword?: string | undefined;
  readonly MessageAction?: string | undefined;
  readonly DesiredDeliveryMediums?: readonly string[] | undefined;
  readonly ForceAliasCreation?: boolean | undefined;
  readonly ValidationData?: readonly SimCognitoAttributeType[] | undefined;
  readonly ClientMetadata?: Readonly<Record<string, string>> | undefined;
}

/**
 * Minimal structural sim Cognito AdminCreateUser command.
 */
export interface SimAdminCreateUserCommand {
  readonly input: SimAdminCreateUserCommandInput;
}

export interface SimAdminCreateUserCommandOutput {
  readonly User?: SimCognitoUserType | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Cognito AdminGetUser command.
 */
export interface SimAdminGetUserCommand {
  readonly input: SimCognitoAdminUserCommandInput;
}

export interface SimAdminGetUserCommandOutput extends SimCognitoDescribedUser {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Cognito AdminDeleteUser command.
 */
export interface SimAdminDeleteUserCommand {
  readonly input: SimCognitoAdminUserCommandInput;
}

export interface SimAdminDeleteUserCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * The AdminSetUserPassword inputs, which are all simulated.
 *
 * `Permanent` is the one that matters: without it the password is temporary,
 * and the user is left in `FORCE_CHANGE_PASSWORD` unable to sign in normally.
 */
export interface SimAdminSetUserPasswordCommandInput extends SimCognitoAdminUserCommandInput {
  readonly Password?: string | undefined;
  readonly Permanent?: boolean | undefined;
}

/**
 * Minimal structural sim Cognito AdminSetUserPassword command.
 */
export interface SimAdminSetUserPasswordCommand {
  readonly input: SimAdminSetUserPasswordCommandInput;
}

export interface SimAdminSetUserPasswordCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * The AdminUpdateUserAttributes inputs this simulation reads, and the one it
 * refuses.
 */
export interface SimAdminUpdateUserAttributesCommandInput extends SimCognitoAdminUserCommandInput {
  readonly UserAttributes?: readonly SimCognitoAttributeType[] | undefined;
  readonly ClientMetadata?: Readonly<Record<string, string>> | undefined;
}

/**
 * Minimal structural sim Cognito AdminUpdateUserAttributes command.
 */
export interface SimAdminUpdateUserAttributesCommand {
  readonly input: SimAdminUpdateUserAttributesCommandInput;
}

export interface SimAdminUpdateUserAttributesCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Cognito AdminDisableUser command.
 */
export interface SimAdminDisableUserCommand {
  readonly input: SimCognitoAdminUserCommandInput;
}

export interface SimAdminDisableUserCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Cognito AdminEnableUser command.
 */
export interface SimAdminEnableUserCommand {
  readonly input: SimCognitoAdminUserCommandInput;
}

export interface SimAdminEnableUserCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
