import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * The tokens a successful authentication answers with.
 *
 * `AccessToken` and `IdToken` are real RS256 JWTs, signed by the key the pool
 * publishes in its JWKS. `RefreshToken` is an opaque string, as it is on real
 * Cognito, and a token refresh answers without one.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AuthenticationResultType.html
 */
export interface SimCognitoAuthenticationResultType {
  readonly AccessToken?: string | undefined;
  readonly IdToken?: string | undefined;
  readonly RefreshToken?: string | undefined;
  readonly ExpiresIn?: number | undefined;
  readonly TokenType?: string | undefined;
}

/**
 * The AdminInitiateAuth inputs this simulation reads, and the ones it refuses.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/AdminInitiateAuthCommand/
 */
export interface SimAdminInitiateAuthCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly ClientId?: string | undefined;
  readonly AuthFlow?: string | undefined;
  readonly AuthParameters?: Readonly<Record<string, string>> | undefined;
  readonly ClientMetadata?: Readonly<Record<string, string>> | undefined;
  readonly AnalyticsMetadata?: object | undefined;
  readonly ContextData?: object | undefined;
  readonly Session?: string | undefined;
}

/**
 * Minimal structural sim Cognito AdminInitiateAuth command.
 */
export interface SimAdminInitiateAuthCommand {
  readonly input: SimAdminInitiateAuthCommandInput;
}

/**
 * What starting an authentication answers with: either the tokens, or the
 * challenge and session that stand between the user and them.
 *
 * `AdminInitiateAuth` and `InitiateAuth` answer the same way, as do the two
 * challenge responses, so they share this shape.
 */
export interface SimCognitoAuthenticationOutput {
  readonly ChallengeName?: string | undefined;
  readonly Session?: string | undefined;
  readonly ChallengeParameters?: Readonly<Record<string, string>> | undefined;
  readonly AuthenticationResult?:
    | SimCognitoAuthenticationResultType
    | undefined;
  readonly $metadata: SimResponseMetadata;
}

export type SimAdminInitiateAuthCommandOutput = SimCognitoAuthenticationOutput;

/**
 * The AdminRespondToAuthChallenge inputs this simulation reads, and the ones
 * it refuses.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/AdminRespondToAuthChallengeCommand/
 */
export interface SimAdminRespondToAuthChallengeCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly ClientId?: string | undefined;
  readonly ChallengeName?: string | undefined;
  readonly ChallengeResponses?: Readonly<Record<string, string>> | undefined;
  readonly Session?: string | undefined;
  readonly ClientMetadata?: Readonly<Record<string, string>> | undefined;
  readonly AnalyticsMetadata?: object | undefined;
  readonly ContextData?: object | undefined;
}

/**
 * Minimal structural sim Cognito AdminRespondToAuthChallenge command.
 */
export interface SimAdminRespondToAuthChallengeCommand {
  readonly input: SimAdminRespondToAuthChallengeCommandInput;
}

export type SimAdminRespondToAuthChallengeCommandOutput =
  SimCognitoAuthenticationOutput;

/**
 * The InitiateAuth inputs this simulation reads, and the ones it refuses.
 *
 * There is no `UserPoolId`: an app client id is enough to find the pool, as it
 * is on real Cognito. `UserContextData` is the client-side counterpart of the
 * admin operations' `ContextData`.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/InitiateAuthCommand/
 */
export interface SimInitiateAuthCommandInput {
  readonly ClientId?: string | undefined;
  readonly AuthFlow?: string | undefined;
  readonly AuthParameters?: Readonly<Record<string, string>> | undefined;
  readonly ClientMetadata?: Readonly<Record<string, string>> | undefined;
  readonly AnalyticsMetadata?: object | undefined;
  readonly UserContextData?: object | undefined;
  readonly Session?: string | undefined;
}

/**
 * Minimal structural sim Cognito InitiateAuth command.
 */
export interface SimInitiateAuthCommand {
  readonly input: SimInitiateAuthCommandInput;
}

export type SimInitiateAuthCommandOutput = SimCognitoAuthenticationOutput;

/**
 * The RespondToAuthChallenge inputs this simulation reads, and the ones it
 * refuses.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/RespondToAuthChallengeCommand/
 */
export interface SimRespondToAuthChallengeCommandInput {
  readonly ClientId?: string | undefined;
  readonly ChallengeName?: string | undefined;
  readonly ChallengeResponses?: Readonly<Record<string, string>> | undefined;
  readonly Session?: string | undefined;
  readonly ClientMetadata?: Readonly<Record<string, string>> | undefined;
  readonly AnalyticsMetadata?: object | undefined;
  readonly UserContextData?: object | undefined;
}

/**
 * Minimal structural sim Cognito RespondToAuthChallenge command.
 */
export interface SimRespondToAuthChallengeCommand {
  readonly input: SimRespondToAuthChallengeCommandInput;
}

export type SimRespondToAuthChallengeCommandOutput =
  SimCognitoAuthenticationOutput;

/**
 * The GlobalSignOut inputs this simulation reads.
 *
 * The access token is what says which user and which pool the request is for,
 * so it is the only input there is.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/GlobalSignOutCommand/
 */
export interface SimGlobalSignOutCommandInput {
  readonly AccessToken?: string | undefined;
}

/**
 * Minimal structural sim Cognito GlobalSignOut command.
 */
export interface SimGlobalSignOutCommand {
  readonly input: SimGlobalSignOutCommandInput;
}

export interface SimGlobalSignOutCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * The AdminUserGlobalSignOut inputs this simulation reads.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/AdminUserGlobalSignOutCommand/
 */
export interface SimAdminUserGlobalSignOutCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly Username?: string | undefined;
}

/**
 * Minimal structural sim Cognito AdminUserGlobalSignOut command.
 */
export interface SimAdminUserGlobalSignOutCommand {
  readonly input: SimAdminUserGlobalSignOutCommandInput;
}

export interface SimAdminUserGlobalSignOutCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
