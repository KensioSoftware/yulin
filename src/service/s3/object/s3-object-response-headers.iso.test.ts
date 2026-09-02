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
    const headers = simS3ObjectResponseHeaders({ bodyLength: 42 });

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
    const headers = simS3ObjectResponseHeaders({ metadata, bodyLength: 100 });

    // Then each one comes back unchanged, alongside the body length.
    assertObjectMatches(headers, { ...metadata, "content-length": "100" });
  });

  it("keeps a content encoding so the body can be decoded", () => {
    // Given an Object stored as brotli.
    // When its response headers are built.
    const headers = simS3ObjectResponseHeaders({
      metadata: { "content-encoding": "br", "content-type": "text/plain" },
      bodyLength: 7,
    });

    // Then the encoding is reported, because bytes served without it are bytes
    // no client can decode.
    assertObjectMatches(headers, {
      "content-encoding": "br",
      "content-type": "text/plain",
      "content-length": "7",
    });
  });

  it("leaves out anything else S3 does not return as a header", () => {
    // Given an Object whose stored metadata holds an entity tag under a header
    // name, alongside its content type.
    const headers = simS3ObjectResponseHeaders({
      metadata: { "content-type": "text/plain", etag: "abc" },
      bodyLength: 3,
    });

    // Then only the system metadata S3 returns as a header comes back, and the
    // ETag among it is ignored: an entity tag describes the bytes, so it comes
    // from the Object rather than from whatever was stored under that name.
    assertObjectMatches(headers, {
      "content-type": "text/plain",
      "content-length": "3",
    });
    assertArrayLength(Object.keys(headers), 2);
  });

  it("serves the metadata a caller attached under the x-amz-meta- prefix", () => {
    // Given an Object the write attached two of its own keys to.
    // When its response headers are built.
    const headers = simS3ObjectResponseHeaders({
      metadata: { "content-type": "text/plain" },
      userMetadata: { author: "ada", "review-state": "approved" },
      bodyLength: 3,
    });

    // Then each entry travels as its own header, which is what the SDK reads
    // back into Metadata on the far side of an endpoint.
    assertObjectMatches(headers, {
      "x-amz-meta-author": "ada",
      "x-amz-meta-review-state": "approved",
    });
  });

  it("keeps a user metadata key named after a header S3 sets itself apart from it", () => {
    // Given an Object stored as CSV whose caller also attached a content type
    // of its own.
    // When its response headers are built.
    const headers = simS3ObjectResponseHeaders({
      metadata: { "content-type": "text/csv" },
      userMetadata: { "content-type": "application/vnd.internal" },
      bodyLength: 3,
    });

    // Then the prefix keeps the two apart, and the Object goes on being served
    // as the CSV it was written as.
    assertObjectMatches(headers, {
      "content-type": "text/csv",
      "x-amz-meta-content-type": "application/vnd.internal",
    });
  });

  it("reports the length it is given rather than one from metadata", () => {
    // Given an Object whose stored metadata claims a different length.
    // When its response headers are built for a body of a known size.
    const headers = simS3ObjectResponseHeaders({
      metadata: { "content-length": "999" },
      bodyLength: 5,
    });

    // Then the body being served decides the length, not what was remembered.
    assertIdentical(headers["content-length"], "5");
  });

  it("reports the entity tag and write time of the Object being served", () => {
    // Given an Object with a known content hash, written at a known instant.
    // When its response headers are built.
    const headers = simS3ObjectResponseHeaders({
      bodyLength: 3,
      etag: '"acbd18db4cc2f85cedef654fccc4a4d8"',
      lastModified: new Date("2026-08-12T09:30:00.000Z"),
    });

    // Then a client has what it needs to tell whether its copy is current,
    // with the last-modified time as the HTTP date real S3 sends.
    assertObjectMatches(headers, {
      etag: '"acbd18db4cc2f85cedef654fccc4a4d8"',
      "last-modified": "Wed, 12 Aug 2026 09:30:00 GMT",
    });
  });
});
