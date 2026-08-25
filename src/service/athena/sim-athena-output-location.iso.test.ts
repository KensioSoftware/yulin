import { assertIdentical, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAthenaOutputLocation } from "./execution/sim-athena-output-location.js";

describe("simulated Athena output locations", () => {
  it("reads a Bucket out of an output location with no prefix", () => {
    // Given a location naming a Bucket and nothing else.
    const location = new SimAthenaOutputLocation("s3://results");

    // When a key is built for one query.
    // Then it sits at the root of the Bucket.
    assertIdentical(location.bucketName, "results");
    assertIdentical(location.keyFor("abc"), "abc.csv");
  });

  it("adds the separator a prefix left off", () => {
    // Given a prefix written without a trailing slash, which a template does.
    const location = new SimAthenaOutputLocation("s3://results/queries");

    // When a key is built.
    // Then the query lands under the prefix rather than beside it.
    assertIdentical(location.keyFor("abc"), "queries/abc.csv");
  });

  it("refuses an output location naming no Bucket", () => {
    // Given a location that is an S3 URI and nothing more.
    let refusal = "";

    // When it is read.
    try {
      new SimAthenaOutputLocation("s3://");
    } catch (error) {
      refusal = error instanceof Error ? error.message : "";
    }

    // Then it is refused.
    assertStringIncludes(refusal, "names no Bucket");
  });
});
