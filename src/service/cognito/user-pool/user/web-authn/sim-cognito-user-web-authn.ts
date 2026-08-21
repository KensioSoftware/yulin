import { SimCognitoResourceNotFoundException } from "../../../error/sim-cognito.error.js";
import { SimCognitoWebAuthnChallengeNotFoundException } from "../../../error/sim-cognito-web-authn.error.js";
import { simCognitoWebAuthnRegistered } from "./sim-cognito-web-authn-attested-key.js";
import {
  simCognitoWebAuthnCreationOptions,
  type SimCognitoWebAuthnRegistrationRequest,
} from "./sim-cognito-web-authn-creation-options.js";
import type { SimCognitoWebAuthnCredential } from "./sim-cognito-web-authn-credential.js";
import { SimCognitoWebAuthnDevice } from "./sim-cognito-web-authn-device.js";
import type {
  SimCognitoWebAuthnCreationOptions,
  SimCognitoWebAuthnCredentialDocument,
} from "./sim-cognito-web-authn-document.js";

interface SimCognitoUserWebAuthnProperties {
  /** What to call when the user's passkeys change. */
  readonly changed: () => void;
}

/**
 * The passkeys one simulated user has, and the registration it is part way
 * through.
 *
 * `StartWebAuthnRegistration` issues the challenge a passkey is created
 * against, and `CompleteWebAuthnRegistration` hands back the credential the
 * authenticator made from it. The challenge is spent either way, so a
 * credential cannot be replayed into a second registration.
 *
 * The device the credential comes from is here too, because a test has no
 * browser and no phone. What it holds is only the private half. What the pool
 * keeps of a registration is the public key, the relying party and the
 * identifier, and all of it is checked before any of it is stored.
 *
 * Registering or deleting a passkey moves the user's `UserLastModifiedDate`
 * on, as every other change to a user does. Whether real Cognito moves it for
 * a passkey was not checked against a live account.
 */
export class SimCognitoUserWebAuthn {
  readonly #device = new SimCognitoWebAuthnDevice();
  readonly #credentials = new Map<string, SimCognitoWebAuthnCredential>();

  /**
   * The options the registration this user is part way through was issued
   * with, which carry both the challenge and the relying party it answers to.
   */
  #pending: SimCognitoWebAuthnCreationOptions | undefined;

  /** What to tell the user when its passkeys change. */
  readonly #changed: () => void;

  constructor(properties: SimCognitoUserWebAuthnProperties) {
    this.#changed = properties.changed;
  }

  /**
   * The stand-in authenticator this user's passkeys live on, which is what
   * makes one and what presents one.
   */
  get device(): SimCognitoWebAuthnDevice {
    return this.#device;
  }

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
    // The challenge is spent before the credential is read, so a refused one
    // cannot be retried against the same challenge. Real Cognito issues one
    // challenge per registration, and StartWebAuthnRegistration is what issues
    // another.
    const pending = this.requirePending();

    this.#pending = undefined;

    const registered = simCognitoWebAuthnRegistered(pending, credential, now);

    this.#credentials.set(registered.credentialId, registered);
    this.#changed();
  }

  /**
   * Forget a passkey, or refuse an identifier this user has none for.
   */
  remove(credentialId: string | undefined): void {
    if (credentialId === undefined || !this.#credentials.delete(credentialId)) {
      throw new SimCognitoResourceNotFoundException(
        `This user has no registered passkey with the credential id ` +
          `'${String(credentialId)}'`,
      );
    }

    this.#device.forget(credentialId);
    this.#changed();
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
    return this.#device.create(this.requirePending());
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
