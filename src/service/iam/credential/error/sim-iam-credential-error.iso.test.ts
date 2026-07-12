import { describe, it } from "vitest";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import {
  SimIamCredentialError,
  SimIamDuplicateAccessKey,
  SimIamInvalidCredentials,
} from "./sim-iam-credential.error.js";

describe("sim IAM credential errors", () => {
  it("uses the concrete credential error class as the error name", () => {
    // Given a duplicate access key error is created.
    const error = new SimIamDuplicateAccessKey("AKIAEXAMPLE");

    // When its error identity is inspected.
    const errorName = error.name;

    // Then it is a credential error named after its concrete class.
    assertInstanceOf(error, SimIamCredentialError);
    assertIdentical(errorName, "SimIamDuplicateAccessKey");
  });

  it("uses a generic inactive description when no status is supplied", () => {
    // Given an inactive credential error omits the optional key status.
    const error = new SimIamInvalidCredentials({
      accessKeyId: "AKIAEXAMPLE",
      reason: "inactive-access-key",
    });

    // When its diagnostic message is read.
    const message = error.message;

    // Then the message still describes the key as inactive.
    assertStringIncludes(message, "the access key is inactive");
  });

  it("describes an expired session without a timestamp when none is supplied", () => {
    // Given an expired-session error omits the optional expiration.
    const error = new SimIamInvalidCredentials({
      accessKeyId: "ASIATEMPORARY",
      reason: "expired-session",
    });

    // When its diagnostic details are inspected.
    const message = error.message;

    // Then the error reports expiration without inventing a timestamp.
    assertStringIncludes(message, "the session expired");
    assertUndefined(error.expiration);
  });

  it("does not expose secret credential values in mismatch errors", () => {
    // Given a credential error represents a secret access key mismatch.
    const error = new SimIamInvalidCredentials({
      accessKeyId: "AKIAEXAMPLE",
      reason: "secret-access-key-mismatch",
    });

    // When its diagnostic message is read.
    const message = error.message;

    // Then it identifies the component without including a secret value.
    assertIdentical(
      message,
      "Sim IAM could not authenticate access key AKIAEXAMPLE: the secret access key does not match",
    );
  });
});
