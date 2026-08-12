import { createHash } from "node:crypto";
import {
  assertIdentical,
  assertStringLength,
  assertStringNotIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { simS3ObjectETag, simS3QuotedETag } from "./s3-object-etag.js";

describe("simS3ObjectETag", () => {
  it("is the MD5 of the bytes, as real S3 gives it for a single-part upload", () => {
    // Given some Object content.
    const body = Buffer.from("hello world");

    // When its ETag is computed.
    const etag = simS3ObjectETag(body);

    // Then it matches the MD5 a caller would compute over the same bytes
    // locally, which is what makes a content-hash comparison possible at all.
    assertIdentical(etag, createHash("md5").update(body).digest("hex"));
  });

  it("gives an empty Object the well-known MD5 of nothing", () => {
    // Given an Object stored with no body.
    // When its ETag is computed.
    const etag = simS3ObjectETag(Buffer.alloc(0));

    // Then it is the digest real S3 reports for an empty Object.
    assertIdentical(etag, "d41d8cd98f00b204e9800998ecf8427e");
  });

  it("carries no multipart part count, because nothing here uploads in parts", () => {
    // Given content large enough that real S3 tooling might upload it in parts.
    // When its ETag is computed.
    const etag = simS3ObjectETag(Buffer.alloc(16 * 1024 * 1024, 7));

    // Then it is a plain digest with no `-N` suffix, since this simulation
    // stores an Object in one piece however big it is.
    assertStringNotIncludes(etag, "-");
    assertStringLength(etag, 32);
  });
});

describe("simS3QuotedETag", () => {
  it("quotes the digest the way a response carries it", () => {
    // Given the digest S3 holds for an Object.
    // When it is put on a response.
    const quoted = simS3QuotedETag("d41d8cd98f00b204e9800998ecf8427e");

    // Then it is an HTTP entity tag, quotes and all, which is what the SDK
    // hands a caller unchanged.
    assertIdentical(quoted, '"d41d8cd98f00b204e9800998ecf8427e"');
  });
});
