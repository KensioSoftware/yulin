import { createHash } from "node:crypto";
import {
  assertIdentical,
  assertStringEndsWith,
  assertStringNotIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simS3MultipartETag,
  simS3ObjectETag,
  simS3QuotedETag,
  simS3UnquotedETag,
} from "./s3-object-etag.js";

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

  it("carries no part count, which is what says the Object arrived in one piece", () => {
    // Given content large enough that real S3 tooling might upload it in parts.
    // When its ETag is computed as a single-part upload.
    const etag = simS3ObjectETag(Buffer.alloc(16 * 1024 * 1024, 7));

    // Then it is a plain digest with no `-N` suffix, which is the difference a
    // tool comparing content hashes reads before trusting one.
    assertStringNotIncludes(etag, "-");
  });
});

describe("simS3MultipartETag", () => {
  it("hashes the part digests and counts the parts, as real S3 does", () => {
    // Given the MD5s of two parts of an upload.
    const first = simS3ObjectETag(Buffer.from("first part"));
    const second = simS3ObjectETag(Buffer.from("second part"));

    // When the completed Object's ETag is computed from them.
    const etag = simS3MultipartETag([first, second]);

    // Then it is the MD5 of the raw part digests, joined, with the part count
    // after it: the value AWS itself would have answered with.
    const digests = [first, second].map((digest) => Buffer.from(digest, "hex"));
    const overParts = createHash("md5")
      .update(Buffer.concat(digests))
      .digest("hex");

    assertIdentical(etag, `${overParts}-2`);
  });

  it("differs from the digest of the joined bytes", () => {
    // Given content sent as two parts.
    const first = Buffer.from("hello ");
    const second = Buffer.from("world");

    // When the multipart ETag is computed.
    const etag = simS3MultipartETag([
      simS3ObjectETag(first),
      simS3ObjectETag(second),
    ]);

    // Then it says so, rather than reporting the MD5 of the whole content. A
    // caller told the plain digest would compare it against its own file and
    // conclude, wrongly, that the upload had gone astray.
    assertStringEndsWith(etag, "-2");
    assertStringNotIncludes(
      etag,
      simS3ObjectETag(Buffer.concat([first, second])),
    );
  });
});

describe("simS3UnquotedETag", () => {
  it("takes the quotes off an ETag a client sent back", () => {
    // Given the ETag an UploadPart response carried.
    // When a completion names the part by it.
    const digest = simS3UnquotedETag('"d41d8cd98f00b204e9800998ecf8427e"');

    // Then it is comparable against the digest S3 stored.
    assertIdentical(digest, "d41d8cd98f00b204e9800998ecf8427e");
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
