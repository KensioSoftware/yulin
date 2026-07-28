import { assertStringIncludes, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSecretsManagerPasswordSpec } from "./sim-secrets-manager-password-spec.js";

describe("Secrets Manager password requests", () => {
  it("refuses a password too short to hold one of each required type", () => {
    // Given three characters and four required character types.
    // When the request is described, then it is refused.
    const error = assertThrowsError(() => {
      return new SimSecretsManagerPasswordSpec({ passwordLength: 3 });
    });

    assertStringIncludes(
      error.message,
      "PasswordLength 3 is too short to include one of each of the 4 character types",
    );
  });

  it("refuses a password length outside the range AWS accepts", () => {
    // Given a zero-length password.
    // When the request is described, then it is refused.
    const tooShort = assertThrowsError(() => {
      return new SimSecretsManagerPasswordSpec({ passwordLength: 0 });
    });
    assertStringIncludes(
      tooShort.message,
      "PasswordLength 0 must be between 1 and 4096 characters",
    );

    // And a password longer than Secrets Manager generates is refused too.
    const tooLong = assertThrowsError(() => {
      return new SimSecretsManagerPasswordSpec({ passwordLength: 4097 });
    });
    assertStringIncludes(tooLong.message, "must be between 1 and 4096");
  });

  it("refuses a fractional password length", () => {
    // Given a length that is not a whole number.
    // When the request is described, then it is refused.
    const error = assertThrowsError(() => {
      return new SimSecretsManagerPasswordSpec({ passwordLength: 12.5 });
    });

    assertStringIncludes(error.message, "must be a whole number");
  });

  it("refuses a request excluding every character type", () => {
    // Given every character type excluded.
    // When the request is described, then it is refused rather than
    // generating an empty password.
    const error = assertThrowsError(() => {
      return new SimSecretsManagerPasswordSpec({
        excludeUppercase: true,
        excludeLowercase: true,
        excludeNumbers: true,
        excludePunctuation: true,
      });
    });

    assertStringIncludes(
      error.message,
      "A generated password needs at least one character type",
    );
  });

  it("refuses ExcludeCharacters that empties an included character type", () => {
    // Given every digit excluded by character while numbers stay included.
    // When the request is described, then the contradiction is refused rather
    // than quietly generating a password with no digits in it.
    const error = assertThrowsError(() => {
      return new SimSecretsManagerPasswordSpec({
        excludeCharacters: "0123456789",
      });
    });

    assertStringIncludes(
      error.message,
      "ExcludeCharacters excludes every numbers character",
    );
  });
});
