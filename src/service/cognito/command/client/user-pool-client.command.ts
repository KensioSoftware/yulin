import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCognitoTokenValidityUnitsType } from "../../user-pool/client/sim-cognito-token-validity.js";
import type { SimCognitoOAuthSettingsType } from "../../user-pool/client/sim-cognito-oauth-settings.js";
import type { SimCognitoRefreshTokenRotationType } from "../../user-pool/client/sim-cognito-refresh-token-rotation.js";

/**
 * An app client as sim Cognito reports it.
 *
 * Only the properties this simulation models appear. Real Cognito reports
 * more, including the per-client attribute permissions and the analytics
 * configuration.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_UserPoolClientType.html
 */
export interface SimCognitoUserPoolClientType extends SimCognitoOAuthSettingsType {
  readonly ClientId?: string | undefined;
  readonly ClientName?: string | undefined;
  readonly UserPoolId?: string | undefined;
  readonly ClientSecret?: string | undefined;
  readonly ExplicitAuthFlows?: readonly string[] | undefined;
  readonly PreventUserExistenceErrors?: string | undefined;
  readonly AccessTokenValidity?: number | undefined;
  readonly IdTokenValidity?: number | undefined;
  readonly RefreshTokenValidity?: number | undefined;
  readonly AuthSessionValidity?: number | undefined;
  readonly RefreshTokenRotation?:
    | SimCognitoRefreshTokenRotationType
    | undefined;
  readonly TokenValidityUnits?: SimCognitoTokenValidityUnitsType | undefined;
  readonly CreationDate?: Date | undefined;
  readonly LastModifiedDate?: Date | undefined;
}

/**
 * The app client settings `CreateUserPoolClient` and `UpdateUserPoolClient`
 * both take, which is every one of them apart from the client's secret.
 *
 * Every input real Cognito accepts is named here, whether or not it is
 * simulated, so a request carrying one this simulation does not model can be
 * refused rather than silently ignored.
 *
 * `ClientSecret` is among them although only `CreateUserPoolClient` has it on
 * real Cognito. It is refused either way, so a request that reached this
 * simulation with one is told why rather than ignored.
 */
export interface SimCognitoUserPoolClientSettingsInput {
  readonly UserPoolId?: string | undefined;
  readonly ClientName?: string | undefined;
  readonly ExplicitAuthFlows?: readonly string[] | undefined;
  readonly AccessTokenValidity?: number | undefined;
  readonly IdTokenValidity?: number | undefined;
  readonly RefreshTokenValidity?: number | undefined;
  readonly TokenValidityUnits?: SimCognitoTokenValidityUnitsType | undefined;
  readonly AllowedOAuthFlows?: readonly string[] | undefined;
  readonly AllowedOAuthFlowsUserPoolClient?: boolean | undefined;
  readonly AllowedOAuthScopes?: readonly string[] | undefined;
  readonly AnalyticsConfiguration?: object | undefined;
  readonly AuthSessionValidity?: number | undefined;
  readonly CallbackURLs?: readonly string[] | undefined;
  readonly ClientSecret?: string | undefined;
  readonly DefaultRedirectURI?: string | undefined;
  readonly EnablePropagateAdditionalUserContextData?: boolean | undefined;
  readonly EnableTokenRevocation?: boolean | undefined;
  readonly LogoutURLs?: readonly string[] | undefined;
  readonly PreventUserExistenceErrors?: string | undefined;
  readonly ReadAttributes?: readonly string[] | undefined;
  readonly RefreshTokenRotation?:
    | SimCognitoRefreshTokenRotationType
    | undefined;
  readonly SupportedIdentityProviders?: readonly string[] | undefined;
  readonly WriteAttributes?: readonly string[] | undefined;
}

/**
 * The CreateUserPoolClient inputs this simulation reads, and the ones it
 * refuses.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/CreateUserPoolClientCommand/
 */
export interface SimCreateUserPoolClientCommandInput extends SimCognitoUserPoolClientSettingsInput {
  readonly GenerateSecret?: boolean | undefined;
}

/**
 * Minimal structural sim Cognito CreateUserPoolClient command.
 */
export interface SimCreateUserPoolClientCommand {
  readonly input: SimCreateUserPoolClientCommandInput;
}

export interface SimCreateUserPoolClientCommandOutput {
  readonly UserPoolClient?: SimCognitoUserPoolClientType | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * The UpdateUserPoolClient inputs, which are the settings
 * `CreateUserPoolClient` takes against a client that already exists.
 *
 * There is no `GenerateSecret` here, as there is none on real Cognito: an
 * update cannot give a client a secret or take one away.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/UpdateUserPoolClientCommand/
 */
export interface SimUpdateUserPoolClientCommandInput extends SimCognitoUserPoolClientSettingsInput {
  readonly ClientId?: string | undefined;
}

/**
 * Minimal structural sim Cognito UpdateUserPoolClient command.
 */
export interface SimUpdateUserPoolClientCommand {
  readonly input: SimUpdateUserPoolClientCommandInput;
}

export interface SimUpdateUserPoolClientCommandOutput {
  readonly UserPoolClient?: SimCognitoUserPoolClientType | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Cognito DescribeUserPoolClient command.
 */
export interface SimDescribeUserPoolClientCommand {
  readonly input: SimDescribeUserPoolClientCommandInput;
}

export interface SimDescribeUserPoolClientCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly ClientId?: string | undefined;
}

export interface SimDescribeUserPoolClientCommandOutput {
  readonly UserPoolClient?: SimCognitoUserPoolClientType | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Cognito DeleteUserPoolClient command.
 */
export interface SimDeleteUserPoolClientCommand {
  readonly input: SimDeleteUserPoolClientCommandInput;
}

export interface SimDeleteUserPoolClientCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly ClientId?: string | undefined;
}

export interface SimDeleteUserPoolClientCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
