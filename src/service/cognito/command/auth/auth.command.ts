import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * The tokens a successful authentication answers with.
 *
 * `AccessToken` and `IdToken` are real RS256 JWTs, signed by the key the pool
 * publishes in its JWKS. `RefreshToken` is an opaque string, as it is on real
 * Cognito, and nothing here consumes it.
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

export interface SimAdminInitiateAuthCommandOutput {
  readonly ChallengeName?: string | undefined;
  readonly Session?: string | undefined;
  readonly ChallengeParameters?: Readonly<Record<string, string>> | undefined;
  readonly AuthenticationResult?:
    SimCognitoAuthenticationResultType | undefined;
  readonly $metadata: SimResponseMetadata;
}

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

export interface SimAdminRespondToAuthChallengeCommandOutput {
  readonly ChallengeName?: string | undefined;
  readonly Session?: string | undefined;
  readonly ChallengeParameters?: Readonly<Record<string, string>> | undefined;
  readonly AuthenticationResult?:
    SimCognitoAuthenticationResultType | undefined;
  readonly $metadata: SimResponseMetadata;
}
