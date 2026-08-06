import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCognitoAttributeType } from "../../user-pool/user/sim-cognito-user-attributes.js";

/**
 * What every client-side sign-up operation names: the app client, and the user
 * signing up.
 *
 * There is no `UserPoolId` in any of them. These are what a browser or mobile
 * app calls, and an app client id is enough to find the pool, as it is on real
 * Cognito. `SecretHash` is what a client created with a secret has to send.
 */
export interface SimCognitoSignUpCommandInput {
  readonly ClientId?: string | undefined;
  readonly Username?: string | undefined;
  readonly SecretHash?: string | undefined;
  readonly ClientMetadata?: Readonly<Record<string, string>> | undefined;
  readonly AnalyticsMetadata?: object | undefined;
  readonly UserContextData?: object | undefined;
}

/**
 * The SignUp inputs this simulation reads, and the ones it refuses.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/SignUpCommand/
 */
export interface SimSignUpCommandInput extends SimCognitoSignUpCommandInput {
  readonly Password?: string | undefined;
  readonly UserAttributes?: readonly SimCognitoAttributeType[] | undefined;
  readonly ValidationData?: readonly SimCognitoAttributeType[] | undefined;
}

/**
 * Minimal structural sim Cognito SignUp command.
 */
export interface SimSignUpCommand {
  readonly input: SimSignUpCommandInput;
}

/**
 * What a sign-up answers with.
 *
 * `UserConfirmed` is true only where the pool's pre sign-up Lambda trigger
 * answered `autoConfirmUser`, which is the one way a user is confirmed at
 * sign-up. There is no `CodeDeliveryDetails`: real Cognito reports where it
 * sent the confirmation code, and nothing here sends one anywhere.
 */
export interface SimSignUpCommandOutput {
  readonly UserConfirmed?: boolean | undefined;
  readonly UserSub?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * The ConfirmSignUp inputs this simulation reads, and the ones it refuses.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/ConfirmSignUpCommand/
 */
export interface SimConfirmSignUpCommandInput extends SimCognitoSignUpCommandInput {
  readonly ConfirmationCode?: string | undefined;
  readonly ForceAliasCreation?: boolean | undefined;
  readonly Session?: string | undefined;
}

/**
 * Minimal structural sim Cognito ConfirmSignUp command.
 */
export interface SimConfirmSignUpCommand {
  readonly input: SimConfirmSignUpCommandInput;
}

export interface SimConfirmSignUpCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Cognito ResendConfirmationCode command.
 */
export interface SimResendConfirmationCodeCommand {
  readonly input: SimCognitoSignUpCommandInput;
}

/**
 * What resending answers with, which is nothing beyond the metadata.
 *
 * Real Cognito reports the `CodeDeliveryDetails` of the message it sent. No
 * message is sent here, so the fresh code is read from the pool instead.
 */
export interface SimResendConfirmationCodeCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * The AdminConfirmSignUp inputs, which are all simulated.
 *
 * This is the admin side of confirming, so it names the pool and the user
 * rather than an app client, and no confirmation code is involved at all.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/AdminConfirmSignUpCommand/
 */
export interface SimAdminConfirmSignUpCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly Username?: string | undefined;
  readonly ClientMetadata?: Readonly<Record<string, string>> | undefined;
}

/**
 * Minimal structural sim Cognito AdminConfirmSignUp command.
 */
export interface SimAdminConfirmSignUpCommand {
  readonly input: SimAdminConfirmSignUpCommandInput;
}

export interface SimAdminConfirmSignUpCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
