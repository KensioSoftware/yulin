import {
  assertArrayLength,
  assertIdentical,
  assertObjectMatches,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { simS3ObjectResponseHeaders } from "./s3-object-response-headers.js";

describe("simS3ObjectResponseHeaders", () => {
  it("describes the body length of an Object with no metadata", () => {
    // Given an Object stored without any system metadata.
    // When its response headers are built.
    const headers = simS3ObjectResponseHeaders(undefined, 42);

    // Then only the length of what is being served is reported.
    assertObjectMatches(headers, { "content-length": "42" });
    assertArrayLength(Object.keys(headers), 1);
  });

  it("returns the system metadata S3 was given when the Object was written", () => {
    // Given an Object stored with every system metadata header S3 keeps.
    const metadata = {
      "cache-control": "public, max-age=31536000, immutable",
      "content-disposition": 'attachment; filename="report.csv"',
      "content-encoding": "br",
      "content-language": "en-GB",
      "content-type": "text/csv",
      expires: "Wed, 21 Oct 2026 07:28:00 GMT",
    };

    // When its response headers are built.
    const headers = simS3ObjectResponseHeaders(metadata, 100);

    // Then each one comes back unchanged, alongside the body length.
    assertObjectMatches(headers, { ...metadata, "content-length": "100" });
  });

  it("keeps a content encoding so the body can be decoded", () => {
    // Given an Object stored as brotli.
    // When its response headers are built.
    const headers = simS3ObjectResponseHeaders(
      { "content-encoding": "br", "content-type": "text/plain" },
      7,
    );

    // Then the encoding is reported, because bytes served without it are bytes
    // no client can decode.
    assertObjectMatches(headers, {
      "content-encoding": "br",
      "content-type": "text/plain",
      "content-length": "7",
    });
  });

  it("leaves out user metadata and anything else S3 does not return as a header", () => {
    // Given an Object stored with user metadata alongside its content type.
    const headers = simS3ObjectResponseHeaders(
      { "content-type": "text/plain", "x-amz-meta-author": "hg", etag: "abc" },
      3,
    );

    // Then only the system metadata S3 returns as a header comes back.
    assertObjectMatches(headers, {
      "content-type": "text/plain",
      "content-length": "3",
    });
    assertArrayLength(Object.keys(headers), 2);
  });

  it("reports the length it is given rather than one from metadata", () => {
    // Given an Object whose stored metadata claims a different length.
    // When its response headers are built for a body of a known size.
    const headers = simS3ObjectResponseHeaders({ "content-length": "999" }, 5);

    // Then the body being served decides the length, not what was remembered.
    assertIdentical(headers["content-length"], "5");
  });
});
