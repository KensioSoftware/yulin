import { assertStringLength, assertStringMatches } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSecretsManagerPasswordGenerator } from "./sim-secrets-manager-password-generator.js";
import {
  SimSecretsManagerPasswordSpec,
  type SimSecretsManagerPasswordOptions,
} from "./sim-secrets-manager-password-spec.js";

const generator = new SimSecretsManagerPasswordGenerator();

function generate(options: SimSecretsManagerPasswordOptions = {}): string {
  return generator.generate(new SimSecretsManagerPasswordSpec(options));
}

describe("Secrets Manager generated passwords", () => {
  it("generates 32 characters when no length is asked for", () => {
    // Given no options at all, as an empty GenerateSecretString gives.
    // When a password is generated.
    const password = generate();

    // Then it is the 32 characters real Secrets Manager defaults to.
    assertStringLength(password, 32);
  });

  it("generates the length asked for", () => {
    // Given a requested password length.
    // When a password is generated.
    const password = generate({ passwordLength: 24 });

    // Then it is exactly that long.
    assertStringLength(password, 24);
  });

  it("includes one of every included character type by default", () => {
    // Given the default character types. Generation is random, so the
    // guarantee is checked over a run of passwords rather than one.
    // When passwords are generated.
    const passwords = Array.from({ length: 20 }, () => {
      return generate({ passwordLength: 8 });
    });

    // Then every one of them carries all four types, as real Secrets Manager
    // guarantees when RequireEachIncludedType is left alone.
    for (const password of passwords) {
      assertStringMatches(password, /[A-Z]/);
      assertStringMatches(password, /[a-z]/);
      assertStringMatches(password, /\d/);
      assertStringMatches(password, /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/);
    }
  });

  it("drops the one-of-each guarantee when RequireEachIncludedType is off", () => {
    // Given a single-character password with all four types included, which
    // could not hold one of each.
    // When a password is generated without requiring each type.
    const password = generate({
      passwordLength: 1,
      requireEachIncludedType: false,
    });

    // Then it is generated anyway, from the whole pool.
    assertStringLength(password, 1);
  });
});
