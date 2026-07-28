import { SimCognitoInvalidParameterException } from "../error/sim-cognito.error.js";

export type SimCognitoDeletionProtectionValue = "ACTIVE" | "INACTIVE";

const deletionProtectionValues: ReadonlySet<SimCognitoDeletionProtectionValue> =
  new Set(["ACTIVE", "INACTIVE"]);

/**
 * Whether a user pool is protected against deletion.
 *
 * A pool created through the API is unprotected unless the request asks for
 * protection, which is the opposite of what the console does. A protected pool
 * refuses `DeleteUserPool` with `InvalidParameterException` until the
 * protection is turned off.
 */
export class SimCognitoDeletionProtection {
  public readonly value: SimCognitoDeletionProtectionValue;

  constructor(requested: string | undefined) {
    if (requested === undefined) {
      this.value = "INACTIVE";
      return;
    }

    if (
      !deletionProtectionValues.has(
        requested as SimCognitoDeletionProtectionValue,
      )
    ) {
      throw new SimCognitoInvalidParameterException(
        `DeletionProtection '${requested}' is not a Cognito deletion ` +
          `protection value: use ACTIVE or INACTIVE`,
      );
    }

    this.value = requested as SimCognitoDeletionProtectionValue;
  }

  /**
   * Whether deletion is currently refused.
   */
  get isActive(): boolean {
    return this.value === "ACTIVE";
  }
}
