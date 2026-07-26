import { describe, expect, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimIamIncompleteSignature } from "./error/sim-iam-sigv4.error.js";
import {
  exampleAccessKeyId as accessKeyId,
  signerEndpoint as endpoint,
} from "../../../../test/sigv4/sim-signer.js";

const scope = "20260726/us-east-1/lambda/aws4_request";
const amzDate = "20260726T093000Z";
const signature = "00".repeat(32);

/**
 * Build a request carrying a hand-made Authorization header, so signature
 * parsing can be exercised without a real signature behind it.
 */
function requestWithAuthorization(
  authorization: string | undefined,
  headers?: Record<string, string>,
): Request {
  const dated = headers ?? { "x-amz-date": amzDate };

  return new Request(endpoint, {
    headers: authorization === undefined ? dated : { ...dated, authorization },
  });
}

function verifying(request: Request): () => void {
  const simAws = new SimAws();

  return () => {
    simAws.verifySignedRequest(request);
  };
}

describe("A malformed SigV4 signature", () => {
  it("rejects a request with no Authorization header", () => {
    // Given an unsigned request
    // When it is verified
    // Then there is nothing to verify, and it says so
    expect(verifying(requestWithAuthorization(undefined))).toThrow(
      /no Authorization header/,
    );
  });

  it("rejects an Authorization header using another algorithm", () => {
    // Given a request signed with something that is not SigV4
    const request = requestWithAuthorization("Basic dXNlcjpwYXNz");

    // When it is verified
    // Then the algorithm is named as the problem
    expect(verifying(request)).toThrow(/is not AWS4-HMAC-SHA256/);
  });

  it("rejects a Credential that names no scope", () => {
    // Given a Credential field with no scope after the access key id
    const request = requestWithAuthorization(
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}, ` +
        `SignedHeaders=host;x-amz-date, Signature=${signature}`,
    );

    // When it is verified
    // Then the Credential shape is reported
    expect(verifying(request)).toThrow(/must be <access-key-id>\/<scope>/);
  });

  it("rejects a credential scope with the wrong number of parts", () => {
    // Given a scope missing its service
    const request = requestWithAuthorization(
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/20260726/us-east-1/aws4_request, ` +
        `SignedHeaders=host;x-amz-date, Signature=${signature}`,
    );

    // When it is verified
    // Then the expected scope shape is described
    expect(verifying(request)).toThrow(
      /<date>\/<region>\/<service>\/aws4_request/,
    );
  });

  it("rejects a credential scope with an unrecognisable date", () => {
    // Given a scope whose date is not a YYYYMMDD stamp
    const request = requestWithAuthorization(
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/2026-07-26/us-east-1/lambda/aws4_request, ` +
        `SignedHeaders=host;x-amz-date, Signature=${signature}`,
    );

    // When it is verified
    // Then the date format is reported
    expect(verifying(request)).toThrow(/must be 8 digits/);
  });

  it("rejects a credential scope that does not end with the terminator", () => {
    // Given a scope ending in something other than aws4_request
    const request = requestWithAuthorization(
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/20260726/us-east-1/lambda/aws5_request, ` +
        `SignedHeaders=host;x-amz-date, Signature=${signature}`,
    );

    // When it is verified
    // Then the terminator is reported
    expect(verifying(request)).toThrow(/must end with aws4_request/);
  });

  it("rejects an Authorization header with no SignedHeaders", () => {
    // Given an Authorization header missing the list of signed headers
    const request = requestWithAuthorization(
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, ` +
        `Signature=${signature}`,
    );

    // When it is verified
    // Then the missing field is named
    expect(verifying(request)).toThrow(/missing its SignedHeaders field/);
  });

  it("rejects an Authorization header with no Signature", () => {
    // Given an Authorization header missing the signature itself
    const request = requestWithAuthorization(
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, ` +
        `SignedHeaders=host;x-amz-date`,
    );

    // When it is verified
    // Then the missing field is named
    expect(verifying(request)).toThrow(/missing its Signature field/);
  });

  it("rejects a signed request carrying no X-Amz-Date", () => {
    // Given a signature with no stamp saying when it was made
    const request = requestWithAuthorization(
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, ` +
        `SignedHeaders=host, Signature=${signature}`,
      {},
    );

    // When it is verified
    // Then the missing stamp is reported
    expect(verifying(request)).toThrow(SimIamIncompleteSignature);
  });

  it("rejects an X-Amz-Date that is not an ISO 8601 basic stamp", () => {
    // Given a stamp in the wrong format
    const request = requestWithAuthorization(
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, ` +
        `SignedHeaders=host, Signature=${signature}`,
      { "x-amz-date": "2026-07-26T09:30:00Z" },
    );

    // When it is verified
    // Then the expected stamp format is described
    expect(verifying(request)).toThrow(/YYYYMMDDTHHMMSSZ/);
  });

  it("rejects an X-Amz-Date on a different day from its credential scope", () => {
    // Given a signature whose stamp and scope disagree about the day
    const request = requestWithAuthorization(
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, ` +
        `SignedHeaders=host, Signature=${signature}`,
      { "x-amz-date": "20260725T093000Z" },
    );

    // When it is verified
    // Then the disagreement is reported: a signer cannot contradict itself,
    // and both values feed the signature
    expect(verifying(request)).toThrow(/is not on the day its credential/);
  });
});
