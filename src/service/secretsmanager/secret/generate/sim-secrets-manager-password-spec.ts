import { SimSecretsManagerInvalidParameterException } from "../../error/sim-secrets-manager.error.js";
import type { SimSecretsManagerPasswordCharacterOptions } from "./sim-secrets-manager-password-character-sets.js";
import { SimSecretsManagerPasswordCharacterSets } from "./sim-secrets-manager-password-character-sets.js";

/**
 * The length real Secrets Manager generates when a request does not ask for
 * one, and the range it accepts.
 */
const defaultPasswordLength = 32;
const minimumPasswordLength = 1;
const maximumPasswordLength = 4096;

/**
 * Everything a Secrets Manager password request can ask for.
 */
export interface SimSecretsManagerPasswordOptions extends SimSecretsManagerPasswordCharacterOptions {
  readonly passwordLength?: number | undefined;
  readonly requireEachIncludedType?: boolean | undefined;
}

/**
 * A validated request for one generated password.
 *
 * Validation lives here rather than in the generator so a contradictory
 * request — a length of zero, or four required character types in a
 * three-character password — is refused when it is described rather than
 * silently honoured in part when it is generated.
 */
export class SimSecretsManagerPasswordSpec {
  public readonly length: number;
  public readonly characterSets: SimSecretsManagerPasswordCharacterSets;

  /**
   * Whether every included character type has to appear at least once.
   *
   * Real Secrets Manager defaults this on, so a generated password contains
   * one of everything it was not told to exclude.
   */
  public readonly requireEachIncludedType: boolean;

  constructor(options: SimSecretsManagerPasswordOptions = {}) {
    this.length = SimSecretsManagerPasswordSpec.validLength(
      options.passwordLength,
    );
    this.characterSets = new SimSecretsManagerPasswordCharacterSets(options);
    this.requireEachIncludedType = options.requireEachIncludedType !== false;

    this.requireTypesFit();
  }

  private static validLength(length: number | undefined): number {
    if (length === undefined) {
      return defaultPasswordLength;
    }

    if (!Number.isSafeInteger(length)) {
      throw new SimSecretsManagerInvalidParameterException(
        `PasswordLength ${String(length)} must be a whole number`,
      );
    }

    if (length < minimumPasswordLength || length > maximumPasswordLength) {
      throw new SimSecretsManagerInvalidParameterException(
        `PasswordLength ${String(length)} must be between ` +
          `${String(minimumPasswordLength)} and ` +
          `${String(maximumPasswordLength)} characters`,
      );
    }

    return length;
  }

  /**
   * Refuse a password too short to hold one of each required type.
   */
  private requireTypesFit(): void {
    if (!this.requireEachIncludedType) {
      return;
    }

    const typeCount = this.characterSets.included.length;

    if (typeCount <= this.length) {
      return;
    }

    throw new SimSecretsManagerInvalidParameterException(
      `PasswordLength ${String(this.length)} is too short to include one of ` +
        `each of the ${String(typeCount)} character types the request ` +
        `requires. Exclude a character type or ask for a longer password.`,
    );
  }
}
