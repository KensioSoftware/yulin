import type { KeyObject } from "node:crypto";

import type { SimCognitoWebAuthnCeremony } from "./sim-cognito-web-authn-ceremony.js";
import type { SimCognitoWebAuthnCredentialDescriptor } from "./sim-cognito-web-authn-document.js";
import { simCognitoWebAuthnVerified } from "./sim-cognito-web-authn-signing.js";

/**
 * One registered passkey as `ListWebAuthnCredentials` reports it.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_WebAuthnCredentialDescription.html
 */
export interface SimCognitoWebAuthnCredentialDescription {
  readonly CredentialId?: string | undefined;
  readonly FriendlyCredentialName?: string | undefined;
  readonly RelyingPartyId?: string | undefined;
  readonly AuthenticatorAttachment?: string | undefined;
  readonly AuthenticatorTransports?: readonly string[] | undefined;
  readonly CreatedAt?: Date | undefined;
}

interface SimCognitoWebAuthnCredentialProperties {
  readonly credentialId: string;
  readonly publicKey: KeyObject;
  readonly relyingPartyId: string;
  readonly authenticatorAttachment: string;
  readonly transports: readonly string[];
  readonly createdAt: Date;
}

/**
 * One passkey a user has registered, as the pool holds it.
 *
 * What the pool keeps is the public half: an identifier the authenticator
 * allocated, the key that identifier's signatures can be checked against, and
 * the relying party the pair was registered for. The private half never
 * reaches a pool, on real Cognito or here.
 *
 * `FriendlyCredentialName` is the relying party id. Real Cognito reads the
 * authenticator's own model out of the attestation and names the credential
 * after it, which needs a device this simulation does not have.
 */
export class SimCognitoWebAuthnCredential {
  public readonly credentialId: string;
  public readonly relyingPartyId: string;
  public readonly authenticatorAttachment: string;
  public readonly transports: readonly string[];
  public readonly createdAt: Date;

  /**
   * The key this credential's signatures are checked against. It is the public
   * half of the pair the authenticator made, and it is what a sign-in
   * presenting the passkey reads.
   */
  public readonly publicKey: KeyObject;

  constructor(properties: SimCognitoWebAuthnCredentialProperties) {
    this.credentialId = properties.credentialId;
    this.relyingPartyId = properties.relyingPartyId;
    this.authenticatorAttachment = properties.authenticatorAttachment;
    this.transports = properties.transports;
    this.createdAt = properties.createdAt;
    this.publicKey = properties.publicKey;
  }

  /**
   * Whether this passkey is what signed a ceremony.
   *
   * The signature covers the authenticator data and a hash of the client data,
   * so a credential replayed with either of them changed fails here even
   * though both were read successfully.
   */
  signed(ceremony: SimCognitoWebAuthnCeremony, signature: Buffer): boolean {
    return simCognitoWebAuthnVerified(
      this.publicKey,
      ceremony.authenticatorData,
      ceremony.clientDataJson,
      signature,
    );
  }

  /**
   * This credential as a ceremony's options name it, which is what a
   * registration excludes and a sign-in allows.
   */
  descriptor(): SimCognitoWebAuthnCredentialDescriptor {
    return {
      type: "public-key",
      id: this.credentialId,
      transports: this.transports,
    };
  }

  /**
   * This credential as `ListWebAuthnCredentials` reports it.
   */
  toOutput(): SimCognitoWebAuthnCredentialDescription {
    return {
      CredentialId: this.credentialId,
      FriendlyCredentialName: this.relyingPartyId,
      RelyingPartyId: this.relyingPartyId,
      AuthenticatorAttachment: this.authenticatorAttachment,
      AuthenticatorTransports: this.transports,
      CreatedAt: this.createdAt,
    };
  }
}
