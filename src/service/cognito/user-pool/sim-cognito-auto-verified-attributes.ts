import { SimCognitoInvalidParameterException } from "../error/sim-cognito.error.js";

/**
 * The attributes a pool can verify automatically.
 *
 * These are the two Cognito can send a confirmation code to, and the only two
 * with a `_verified` flag in the standard schema.
 */
const verifiableAttributeNames: readonly string[] = ["email", "phone_number"];

/**
 * The attributes a pool verifies when a user confirms its sign-up.
 *
 * Real Cognito sends the confirmation code to each of these, and marks the
 * matching `_verified` flag once the user answers with the code. Nothing here
 * sends anything, so what is simulated is the second half: confirming a
 * sign-up sets `email_verified` or `phone_number_verified` on the user, which
 * is what an application reads to decide whether it can trust the address.
 *
 * `AdminConfirmSignUp` sets neither, as it does not on real Cognito: an admin
 * confirming a user says nothing about whether the address is really theirs.
 */
export class SimCognitoAutoVerifiedAttributes {
  private readonly attributeNames: readonly string[];

  constructor(requested?: readonly string[]) {
    this.attributeNames = (requested ?? []).map((name) =>
      SimCognitoAutoVerifiedAttributes.requireVerifiable(name),
    );
  }

  private static requireVerifiable(name: string): string {
    if (!verifiableAttributeNames.includes(name)) {
      throw new SimCognitoInvalidParameterException(
        `AutoVerifiedAttributes '${name}' is not an attribute Cognito can ` +
          `verify. Only ${verifiableAttributeNames.join(" and ")} can be`,
      );
    }

    return name;
  }

  /**
   * The attribute names, as the request gave them.
   */
  get names(): readonly string[] {
    return this.attributeNames;
  }

  /**
   * Whether the pool verifies nothing automatically.
   */
  get isEmpty(): boolean {
    return this.attributeNames.length === 0;
  }

  /**
   * These attributes as a described pool reports them, or nothing where the
   * pool has none.
   *
   * A pool created without any reports the property not at all rather than as
   * an empty list, which is how the settings a pool accepts without acting on
   * are reported too.
   */
  toOutput(): readonly string[] | undefined {
    if (this.isEmpty) {
      return undefined;
    }

    return [...this.attributeNames];
  }
}
