import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAthenaScannedLocation } from "./sim-athena-scanned-location.js";

describe("reading an S3 URI a query scans", () => {
  it("reads the Bucket and the prefix apart", () => {
    // Given a URI naming both.
    // When it is read.
    const location = simAthenaScannedLocation(
      "s3://rainlytics-logs/logs/day=1/",
    );

    // Then each comes back on its own.
    assertNonNullable(location);
    assertIdentical(location.bucket, "rainlytics-logs");
    assertIdentical(location.prefix, "logs/day=1/");
  });

  it("reads a Bucket named on its own", () => {
    // Given a URI with no key prefix under it.
    // When it is read.
    const location = simAthenaScannedLocation("s3://rainlytics-logs");

    // Then the prefix is empty, which lists the whole Bucket.
    assertNonNullable(location);
    assertIdentical(location.bucket, "rainlytics-logs");
    assertIdentical(location.prefix, "");
  });

  it("answers with nothing for a URI it cannot read", () => {
    // Given locations with the wrong scheme and with no Bucket.
    // When each is read.
    // Then none of them reads. A table location this cannot follow is skipped
    // rather than refused.
    assertUndefined(simAthenaScannedLocation("https://example.test/logs/"));
    assertUndefined(simAthenaScannedLocation("s3:///logs/"));
    assertUndefined(simAthenaScannedLocation("rainlytics-logs/logs/"));
  });
});
