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
 * The setting is acted on: a sign-in by a user of an `OPTIONAL` or `ON` pool
 * that has registered a factor is answered with the challenge for it. The one
 * case left is a user of an `ON` pool that has registered none, which real
 * Cognito answers with `MFA_SETUP`, and that sign-in is refused where the
 * challenge would have been issued rather than at pool creation.
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
   * Whether any sign-in to the pool could be challenged for a second factor.
   *
   * A pool configured `OFF` challenges nobody, whatever factors its users
   * have registered, so a sign-in to one goes straight to tokens.
   */
  get challengesAnySignIn(): boolean {
    return this.value !== "OFF";
  }

  /**
   * Whether every sign-in to the pool has to get past a second factor.
   *
   * A user of an `ON` pool is answered with a challenge on real Cognito
   * whether or not it has registered a factor: one that has is challenged for
   * it, and one that has not is answered with `MFA_SETUP`, which is the
   * challenge this simulation does not issue.
   */
  get challengesEverySignIn(): boolean {
    return this.value === "ON";
  }
}
