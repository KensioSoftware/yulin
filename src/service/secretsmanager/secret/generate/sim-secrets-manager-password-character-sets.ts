import { SimSecretsManagerInvalidParameterException } from "../../error/sim-secrets-manager.error.js";
import {
  secretsManagerPasswordCharacters,
  SimSecretsManagerPasswordCharacterSet,
} from "./sim-secrets-manager-password-character-set.js";

/**
 * The character-selection options a Secrets Manager password request carries.
 *
 * These are the `GetRandomPassword` options under their own names, which is
 * also what `GenerateSecretString` gives a CloudFormation template.
 */
export interface SimSecretsManagerPasswordCharacterOptions {
  readonly excludeUppercase?: boolean | undefined;
  readonly excludeLowercase?: boolean | undefined;
  readonly excludeNumbers?: boolean | undefined;
  readonly excludePunctuation?: boolean | undefined;
  readonly includeSpace?: boolean | undefined;
  readonly excludeCharacters?: string | undefined;
}

/**
 * The character sets one generated password is allowed to draw on.
 *
 * The `Exclude*` flags decide which types are included at all, and
 * `ExcludeCharacters` then narrows each included type. Keeping the types apart
 * rather than merging them into one alphabet is what lets
 * `RequireEachIncludedType` mean anything.
 */
export class SimSecretsManagerPasswordCharacterSets {
  public readonly included: readonly SimSecretsManagerPasswordCharacterSet[];

  constructor(options: SimSecretsManagerPasswordCharacterOptions = {}) {
    this.included = SimSecretsManagerPasswordCharacterSets.include(options);
  }

  private static include(
    options: SimSecretsManagerPasswordCharacterOptions,
  ): readonly SimSecretsManagerPasswordCharacterSet[] {
    const excluded = options.excludeCharacters ?? "";
    const candidates = secretsManagerPasswordCharacters
      .filter((set) => {
        return this.isIncluded(set.name, options);
      })
      .map((set) => {
        return new SimSecretsManagerPasswordCharacterSet(
          set.name,
          set.characters,
        ).without(excluded);
      });

    for (const set of candidates) {
      set.requireNotEmpty();
    }

    if (candidates.length === 0) {
      throw new SimSecretsManagerInvalidParameterException(
        "A generated password needs at least one character type: every one " +
          "of uppercase, lowercase, numbers and punctuation was excluded",
      );
    }

    return candidates;
  }

  /**
   * Whether a character type is included, by the flag that governs it.
   *
   * Every type but the space is included unless excluded; the space is the
   * other way round, as it is on real AWS.
   */
  private static isIncluded(
    name: (typeof secretsManagerPasswordCharacters)[number]["name"],
    options: SimSecretsManagerPasswordCharacterOptions,
  ): boolean {
    switch (name) {
      case "uppercase": {
        return options.excludeUppercase !== true;
      }
      case "lowercase": {
        return options.excludeLowercase !== true;
      }
      case "numbers": {
        return options.excludeNumbers !== true;
      }
      case "punctuation": {
        return options.excludePunctuation !== true;
      }
      case "space": {
        return options.includeSpace === true;
      }
    }
  }

  /**
   * Every character any included type allows, as one pool.
   */
  get alphabet(): string {
    return this.included.map((set) => set.characters).join("");
  }
}
