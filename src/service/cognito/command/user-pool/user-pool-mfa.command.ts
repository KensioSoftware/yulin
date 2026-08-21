import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCognitoUserPoolMfaType } from "../../user-pool/mfa/sim-cognito-user-pool-mfa.js";

/**
 * The SetUserPoolMfaConfig inputs this simulation reads, and the ones it
 * refuses.
 *
 * `EmailMfaConfiguration` is refused because the email one-time code challenge
 * is not simulated: nothing here issues one, checks one or expires one. A pool
 * whose `EmailConfiguration` sends through SES is no different, since what is
 * missing is the challenge rather than somewhere for the message to go. The
 * `SmsConfiguration` inside an `SmsMfaConfiguration` is refused for the reason
 * the pool's own is: no text message is delivered here, so the IAM role that
 * would send one is never assumed.
 *
 * `WebAuthnConfiguration` is read and recorded. It is what a passkey is
 * registered against, and what one is presented to at a sign-in.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/SetUserPoolMfaConfigCommand/
 */
export interface SimSetUserPoolMfaConfigCommandInput extends SimCognitoUserPoolMfaType {
  readonly UserPoolId?: string | undefined;
  readonly EmailMfaConfiguration?: object | undefined;
}

/**
 * Minimal structural sim Cognito SetUserPoolMfaConfig command.
 */
export interface SimSetUserPoolMfaConfigCommand {
  readonly input: SimSetUserPoolMfaConfigCommandInput;
}

/**
 * What `SetUserPoolMfaConfig` answers with, which is the configuration the
 * pool now has, as real Cognito answers.
 */
export interface SimSetUserPoolMfaConfigCommandOutput extends SimCognitoUserPoolMfaType {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Cognito GetUserPoolMfaConfig command.
 */
export interface SimGetUserPoolMfaConfigCommand {
  readonly input: SimGetUserPoolMfaConfigCommandInput;
}

export interface SimGetUserPoolMfaConfigCommandInput {
  readonly UserPoolId?: string | undefined;
}

export interface SimGetUserPoolMfaConfigCommandOutput extends SimCognitoUserPoolMfaType {
  readonly $metadata: SimResponseMetadata;
}
