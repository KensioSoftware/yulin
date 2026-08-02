import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCognitoTokenValidityUnitsType } from "../../user-pool/client/sim-cognito-token-validity.js";
import type { SimCognitoUnsimulatedClientSettingsType } from "../../user-pool/client/sim-cognito-unsimulated-client-settings.js";

/**
 * An app client as sim Cognito reports it.
 *
 * Only the properties this simulation models appear, alongside the two
 * managed login settings it accepts without acting on and reports back so a
 * request's intent stays visible. Real Cognito reports more, including the
 * rest of the OAuth settings.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_UserPoolClientType.html
 */
export interface SimCognitoUserPoolClientType extends SimCognitoUnsimulatedClientSettingsType {
  readonly ClientId?: string | undefined;
  readonly ClientName?: string | undefined;
  readonly UserPoolId?: string | undefined;
  readonly ClientSecret?: string | undefined;
  readonly ExplicitAuthFlows?: readonly string[] | undefined;
  readonly PreventUserExistenceErrors?: string | undefined;
  readonly AccessTokenValidity?: number | undefined;
  readonly IdTokenValidity?: number | undefined;
  readonly RefreshTokenValidity?: number | undefined;
  readonly TokenValidityUnits?: SimCognitoTokenValidityUnitsType | undefined;
  readonly CreationDate?: Date | undefined;
  readonly LastModifiedDate?: Date | undefined;
}

/**
 * The CreateUserPoolClient inputs this simulation reads, and the ones it
 * refuses.
 *
 * Every input real Cognito accepts is named here, whether or not it is
 * simulated, so a request carrying one this simulation does not model can be
 * refused rather than silently ignored.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/CreateUserPoolClientCommand/
 */
export interface SimCreateUserPoolClientCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly ClientName?: string | undefined;
  readonly GenerateSecret?: boolean | undefined;
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
  readonly RefreshTokenRotation?: object | undefined;
  readonly SupportedIdentityProviders?: readonly string[] | undefined;
  readonly WriteAttributes?: readonly string[] | undefined;
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
