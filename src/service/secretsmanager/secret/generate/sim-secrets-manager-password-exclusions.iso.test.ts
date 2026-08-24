import {
  assertFalse,
  assertStringIncludes,
  assertStringLength,
  assertStringMatches,
  assertStringNotIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSecretsManagerPasswordGenerator } from "./sim-secrets-manager-password-generator.js";
import {
  SimSecretsManagerPasswordSpec,
  type SimSecretsManagerPasswordOptions,
} from "./sim-secrets-manager-password-spec.js";

const generator = new SimSecretsManagerPasswordGenerator();

/**
 * Generation is random, so a property that has to hold for every generated
 * password is checked over a run of them rather than once.
 */
function generateMany(
  options: SimSecretsManagerPasswordOptions,
): readonly string[] {
  return Array.from({ length: 20 }, () => {
    return generator.generate(new SimSecretsManagerPasswordSpec(options));
  });
}

describe("Secrets Manager generated password exclusions", () => {
  it("leaves out excluded character types", () => {
    // Given every type excluded except lowercase letters.
    // When passwords are generated.
    const passwords = generateMany({
      passwordLength: 12,
      excludeUppercase: true,
      excludeNumbers: true,
      excludePunctuation: true,
    });

    // Then they are lowercase letters and nothing else.
    for (const password of passwords) {
      assertStringMatches(password, /^[a-z]+$/);
      assertFalse(/[A-Z\d]/.test(password));
    }
  });

  it("leaves out individually excluded characters", () => {
    // Given a set of characters a password must not contain.
    // When passwords are generated.
    const passwords = generateMany({
      passwordLength: 40,
      excludeCharacters: "abcABC123",
    });

    // Then none of those characters appear.
    for (const password of passwords) {
      for (const excluded of "abcABC123") {
        assertStringNotIncludes(password, excluded);
      }
    }
  });

  it("includes a space when asked to", () => {
    // Given a request including the space character, with everything else
    // excluded so the space has to appear.
    // When a password is generated.
    const passwords = generateMany({
      passwordLength: 5,
      includeSpace: true,
      excludeUppercase: true,
      excludeLowercase: true,
      excludeNumbers: true,
      excludePunctuation: true,
    });

    // Then it is made of spaces.
    for (const password of passwords) {
      assertStringIncludes(password, " ");
      assertStringLength(password, 5);
    }
  });
});
