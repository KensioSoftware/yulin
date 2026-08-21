/**
 * A value as an SDK document input carries one, which is JSON and no more.
 *
 * `Credential` on `CompleteWebAuthnRegistration` is a document rather than a
 * shape the API names, so a credential built here is written to be assignable
 * to one. That is what lets a test pass the credential straight to the SDK
 * Command without casting it first.
 */
export type SimCognitoWebAuthnDocumentValue =
  | null
  | boolean
  | number
  | string
  | SimCognitoWebAuthnDocumentValue[]
  | { [member: string]: SimCognitoWebAuthnDocumentValue };

/**
 * The relying party a credential is created for.
 */
export interface SimCognitoWebAuthnRelyingParty {
  readonly id: string;
  readonly name: string;
}

/**
 * The user a credential is created for, as WebAuthn names one: an opaque
 * handle the authenticator stores, and the names it shows a person.
 */
export interface SimCognitoWebAuthnUserEntity {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
}

/**
 * One credential named in a ceremony's options, either to exclude from a
 * registration or to allow at a sign-in.
 */
export interface SimCognitoWebAuthnCredentialDescriptor {
  readonly type: "public-key";
  readonly id: string;
  readonly transports: readonly string[];
}

/**
 * What `StartWebAuthnRegistration` answers with, which a browser passes
 * straight to `navigator.credentials.create()`.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_StartWebAuthnRegistration.html
 */
export interface SimCognitoWebAuthnCreationOptions {
  readonly challenge: string;
  readonly rp: SimCognitoWebAuthnRelyingParty;
  readonly user: SimCognitoWebAuthnUserEntity;
  readonly pubKeyCredParams: readonly {
    readonly type: "public-key";
    readonly alg: number;
  }[];
  readonly timeout: number;
  readonly excludeCredentials: readonly SimCognitoWebAuthnCredentialDescriptor[];
  readonly authenticatorSelection: {
    readonly residentKey: string;
    readonly requireResidentKey: boolean;
    readonly userVerification: string;
  };
  readonly attestation: string;
}

/**
 * What a `WEB_AUTHN` challenge carries, which a browser passes straight to
 * `navigator.credentials.get()`.
 */
export interface SimCognitoWebAuthnRequestOptions {
  readonly challenge: string;
  readonly rpId: string;
  readonly timeout: number;
  readonly allowCredentials: readonly SimCognitoWebAuthnCredentialDescriptor[];
  readonly userVerification: string;
}

/**
 * The half of a credential an authenticator fills in when it creates one.
 *
 * `attestationObject` is where a real authenticator states what kind of device
 * it is. Nothing here reads one, and the public key is read from `publicKey`
 * instead, which is the field a browser's own JSON serialization carries it
 * in.
 */
export interface SimCognitoWebAuthnAttestationResponse {
  [member: string]: SimCognitoWebAuthnDocumentValue;
  readonly clientDataJSON: string;
  readonly attestationObject: string;
  readonly authenticatorData: string;
  readonly publicKey: string;
  readonly publicKeyAlgorithm: number;
  readonly transports: string[];
}

/**
 * The half of a credential an authenticator fills in when it presents one.
 */
export interface SimCognitoWebAuthnAssertionResponse {
  [member: string]: SimCognitoWebAuthnDocumentValue;
  readonly clientDataJSON: string;
  readonly authenticatorData: string;
  readonly signature: string;
  readonly userHandle: string;
}

/**
 * A credential as a browser serializes one, which is what
 * `CompleteWebAuthnRegistration` and a `WEB_AUTHN` challenge response carry.
 */
export interface SimCognitoWebAuthnCredentialDocument {
  [member: string]: SimCognitoWebAuthnDocumentValue;
  readonly id: string;
  readonly rawId: string;
  readonly type: "public-key";
  readonly authenticatorAttachment: string;
  readonly response:
    | SimCognitoWebAuthnAttestationResponse
    | SimCognitoWebAuthnAssertionResponse;
  readonly clientExtensionResults: Record<string, never>;
}
