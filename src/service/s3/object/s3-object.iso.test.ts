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

    // Then its ETag describes the bytes it holds.
    assertIdentical(object.etag, simS3ObjectETag(Buffer.from("contents")));
  });

  it("describes the bytes it holds now, not the ones it was made with", () => {
    // Given a stored Object whose body has been written to in place, which a
    // Buffer allows however little anything here does it.
    const body = Buffer.from("before");
    const object = new SimS3Object({ key: "a.txt", body });
    body.write("after!");

    // Then the ETag follows the bytes, rather than being remembered from
    // before them and describing content the Bucket no longer holds.
    assertIdentical(object.etag, simS3ObjectETag(Buffer.from("after!")));
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

    // And hands out a copy, so a caller adjusting the Date it was given does
    // not change what the Bucket reports from then on.
    const reported = object.lastModified;
    reported.setFullYear(1999);
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
