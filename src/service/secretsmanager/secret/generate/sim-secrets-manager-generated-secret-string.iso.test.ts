import {
  assertIdentical,
  assertStringLength,
  assertStringIncludes,
  assertThrowsError,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSecretsManagerGeneratedSecretString } from "./sim-secrets-manager-generated-secret-string.js";
import { SimSecretsManagerPasswordSpec } from "./sim-secrets-manager-password-spec.js";

describe("Secrets Manager generated secret strings", () => {
  it("puts the generated password into the template under its key", () => {
    // Given a template naming a username and a key for the generated value.
    const generated = new SimSecretsManagerGeneratedSecretString({
      password: new SimSecretsManagerPasswordSpec({ passwordLength: 16 }),
      secretStringTemplate: JSON.stringify({ username: "app" }),
      generateStringKey: "password",
    });

    // When the secret value is generated.
    const value: unknown = JSON.parse(generated.generate());

    // Then the template's own fields survive alongside the generated one.
    assertIdentical((value as { username?: string }).username, "app");
    const password = (value as { password?: string }).password;
    assertTypeString(password);
    assertStringLength(password, 16);
  });

  it("makes the whole value the password when there is no template", () => {
    // Given a generated secret with no template or key, as an empty
    // GenerateSecretString gives.
    const generated = new SimSecretsManagerGeneratedSecretString({
      password: new SimSecretsManagerPasswordSpec({ passwordLength: 20 }),
    });

    // When the secret value is generated.
    const value = generated.generate();

    // Then the value is the password itself rather than a JSON object.
    assertStringLength(value, 20);
  });

  it("overwrites a key the template already has", () => {
    // Given a template that already carries the key being generated.
    const generated = new SimSecretsManagerGeneratedSecretString({
      password: new SimSecretsManagerPasswordSpec({ passwordLength: 12 }),
      secretStringTemplate: JSON.stringify({ password: "placeholder" }),
      generateStringKey: "password",
    });

    // When the secret value is generated.
    const value: unknown = JSON.parse(generated.generate());

    // Then the generated password replaces the placeholder.
    const password = (value as { password?: string }).password;
    assertTypeString(password);
    assertStringLength(password, 12);
  });

  it("refuses a template without a key to put the password under", () => {
    // Given a template but no GenerateStringKey.
    // When the generated secret is described, then it is refused.
    const error = assertThrowsError(() => {
      return new SimSecretsManagerGeneratedSecretString({
        password: new SimSecretsManagerPasswordSpec(),
        secretStringTemplate: JSON.stringify({ username: "app" }),
      });
    });

    assertStringIncludes(
      error.message,
      "SecretStringTemplate and GenerateStringKey have to be supplied together",
    );
  });

  it("refuses a key with no template to put it in", () => {
    // Given a GenerateStringKey but no template.
    // When the generated secret is described, then it is refused.
    const error = assertThrowsError(() => {
      return new SimSecretsManagerGeneratedSecretString({
        password: new SimSecretsManagerPasswordSpec(),
        generateStringKey: "password",
      });
    });

    assertStringIncludes(
      error.message,
      "SecretStringTemplate and GenerateStringKey have to be supplied together",
    );
  });

  it("refuses a template that is not valid JSON", () => {
    // Given a template that cannot be parsed.
    const generated = new SimSecretsManagerGeneratedSecretString({
      password: new SimSecretsManagerPasswordSpec(),
      secretStringTemplate: "{username: app}",
      generateStringKey: "password",
    });

    // When the secret value is generated, then it is refused.
    const error = assertThrowsError(() => generated.generate());

    assertStringIncludes(
      error.message,
      "SecretStringTemplate is not valid JSON",
    );
  });

  it("refuses a template that is not a JSON object", () => {
    // Given a template holding a JSON array rather than an object.
    const generated = new SimSecretsManagerGeneratedSecretString({
      password: new SimSecretsManagerPasswordSpec(),
      secretStringTemplate: JSON.stringify(["app"]),
      generateStringKey: "password",
    });

    // When the secret value is generated, then it is refused: there is
    // nowhere for a keyed value to go.
    const error = assertThrowsError(() => generated.generate());

    assertStringIncludes(
      error.message,
      "SecretStringTemplate must be a JSON object",
    );
  });
});
