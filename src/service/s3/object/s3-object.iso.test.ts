import { assertIdentical, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { simS3ObjectETag } from "./s3-object-etag.js";
import { SimS3Object } from "./s3-object.js";

describe("SimS3Object", () => {
  it("identifies its content by the ETag S3 would give it", () => {
    // Given a stored Object.
    const object = new SimS3Object({
      key: "a.txt",
      body: Buffer.from("contents"),
    });

    // When its ETag is read, twice, since it is computed on demand and kept.
    // Then both answers describe the bytes it holds.
    assertIdentical(object.etag, simS3ObjectETag(Buffer.from("contents")));
    assertIdentical(object.etag, simS3ObjectETag(Buffer.from("contents")));
  });

  it("gives two Objects with the same content the same ETag", () => {
    // Given the same bytes stored under different keys.
    const one = new SimS3Object({ key: "a.txt", body: Buffer.from("same") });
    const other = new SimS3Object({ key: "b.txt", body: Buffer.from("same") });

    // Then they are recognisably the same content, which is the whole point of
    // comparing ETags rather than modification times.
    assertIdentical(one.etag, other.etag);
  });

  it("is dated when it was told it was written", () => {
    // Given an Object written at a known instant.
    const writtenAt = new Date("2026-08-12T09:30:00.000Z");
    const object = new SimS3Object({ lastModified: writtenAt });

    // Then it reports that instant.
    assertIdentical(object.lastModified.toISOString(), writtenAt.toISOString());

    // And holds its own copy, so moving the caller's Date does not move it.
    writtenAt.setFullYear(1999);
    assertIdentical(object.lastModified.getUTCFullYear(), 2026);
  });

  it("is dated now when nothing says when it was written", () => {
    // Given an Object made without a write time, as a test fixture is.
    const before = Date.now();
    const object = new SimS3Object();

    // Then it is dated at the moment it was made rather than left undated.
    assertTrue(object.lastModified.getTime() >= before);
  });
});
