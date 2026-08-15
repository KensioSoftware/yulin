import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCognitoUserPoolMfaType } from "../../user-pool/mfa/sim-cognito-user-pool-mfa.js";

/**
 * The SetUserPoolMfaConfig inputs this simulation reads, and the ones it
 * refuses.
 *
 * `SmsMfaConfiguration` and `EmailMfaConfiguration` are the refused two. A
 * factor sent by SMS needs the pool's `SmsConfiguration` and one sent by email
 * needs its `EmailConfiguration`, both of which are refused on
 * `CreateUserPool`, so a pool here could not deliver either message.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/SetUserPoolMfaConfigCommand/
 */
export interface SimSetUserPoolMfaConfigCommandInput extends SimCognitoUserPoolMfaType {
  readonly UserPoolId?: string | undefined;
  readonly SmsMfaConfiguration?: object | undefined;
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
