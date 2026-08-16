import { randomBytes } from "node:crypto";

import {
  simCognitoBase32,
  simCognitoSecretBytes,
  simCognitoTotpCode,
  simCognitoTotpMatches,
} from "./sim-cognito-totp.js";

/**
 * The shared secret one user registers an authenticator app with.
 *
 * `AssociateSoftwareToken` issues one and hands back its `SecretCode`, which
 * is the value real Cognito puts in the `otpauth://` URL behind a QR code.
 * The secret is a real one: the codes it produces are genuine RFC 6238
 * time-based one-time passwords, so an authenticator library given this
 * `SecretCode` produces codes `VerifySoftwareToken` accepts.
 *
 * A secret is provisional until it is verified. `AssociateSoftwareToken`
 * issues a fresh one each time it is called, as real Cognito does, so a user
 * part way through registering an app and starting again has one secret rather
 * than two.
 */
export class SimCognitoSoftwareToken {
  /**
   * The secret as a caller is given it, in unpadded base32.
   */
  public readonly secretCode: string;

  private readonly secret: Uint8Array;

  private constructor(secret: Uint8Array) {
    this.secret = secret;
    this.secretCode = simCognitoBase32(secret);
  }

  /**
   * Issue a fresh shared secret.
   */
  static issue(): SimCognitoSoftwareToken {
    return new SimCognitoSoftwareToken(randomBytes(simCognitoSecretBytes));
  }

  /**
   * The code an authenticator app holding this secret shows at a moment.
   *
   * Real Cognito never reports this, and neither would an app: the code is
   * what the user reads off its own device. A pool reports it through
   * `SimCognitoUserPool.softwareTokenCode` for the same reason it reports a
   * confirmation code, because nothing here is holding the user's phone.
   */
  codeAt(now: Date): string {
    return simCognitoTotpCode(this.secret, now);
  }

  /**
   * Whether a candidate is a code this secret produces around a moment.
   */
  matches(candidate: string | undefined, now: Date): boolean {
    return simCognitoTotpMatches(this.secret, candidate, now);
  }
}
