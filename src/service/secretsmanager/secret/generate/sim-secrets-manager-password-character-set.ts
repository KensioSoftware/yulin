/* eslint-disable no-secrets/no-secrets -- character alphabets, not secrets. */
import { SimSecretsManagerInvalidParameterException } from "../../error/sim-secrets-manager.error.js";

/**
 * The character groups Secrets Manager draws a generated password from.
 *
 * These are the exact sets real Secrets Manager uses, including its
 * punctuation set, so a password generated here passes the same password
 * policies a real one would.
 */
export const secretsManagerPasswordCharacters = [
  { name: "uppercase", characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
  { name: "lowercase", characters: "abcdefghijklmnopqrstuvwxyz" },
  { name: "numbers", characters: "0123456789" },
  { name: "punctuation", characters: "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~" },
  { name: "space", characters: " " },
] as const;

/**
 * One named group of characters a generated password can draw on.
 *
 * A set knows how to narrow itself by excluded characters, which is what makes
 * `ExcludeCharacters` apply to the required-type rule as well as to the pool:
 * a type that has nothing left cannot be required.
 */
export class SimSecretsManagerPasswordCharacterSet {
  public readonly name: string;
  public readonly characters: string;

  constructor(name: string, characters: string) {
    this.name = name;
    this.characters = characters;
  }

  /**
   * Whether every character of this set has been excluded.
   */
  get isEmpty(): boolean {
    return this.characters.length === 0;
  }

  /**
   * The same set with every excluded character removed.
   */
  without(excluded: string): SimSecretsManagerPasswordCharacterSet {
    let remaining = "";

    for (const character of this.characters) {
      if (!excluded.includes(character)) {
        remaining += character;
      }
    }

    return new SimSecretsManagerPasswordCharacterSet(this.name, remaining);
  }

  /**
   * Refuse a set that has been excluded down to nothing.
   *
   * Real Secrets Manager is vague about an `ExcludeCharacters` that empties a
   * character type it was also told to include. Refusing is the fail-closed
   * reading: the request contradicts itself, and generating a password that
   * quietly lacks a type it asked for would be worse than saying so.
   */
  requireNotEmpty(): void {
    if (!this.isEmpty) {
      return;
    }

    throw new SimSecretsManagerInvalidParameterException(
      `ExcludeCharacters excludes every ${this.name} character, but ` +
        `${this.name} characters are included in the generated password`,
    );
  }
}
