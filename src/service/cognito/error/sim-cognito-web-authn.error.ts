import { SimCognitoError } from "./sim-cognito.error.js";

/**
 * Simulated Cognito WebAuthnConfigurationMissingException error.
 *
 * Real Cognito reports a passkey operation against a pool that has no relying
 * party id this way. A passkey is registered against a domain, so a pool that
 * names none has nothing to register one against.
 */
export class SimCognitoWebAuthnConfigurationMissingException extends SimCognitoError {
  public override readonly name = "WebAuthnConfigurationMissingException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Cognito WebAuthnChallengeNotFoundException error.
 *
 * Real Cognito reports a credential answering a challenge it never issued this
 * way, which covers a registration nobody started and one already completed.
 */
export class SimCognitoWebAuthnChallengeNotFoundException extends SimCognitoError {
  public override readonly name = "WebAuthnChallengeNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Cognito WebAuthnRelyingPartyMismatchException error.
 *
 * Real Cognito reports a credential signed for another relying party this way.
 * The relying party is inside what the authenticator signed, so a credential
 * made for one domain cannot be replayed at another.
 */
export class SimCognitoWebAuthnRelyingPartyMismatchException extends SimCognitoError {
  public override readonly name = "WebAuthnRelyingPartyMismatchException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Cognito WebAuthnOriginNotAllowedException error.
 *
 * Real Cognito reports a credential collected at an origin the pool does not
 * allow this way. The origin is in the client data the authenticator signed
 * over, and a passkey is presented from the relying party's own site.
 */
export class SimCognitoWebAuthnOriginNotAllowedException extends SimCognitoError {
  public override readonly name = "WebAuthnOriginNotAllowedException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Cognito WebAuthnCredentialNotSupportedException error.
 *
 * Real Cognito reports a credential it cannot use this way. Here that is one
 * whose public key it cannot read, or one signed with an algorithm other than
 * the ECDSA over P-256 the registration asked for.
 */
export class SimCognitoWebAuthnCredentialNotSupportedException extends SimCognitoError {
  public override readonly name = "WebAuthnCredentialNotSupportedException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}
