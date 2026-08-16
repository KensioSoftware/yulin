import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

export type SimCognitoMfaConfigurationValue = "OFF" | "ON" | "OPTIONAL";

const mfaConfigurationValues: ReadonlySet<SimCognitoMfaConfigurationValue> =
  new Set(["OFF", "ON", "OPTIONAL"]);

/**
 * Whether a user pool asks a user for a second factor when it signs in.
 *
 * A pool is created `OFF` unless the request asks for something else.
 * `OPTIONAL` challenges only the users that have registered a factor, and `ON`
 * challenges every user.
 *
 * The setting is kept and reported rather than acted on: nothing here
 * registers a factor for a user, so no user of an `OPTIONAL` pool has one, and
 * a sign-in to such a pool goes through without a challenge, as it does on real
 * Cognito for a user that never registered one. An `ON` pool is the one that
 * differs, so a sign-in to that is refused where the challenge would have been
 * issued rather than at pool creation.
 */
export class SimCognitoMfaConfiguration {
  public readonly value: SimCognitoMfaConfigurationValue;

  constructor(requested: string | undefined) {
    if (requested === undefined) {
      this.value = "OFF";
      return;
    }

    if (
      !mfaConfigurationValues.has(requested as SimCognitoMfaConfigurationValue)
    ) {
      throw new SimCognitoInvalidParameterException(
        `MfaConfiguration '${requested}' is not a Cognito MFA ` +
          `configuration: use OFF, OPTIONAL or ON`,
      );
    }

    this.value = requested as SimCognitoMfaConfigurationValue;
  }

  /**
   * Whether every sign-in to the pool has to get past a second factor.
   *
   * This is the one setting no sign-in here can honour. A user of an `ON` pool
   * is answered with an MFA challenge on real Cognito whether or not it has
   * registered a factor, so tokens are never issued by the request that sent
   * the password.
   */
  get challengesEverySignIn(): boolean {
    return this.value === "ON";
  }
}
