import { randomInt } from "node:crypto";
import type { SimSecretsManagerPasswordSpec } from "./sim-secrets-manager-password-spec.js";

/**
 * Generates the random passwords Secrets Manager generates.
 *
 * The randomness is real rather than seedable: a test that wants the value
 * reads it back out of the simulation, the same way a deployed application
 * does, rather than predicting it. A predictable generator would make a test
 * pass for a reason that says nothing about the deployed system.
 */
export class SimSecretsManagerPasswordGenerator {
  /**
   * Generate one password meeting a validated spec.
   *
   * Each required type contributes a character first and the rest is drawn
   * from the whole pool, then the result is shuffled so the required
   * characters do not always land at the front.
   */
  generate(spec: SimSecretsManagerPasswordSpec): string {
    const characters = this.requiredCharacters(spec);
    const alphabet = spec.characterSets.alphabet;

    while (characters.length < spec.length) {
      characters.push(this.pick(alphabet));
    }

    return this.shuffled(characters).join("");
  }

  private requiredCharacters(spec: SimSecretsManagerPasswordSpec): string[] {
    if (!spec.requireEachIncludedType) {
      return [];
    }

    return spec.characterSets.included.map((set) => this.pick(set.characters));
  }

  /**
   * Pick one character uniformly, without the modulo bias a raw random byte
   * would introduce.
   */
  private pick(characters: string): string {
    return characters.charAt(randomInt(characters.length));
  }

  /**
   * Take characters from the pool at random until it is empty, which is the
   * Fisher-Yates shuffle written as a drawing rather than as index swaps.
   */
  private shuffled(characters: readonly string[]): string[] {
    const pool = [...characters];
    const shuffled: string[] = [];

    while (pool.length > 0) {
      shuffled.push(...pool.splice(randomInt(pool.length), 1));
    }

    return shuffled;
  }
}
