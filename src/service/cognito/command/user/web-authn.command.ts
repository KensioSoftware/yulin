import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCognitoWebAuthnCredentialDescription } from "../../user-pool/user/web-authn/sim-cognito-web-authn-credential.js";
import type { SimCognitoWebAuthnCreationOptions } from "../../user-pool/user/web-authn/sim-cognito-web-authn-document.js";

/**
 * The StartWebAuthnRegistration inputs this simulation reads.
 *
 * The access token is the whole of the authorization, as it is on real
 * Cognito: a passkey is registered by the user it belongs to, from a session
 * that already exists, and no IAM policy is evaluated for it.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/StartWebAuthnRegistrationCommand/
 */
export interface SimStartWebAuthnRegistrationCommandInput {
  readonly AccessToken?: string | undefined;
}

/**
 * Minimal structural sim Cognito StartWebAuthnRegistration command.
 */
export interface SimStartWebAuthnRegistrationCommand {
  readonly input: SimStartWebAuthnRegistrationCommandInput;
}

export interface SimStartWebAuthnRegistrationCommandOutput {
  readonly CredentialCreationOptions?:
    | SimCognitoWebAuthnCreationOptions
    | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * The CompleteWebAuthnRegistration inputs this simulation reads.
 *
 * `Credential` is the JSON a browser serializes the `PublicKeyCredential` from
 * `navigator.credentials.create()` to, which is why it is a document rather
 * than a shape the API names.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/CompleteWebAuthnRegistrationCommand/
 */
export interface SimCompleteWebAuthnRegistrationCommandInput {
  readonly AccessToken?: string | undefined;
  readonly Credential?: unknown;
}

/**
 * Minimal structural sim Cognito CompleteWebAuthnRegistration command.
 */
export interface SimCompleteWebAuthnRegistrationCommand {
  readonly input: SimCompleteWebAuthnRegistrationCommandInput;
}

export interface SimCompleteWebAuthnRegistrationCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * The ListWebAuthnCredentials inputs this simulation reads.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/ListWebAuthnCredentialsCommand/
 */
export interface SimListWebAuthnCredentialsCommandInput {
  readonly AccessToken?: string | undefined;
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
}

/**
 * Minimal structural sim Cognito ListWebAuthnCredentials command.
 */
export interface SimListWebAuthnCredentialsCommand {
  readonly input: SimListWebAuthnCredentialsCommandInput;
}

export interface SimListWebAuthnCredentialsCommandOutput {
  readonly Credentials?:
    | readonly SimCognitoWebAuthnCredentialDescription[]
    | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * The DeleteWebAuthnCredential inputs this simulation reads.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/DeleteWebAuthnCredentialCommand/
 */
export interface SimDeleteWebAuthnCredentialCommandInput {
  readonly AccessToken?: string | undefined;
  readonly CredentialId?: string | undefined;
}

/**
 * Minimal structural sim Cognito DeleteWebAuthnCredential command.
 */
export interface SimDeleteWebAuthnCredentialCommand {
  readonly input: SimDeleteWebAuthnCredentialCommandInput;
}

export interface SimDeleteWebAuthnCredentialCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
