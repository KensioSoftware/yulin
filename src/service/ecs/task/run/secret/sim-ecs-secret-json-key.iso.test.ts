import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimEcsSecretJsonKey } from "./sim-ecs-secret-json-key.js";

describe("Selecting one key of a JSON container secret", () => {
  it("answers with the value that key holds", () => {
    // Given a secret holding a JSON object.
    const key = new SimEcsSecretJsonKey("password");

    // When a key of it is selected.
    const value = key.valueIn(
      JSON.stringify({ user: "orders", password: "s3cr3t" }),
    );

    // Then that key's value is what the variable is set to.
    assertIdentical(value, "s3cr3t");
  });

  it("refuses a key the secret has not got", () => {
    // Given a secret holding other keys.
    const key = new SimEcsSecretJsonKey("password");

    // When the missing key is selected.
    const error = assertThrowsError(() =>
      key.valueIn(JSON.stringify({ user: "orders" })),
    );

    // Then it names the key, which is the part of the ARN to look at.
    assertStringIncludes(error.message, "holds no password key");
  });

  it("refuses a secret that is not JSON", () => {
    // Given a secret holding a plain string.
    const key = new SimEcsSecretJsonKey("password");

    // When a key of it is selected.
    const error = assertThrowsError(() => key.valueIn("hunter2"));

    // Then it says the secret is not JSON, rather than reporting a missing key.
    assertStringIncludes(error.message, "is not JSON");
  });

  it("refuses a secret that is JSON but not an object", () => {
    // Given a secret holding a JSON array.
    const key = new SimEcsSecretJsonKey("password");

    // When a key of it is selected.
    const error = assertThrowsError(() => key.valueIn(JSON.stringify(["one"])));

    // Then it says there is no object to take a key from.
    assertStringIncludes(error.message, "is not a JSON object");
  });

  it("refuses a key whose value is not text", () => {
    // Given a secret whose key holds a number.
    const key = new SimEcsSecretJsonKey("port");

    // When it is selected.
    const error = assertThrowsError(() =>
      key.valueIn(JSON.stringify({ port: 5432 })),
    );

    // Then it refuses rather than choosing how to write the value out, since
    // an environment variable can only be text.
    assertStringIncludes(error.message, "rather than a string");
  });
});
