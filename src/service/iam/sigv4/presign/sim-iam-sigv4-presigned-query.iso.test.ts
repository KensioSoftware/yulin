import { assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { exampleAccessKeyId } from "../../../../../test/sigv4/sim-signer.js";
import {
  presignedTestSignedAt,
  presignedTestUrl,
} from "../../../../../test/sigv4/presigned-test-url.js";
import { SimIamSigV4PresignedQuery } from "./sim-iam-sigv4-presigned-query.js";

describe("Reading the signature a presigned URL carries", () => {
  it("reads the access key, scope and signed headers", () => {
    // Given a well formed presigned URL
    const presigned = SimIamSigV4PresignedQuery.parse(presignedTestUrl());

    // Then the same facts an Authorization header states are read from it
    assertIdentical(presigned.accessKeyId, exampleAccessKeyId);
    assertIdentical(presigned.scope.serviceName, "s3");
    assertIdentical(presigned.scope.regionName, "eu-west-2");
    expect(presigned.signedHeaderNames).toStrictEqual(["host"]);
    assertIdentical(presigned.amzDate, presignedTestSignedAt);
  });

  it("reads parameters whatever case their names are written in", () => {
    // Given a client that lower-cases the parameter names
    const url = new URL("http://reports.s3.eu-west-2.sim-aws.localhost/q3.pdf");

    for (const [name, value] of presignedTestUrl().searchParams) {
      url.searchParams.set(name.toLowerCase(), value);
    }

    // Then the signature is still read, as the canonical query already treats
    // the signature parameter without regard to case
    assertIdentical(
      SimIamSigV4PresignedQuery.parse(url).accessKeyId,
      exampleAccessKeyId,
    );
  });

  it("recognises a URL that offers no presigned signature", () => {
    expect(
      SimIamSigV4PresignedQuery.carriedBy(
        new URL("http://reports.s3.eu-west-2.sim-aws.localhost/q3.pdf"),
      ),
    ).toBe(false);
    expect(SimIamSigV4PresignedQuery.carriedBy(presignedTestUrl())).toBe(true);
  });
});
