import { describe, expect, it } from "vitest";

import { SimIamInvalidCredentials } from "../credential/error/sim-iam-credential.error.js";
import {
  SimIamSignatureDoesNotMatch,
  SimIamSigV4Error,
} from "./error/sim-iam-sigv4.error.js";
import { simIamSigV4CredentialFailure } from "./sim-iam-sigv4-credential-failure.js";
import { simIamSigV4SignaturesMatch } from "./sim-iam-sigv4-signature-match.js";
import { exampleAccessKeyId as accessKeyId } from "../../../../test/sigv4/sim-signer.js";

describe("Restating a credential failure for a signed request", () => {
  it("passes through a value when nothing fails", () => {
    // Given a lookup that succeeds
    // When it is run
    // Then its result is returned untouched
    expect(simIamSigV4CredentialFailure(accessKeyId, () => "resolved")).toBe(
      "resolved",
    );
  });

  it("restates a credential rejection as an AWS error code", () => {
    // Given a lookup rejecting an unknown access key
    const failing = (): never => {
      throw new SimIamInvalidCredentials({
        accessKeyId,
        reason: "unknown-access-key",
      });
    };

    // When it is run
    // Then the failure arrives as the code real AWS answers with
    expect(() => simIamSigV4CredentialFailure(accessKeyId, failing)).toThrow(
      expect.objectContaining({ code: "InvalidClientTokenId" }),
    );
  });

  it("treats a secret mismatch as a signature failure", () => {
    // Given a rejection that a signed request has no way to cause, since it
    // presents no secret to mismatch
    const failing = (): never => {
      throw new SimIamInvalidCredentials({
        accessKeyId,
        reason: "secret-access-key-mismatch",
      });
    };

    // When it is run
    // Then it is reported as the signature failing rather than the credential
    expect(() => simIamSigV4CredentialFailure(accessKeyId, failing)).toThrow(
      SimIamSignatureDoesNotMatch,
    );
  });

  it("lets an unrelated failure through unchanged", () => {
    // Given a lookup failing for a reason that is not about credentials
    const failing = (): never => {
      throw new TypeError("something else went wrong");
    };

    // When it is run
    // Then it is not disguised as a SigV4 rejection
    expect(() => simIamSigV4CredentialFailure(accessKeyId, failing)).toThrow(
      TypeError,
    );
    expect(() =>
      simIamSigV4CredentialFailure(accessKeyId, failing),
    ).not.toThrow(SimIamSigV4Error);
  });
});

describe("Comparing SigV4 signatures", () => {
  const expected = "ab".repeat(32);

  it("accepts the signature it calculated", () => {
    expect(simIamSigV4SignaturesMatch(expected, expected)).toBe(true);
  });

  it("rejects a signature of a different length", () => {
    expect(simIamSigV4SignaturesMatch(expected, "abcd")).toBe(false);
  });

  it("rejects a signature that is not hexadecimal at all", () => {
    // Given a signature that would decode to arbitrary bytes
    // When it is compared
    // Then it is refused rather than being partially decoded
    expect(simIamSigV4SignaturesMatch(expected, "not a signature")).toBe(false);
  });
});
