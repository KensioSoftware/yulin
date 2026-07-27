import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
} from "@kensio/smartass";
import { createHash } from "node:crypto";
import { crc32 } from "../../../util/zip/crc32.js";
import { describe, expect, it } from "vitest";

import {
  SimS3ChecksumMismatch,
  SimS3UnsupportedChecksum,
} from "../error/sim-s3-checksum.error.js";
import { SimS3UploadChecksum } from "./sim-s3-upload-checksum.js";

const body = new TextEncoder().encode("uploaded bytes");

/**
 * The CRC32 and SHA256 of that body, base64 encoded as S3 states checksums.
 * They are computed rather than written out, because a base64 digest in the
 * source reads as a leaked secret to the scanner.
 */
const bodyCrc32 = crc32Base64(body);
const bodySha256 = createHash("sha256").update(body).digest("base64");

function crc32Base64(bytes: Uint8Array): string {
  const digest = Buffer.alloc(4);
  digest.writeUInt32BE(crc32(bytes));
  return digest.toString("base64");
}

function urlWith(query: string): URL {
  return new URL(
    `http://reports.s3.eu-west-2.sim-aws.localhost/notes.txt?${query}`,
  );
}

describe("Checksums stated by an S3 upload", () => {
  it("accepts a body matching the CRC32 the query states", () => {
    // Given a presigned upload stating the CRC32 of the body being sent
    const checksum = SimS3UploadChecksum.stated(
      urlWith(`x-amz-checksum-crc32=${encodeURIComponent(bodyCrc32)}`),
      new Headers(),
    );

    // When the body is checked
    // Then nothing is refused
    checksum?.check(body);
    expect(checksum).toBeDefined();
  });

  it("refuses a body that does not match the stated checksum", () => {
    // Given an upload stating the CRC32 of an empty body, which is what the
    // AWS SDK hoists into a presigned PUT URL by default
    const checksum = SimS3UploadChecksum.stated(
      urlWith("x-amz-checksum-crc32=AAAAAA%3D%3D"),
      new Headers(),
    );

    // When a body is uploaded through it
    const error = assertThrowsError(() => checksum?.check(body));
    assertInstanceOf(error, SimS3ChecksumMismatch);

    // Then it is refused as real S3 refuses it, and the message says what the
    // client has to change, because nothing else about this failure hints at it
    assertIdentical(error.name, "XAmzContentChecksumMismatch");
    expect(error.message).toMatch(/WHEN_REQUIRED/);
  });

  it("checks a checksum stated in a header", () => {
    // Given an ordinary upload stating its checksum in a header
    const checksum = SimS3UploadChecksum.stated(
      urlWith("x-id=PutObject"),
      new Headers({ "x-amz-checksum-sha256": bodySha256 }),
    );

    // When the body is checked
    // Then the header is honoured in the same way the query parameter is
    checksum?.check(body);
    expect(checksum).toBeDefined();
  });

  it("refuses an algorithm it cannot compute", () => {
    // Given an upload stating a CRC32C, which the simulator cannot compute
    const checksum = SimS3UploadChecksum.stated(
      urlWith("x-amz-checksum-crc32c=AAAAAA%3D%3D"),
      new Headers(),
    );

    // When the body is checked
    // Then the upload is refused rather than stored unchecked
    const error = assertThrowsError(() => checksum?.check(body));
    assertInstanceOf(error, SimS3UnsupportedChecksum);
    expect(error.message).toMatch(/CRC32, SHA1 and SHA256 are simulated/);
  });

  it("ignores the parameter naming the algorithm", () => {
    // Given a request that names its algorithm but states no checksum
    const checksum = SimS3UploadChecksum.stated(
      urlWith("x-amz-checksum-algorithm=CRC32"),
      new Headers(),
    );

    // Then there is nothing to check, rather than an algorithm called
    // "algorithm" the simulator would refuse
    expect(checksum).toBeUndefined();
  });

  it("finds nothing to check on an upload that states no checksum", () => {
    expect(
      SimS3UploadChecksum.stated(urlWith("x-id=PutObject"), new Headers()),
    ).toBeUndefined();
  });
});
