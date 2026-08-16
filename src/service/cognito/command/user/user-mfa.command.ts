import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCognitoMfaPreferenceType } from "../../user-pool/user/mfa/sim-cognito-mfa-factors.js";
import type {
  SimCognitoAdminUserCommandInput,
  SimCognitoSelfUser,
} from "./user.command.js";

/**
 * The AssociateSoftwareToken inputs this simulation reads.
 *
 * Real Cognito takes either an `AccessToken` or the `Session` of an
 * `MFA_SETUP` challenge. This simulation issues no such challenge, so a
 * request naming a `Session` is refused: the user has to be signed in for a
 * token to be registered here.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/AssociateSoftwareTokenCommand/
 */
export interface SimAssociateSoftwareTokenCommandInput {
  readonly AccessToken?: string | undefined;
  readonly Session?: string | undefined;
}

/**
 * Minimal structural sim Cognito AssociateSoftwareToken command.
 */
export interface SimAssociateSoftwareTokenCommand {
  readonly input: SimAssociateSoftwareTokenCommandInput;
}

export interface SimAssociateSoftwareTokenCommandOutput {
  readonly SecretCode?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * The VerifySoftwareToken inputs this simulation reads.
 *
 * `FriendlyDeviceName` is the name a user gives the authenticator app it just
 * registered. Device tracking is not simulated, so it is refused rather than
 * recorded against a device nothing here holds.
 */
export interface SimVerifySoftwareTokenCommandInput {
  readonly AccessToken?: string | undefined;
  readonly Session?: string | undefined;
  readonly UserCode?: string | undefined;
  readonly FriendlyDeviceName?: string | undefined;
}

/**
 * Minimal structural sim Cognito VerifySoftwareToken command.
 */
export interface SimVerifySoftwareTokenCommand {
  readonly input: SimVerifySoftwareTokenCommandInput;
}

export interface SimVerifySoftwareTokenCommandOutput {
  readonly Status?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * The SetUserMFAPreference inputs this simulation reads, and the one it
 * refuses.
 *
 * `EmailMfaSettings` is refused because a second factor sent by email needs
 * the pool's `EmailConfiguration`, which `CreateUserPool` refuses, and
 * `SetUserPoolMfaConfig` refuses the matching `EmailMfaConfiguration` for the
 * same reason.
 */
export interface SimSetUserMFAPreferenceCommandInput extends SimCognitoMfaPreferenceType {
  readonly AccessToken?: string | undefined;
  readonly EmailMfaSettings?: object | undefined;
}

/**
 * Minimal structural sim Cognito SetUserMFAPreference command.
 */
export interface SimSetUserMFAPreferenceCommand {
  readonly input: SimSetUserMFAPreferenceCommandInput;
}

export interface SimSetUserMFAPreferenceCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * The AdminSetUserMFAPreference inputs, which are the same settings named
 * against a pool and a username rather than against an access token.
 */
export interface SimAdminSetUserMFAPreferenceCommandInput
  extends SimCognitoAdminUserCommandInput, SimCognitoMfaPreferenceType {
  readonly EmailMfaSettings?: object | undefined;
}

/**
 * Minimal structural sim Cognito AdminSetUserMFAPreference command.
 */
export interface SimAdminSetUserMFAPreferenceCommand {
  readonly input: SimAdminSetUserMFAPreferenceCommandInput;
}

export interface SimAdminSetUserMFAPreferenceCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * The GetUser inputs, which are the access token of the user reading itself.
 */
export interface SimGetUserCommandInput {
  readonly AccessToken?: string | undefined;
}

/**
 * Minimal structural sim Cognito GetUser command.
 */
export interface SimGetUserCommand {
  readonly input: SimGetUserCommandInput;
}

/**
 * What `GetUser` answers with, which is the user reading itself.
 *
 * The attributes arrive under `UserAttributes`, as they do in an
 * `AdminGetUser` response, and there is no `UserStatus`: real Cognito reports
 * a status to an administrator and not to the user itself.
 */
export interface SimGetUserCommandOutput extends SimCognitoSelfUser {
  readonly $metadata: SimResponseMetadata;
}
