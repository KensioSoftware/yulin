import { SimCognitoResourceNotFoundException } from "../../../error/sim-cognito.error.js";
import { SimCognitoWebAuthnChallengeNotFoundException } from "../../../error/sim-cognito-web-authn.error.js";
import { simCognitoWebAuthnAttested } from "./sim-cognito-web-authn-attested-key.js";
import {
  simCognitoWebAuthnCreationOptions,
  type SimCognitoWebAuthnRegistrationRequest,
} from "./sim-cognito-web-authn-creation-options.js";
import { requireSimCognitoWebAuthnCeremony } from "./sim-cognito-web-authn-ceremony.js";
import type { SimCognitoWebAuthnCredential } from "./sim-cognito-web-authn-credential.js";
import { simCognitoWebAuthnCreated } from "./sim-cognito-web-authn-authenticator.js";
import type {
  SimCognitoWebAuthnCreationOptions,
  SimCognitoWebAuthnCredentialDocument,
} from "./sim-cognito-web-authn-document.js";

/**
 * The passkeys one simulated user has, and the registration it is part way
 * through.
 *
 * `StartWebAuthnRegistration` issues the challenge a passkey is created
 * against, and `CompleteWebAuthnRegistration` hands back the credential the
 * authenticator made from it. The challenge is spent either way, so a
 * credential cannot be replayed into a second registration.
 *
 * What the pool keeps of a registration is the public key, the relying party
 * and the identifier, and all of it is checked before any of it is stored.
 *
 * Registering or deleting a passkey leaves the user's own
 * `UserLastModifiedDate` where it was, unlike registering a second factor. A
 * passkey is a credential of its own rather than a setting on the user, and
 * what real Cognito does to that date was not checked against a live account.
 */
export class SimCognitoUserWebAuthn {
  readonly #credentials = new Map<string, SimCognitoWebAuthnCredential>();

  /**
   * The options the registration this user is part way through was issued
   * with, which carry both the challenge and the relying party it answers to.
   */
  #pending: SimCognitoWebAuthnCreationOptions | undefined;

  /**
   * The passkeys this user has registered, oldest first.
   */
  get credentials(): readonly SimCognitoWebAuthnCredential[] {
    return this.#credentials.values().toArray();
  }

  /**
   * Ask for a passkey, and remember the challenge it has to be created
   * against.
   *
   * A second call replaces the first, as real Cognito replaces one: the
   * challenge a browser was part way through answering is spent whether or not
   * a credential ever came back for it.
   */
  startRegistration(
    request: SimCognitoWebAuthnRegistrationRequest,
  ): SimCognitoWebAuthnCreationOptions {
    const options = simCognitoWebAuthnCreationOptions(
      request,
      this.credentials.map((each) => each.descriptor()),
    );

    this.#pending = options;

    return options;
  }

  /**
   * Register the passkey a browser created, having checked it answers the
   * challenge this user was issued.
   */
  completeRegistration(credential: unknown, now: Date): void {
    const pending = this.requirePending();
    const relyingPartyId = pending.rp.id;
    const ceremony = requireSimCognitoWebAuthnCeremony({
      credential,
      field: "Credential",
      type: "webauthn.create",
      challenge: pending.challenge,
      relyingPartyId,
    });

    // The challenge is spent whether or not the rest of the credential is
    // usable, so a refused one cannot be retried against the same challenge.
    this.#pending = undefined;

    this.#credentials.set(
      ceremony.credentialId,
      simCognitoWebAuthnAttested(ceremony, relyingPartyId, now),
    );
  }

  /**
   * Forget a passkey, or refuse an identifier this user has none for.
   */
  remove(credentialId: string | undefined): void {
    if (credentialId === undefined || !this.#credentials.has(credentialId)) {
      throw new SimCognitoResourceNotFoundException(
        `This user has no registered passkey with the credential id ` +
          `'${String(credentialId)}'`,
      );
    }

    this.#credentials.delete(credentialId);
  }

  /**
   * The credential this user's authenticator would have made for the
   * registration it has been given options for.
   *
   * This is the simulator's own accessor, for a test that has no browser to
   * run the ceremony in. Real Cognito hands the options to a browser and the
   * browser hands back the credential.
   */
  registrationCredential(): SimCognitoWebAuthnCredentialDocument {
    return simCognitoWebAuthnCreated(this.requirePending());
  }

  /**
   * The registration this user is part way through, or a refusal saying it is
   * part way through none.
   */
  private requirePending(): SimCognitoWebAuthnCreationOptions {
    if (this.#pending === undefined) {
      throw new SimCognitoWebAuthnChallengeNotFoundException(
        "No passkey registration is in progress for this user: call " +
          "StartWebAuthnRegistration for the challenge a credential is " +
          "created against.",
      );
    }

    return this.#pending;
  }
}
