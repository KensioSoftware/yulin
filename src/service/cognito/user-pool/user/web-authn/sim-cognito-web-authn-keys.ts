import type { KeyObject } from "node:crypto";

import { SimCognitoInvalidParameterException } from "../../../error/sim-cognito.error.js";

/**
 * One passkey as the device holds it, which is the half a pool never sees.
 */
export interface SimCognitoWebAuthnStoredKey {
  readonly privateKey: KeyObject;

  /**
   * How many times this passkey has signed, which travels in the
   * authenticator data of every assertion it produces.
   */
  signCount: number;
}

/**
 * The passkeys one stand-in authenticator is holding.
 *
 * A real authenticator keeps the private half of every credential it has made
 * and hands out signatures. This holds the same thing for the same reason. The
 * pool stores the public half, and the two have to be apart for a signature to
 * mean anything.
 */
export class SimCognitoWebAuthnKeys {
  readonly #keys = new Map<string, SimCognitoWebAuthnStoredKey>();

  /** Keep the private key of a credential this device has just made. */
  add(credentialId: string, privateKey: KeyObject): void {
    this.#keys.set(credentialId, { privateKey, signCount: 0 });
  }

  /** Forget a passkey, because the pool that held its public half has. */
  forget(credentialId: string): void {
    this.#keys.delete(credentialId);
  }

  /**
   * The passkey this device would present, out of the ones a sign-in allows.
   *
   * A challenge allowing none in particular is answered with whichever this
   * device holds, which is what a discoverable credential prompt does. One
   * naming credentials is answered with the first of them this device has,
   * which is the choice a person makes at a real prompt.
   */
  requireOneOf(
    allowed: readonly string[],
  ): readonly [string, SimCognitoWebAuthnStoredKey] {
    for (const [credentialId, key] of this.#keys) {
      if (allowed.length === 0 || allowed.includes(credentialId)) {
        return [credentialId, key];
      }
    }

    throw new SimCognitoInvalidParameterException(
      "This user has registered no passkey the challenge would accept: " +
        "register one with StartWebAuthnRegistration and " +
        "CompleteWebAuthnRegistration first",
    );
  }
}
