import { SimCognitoInvalidParameterException } from "../error/sim-cognito.error.js";

/**
 * The sign-in policy of a user pool, which chooses the factors a user may
 * authenticate with first.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_SignInPolicyType.html
 */
export interface SimCognitoSignInPolicyType {
  readonly AllowedFirstAuthFactors?: readonly string[] | undefined;
}

/**
 * A factor a user pool can offer at the first authentication prompt.
 *
 * `PASSWORD` covers both the plain-password and the SRP flows, which is what
 * AWS says about the value.
 */
export type SimCognitoFirstAuthFactor =
  | "PASSWORD"
  | "EMAIL_OTP"
  | "SMS_OTP"
  | "WEB_AUTHN";

const firstAuthFactors: readonly SimCognitoFirstAuthFactor[] = [
  "PASSWORD",
  "EMAIL_OTP",
  "SMS_OTP",
  "WEB_AUTHN",
];

const mostFactors = 5;

/**
 * The factors one simulated user pool allows at the first prompt.
 *
 * A pool created without a sign-in policy allows a password and says nothing
 * about it, which is how real Cognito reports one. A pool created with a
 * policy carries the factors it named, and reports them back under `Policies`.
 *
 * **The factor a sign-in presents is not settled here.** These are recorded
 * the way an `MfaConfiguration` is recorded, and the sign-in that presents one
 * is where they are read. Every factor beside `PASSWORD` is reached through
 * the `USER_AUTH` flow, and `SimCognitoAuthFlows` still refuses that flow by
 * name, so a pool configured for a code sent by email deploys, describes
 * itself the way the deployed pool does, and refuses that sign-in in words
 * that say what could not be done.
 *
 * The validation is real Cognito's. The four factor names are the ones it
 * accepts, a list may name five of them at most, and a policy offering
 * passkeys and nothing else is refused because AWS states that `WEB_AUTHN`
 * "must be accompanied by at least one other option".
 */
export class SimCognitoSignInPolicy {
  /**
   * The factors the policy named, in the order it named them, and nothing
   * where the pool was created without a policy at all.
   */
  readonly #allowedFirstAuthFactors:
    | readonly SimCognitoFirstAuthFactor[]
    | undefined;

  constructor(policy?: SimCognitoSignInPolicyType) {
    const requested = policy?.AllowedFirstAuthFactors;

    if (requested === undefined) {
      this.#allowedFirstAuthFactors = undefined;
      return;
    }

    this.#allowedFirstAuthFactors = SimCognitoSignInPolicy.factorsIn(requested);
  }

  private static factorsIn(
    requested: readonly string[],
  ): readonly SimCognitoFirstAuthFactor[] {
    this.requireCount(requested);

    const factors = requested.map((factor) => this.requireKnown(factor));

    this.requireCompanionForPasskeys(factors);

    return factors;
  }

  private static requireCount(requested: readonly string[]): void {
    if (requested.length === 0) {
      throw new SimCognitoInvalidParameterException(
        "SignInPolicy AllowedFirstAuthFactors must name at least one factor: " +
          `use one or more of ${firstAuthFactors.join(", ")}`,
      );
    }

    if (requested.length > mostFactors) {
      throw new SimCognitoInvalidParameterException(
        "SignInPolicy AllowedFirstAuthFactors must name no more than " +
          `${String(mostFactors)} factors`,
      );
    }
  }

  private static requireKnown(factor: string): SimCognitoFirstAuthFactor {
    if (!firstAuthFactors.includes(factor as SimCognitoFirstAuthFactor)) {
      throw new SimCognitoInvalidParameterException(
        `SignInPolicy AllowedFirstAuthFactors '${factor}' is not a Cognito ` +
          `first authentication factor: use one of ${firstAuthFactors.join(", ")}`,
      );
    }

    return factor as SimCognitoFirstAuthFactor;
  }

  /**
   * Refuse a policy offering passkeys and nothing else, as real Cognito
   * refuses one. A passkey has to be registered from a session that already
   * exists, so a pool with no other way in would have nobody able to register.
   *
   * The companion has to be a different factor, so naming `WEB_AUTHN` twice
   * leaves the pool as shut as naming it once does.
   */
  private static requireCompanionForPasskeys(
    factors: readonly SimCognitoFirstAuthFactor[],
  ): void {
    if (factors.every((factor) => factor === "WEB_AUTHN")) {
      throw new SimCognitoInvalidParameterException(
        "SignInPolicy AllowedFirstAuthFactors WEB_AUTHN has to be " +
          "accompanied by at least one other factor",
      );
    }
  }

  /**
   * The policy as Cognito reports it on the pool, and nothing where the pool
   * was created without one.
   */
  toOutput(): SimCognitoSignInPolicyType | undefined {
    if (this.#allowedFirstAuthFactors === undefined) {
      return undefined;
    }

    return { AllowedFirstAuthFactors: [...this.#allowedFirstAuthFactors] };
  }
}
