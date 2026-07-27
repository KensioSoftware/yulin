import { assertInstanceOf, assertThrowsError } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimIamIncompleteSignature } from "../error/sim-iam-sigv4.error.js";
import { exampleAccessKeyId } from "../../../../../test/sigv4/sim-signer.js";
import { presignedTestUrl } from "../../../../../test/sigv4/presigned-test-url.js";
import { SimIamSigV4PresignedQuery } from "./sim-iam-sigv4-presigned-query.js";

describe("Refusing a malformed presigned URL", () => {
  it("refuses an algorithm that is not SigV4", () => {
    // Given a URL presigned with SigV4A, which is not simulated
    const url = presignedTestUrl({
      "X-Amz-Algorithm": "AWS4-ECDSA-P256-SHA256",
    });

    // Then it is refused by name rather than failing as a bad signature
    const error = assertThrowsError(() => SimIamSigV4PresignedQuery.parse(url));
    assertInstanceOf(error, SimIamIncompleteSignature);
    expect(error.message).toMatch(/AWS4-ECDSA-P256-SHA256/);
  });

  it("refuses a credential that names no scope", () => {
    expect(() =>
      SimIamSigV4PresignedQuery.parse(
        presignedTestUrl({ "X-Amz-Credential": exampleAccessKeyId }),
      ),
    ).toThrow(SimIamIncompleteSignature);
  });

  it("refuses a URL missing a parameter the signature needs", () => {
    for (const missing of [
      "X-Amz-Credential",
      "X-Amz-SignedHeaders",
      "X-Amz-Signature",
      "X-Amz-Date",
      "X-Amz-Expires",
    ]) {
      expect(() =>
        SimIamSigV4PresignedQuery.parse(
          presignedTestUrl({ [missing]: undefined }),
        ),
      ).toThrow(SimIamIncompleteSignature);
    }
  });

  it("refuses a signing stamp that disagrees with its own scope", () => {
    expect(() =>
      SimIamSigV4PresignedQuery.parse(
        presignedTestUrl({ "X-Amz-Date": "20260728T120000Z" }),
      ),
    ).toThrow(/not on the day its credential scope names/);
  });

  it("refuses a stamp whose digits name no real instant", () => {
    // Given stamps that are well formed digits and not times: a clock reading
    // that does not exist, and a day February never has
    for (const amzDate of ["20260727T246000Z", "20260230T120000Z"]) {
      const dateStamp = amzDate.slice(0, 8);

      expect(() =>
        SimIamSigV4PresignedQuery.parse(
          presignedTestUrl({
            "X-Amz-Date": amzDate,
            "X-Amz-Credential": `${exampleAccessKeyId}/${dateStamp}/eu-west-2/s3/aws4_request`,
          }),
        ),
      ).toThrow(SimIamIncompleteSignature);
    }
  });

  it("refuses a lifetime AWS would not have signed", () => {
    // Given lifetimes outside the one second to seven days AWS allows
    for (const expires of ["0", "604801", "nine hundred", "-1"]) {
      expect(() =>
        SimIamSigV4PresignedQuery.parse(
          presignedTestUrl({ "X-Amz-Expires": expires }),
        ),
      ).toThrow(SimIamIncompleteSignature);
    }
  });
});
