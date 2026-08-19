import type { Readable } from "node:stream";

import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { assertDefined } from "../../../../util/type-guard/defined.js";
import { simS3BodyToBuffer } from "../../storage/s3-body-buffer.js";
import { SimS3 } from "../../sim-s3.js";

/**
 * Reading part of a simulated S3 Object.
 *
 * This is the path anything downloading a file of real size takes: the `aws`
 * CLI above eight megabytes asks for the parts at once and joins them by the
 * offsets it asked for, so an answer carrying more bytes than the request asked
 * for writes a file that is neither the right size nor the right content.
 */
describe("Simulated S3 GetObject with a Range", () => {
  /** The digits, so the offset of every byte is the byte itself. */
  const content = "0123456789";

  const bucketHolding = async (body: string): Promise<SimS3> => {
    const simS3 = new SimS3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "widgets" }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "widgets",
        Key: "digits.txt",
        Body: body,
      }),
    );

    return simS3;
  };

  const readContent = async (body: Readable | undefined): Promise<string> => {
    assertDefined(body, "the read Object body");

    const buffer = await simS3BodyToBuffer(body);

    return buffer.toString("utf8");
  };

  const readWholeObject = async (
    simS3: SimS3,
    header: string,
  ): Promise<{ body: string; contentRange: string | undefined }> => {
    const read = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "widgets",
        Key: "digits.txt",
        Range: header,
      }),
    );

    return {
      body: await readContent(read.Body),
      contentRange: read.ContentRange,
    };
  };

  it("answers a start and end with the bytes between them", async () => {
    // Given an Object of known bytes
    const simS3 = await bucketHolding(content);

    // When bytes two to five are asked for
    const read = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "widgets",
        Key: "digits.txt",
        Range: "bytes=2-5",
      }),
    );

    // Then those bytes come back, described by where in the Object they are
    assertIdentical(await readContent(read.Body), "2345");
    assertIdentical(read.ContentLength, 4);
    assertIdentical(read.ContentRange, "bytes 2-5/10");
  });

  it("answers a start alone with the rest of the Object", async () => {
    // Given an Object of known bytes
    const simS3 = await bucketHolding(content);

    // When everything from byte six is asked for
    const read = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "widgets",
        Key: "digits.txt",
        Range: "bytes=6-",
      }),
    );

    // Then the read runs to the end of the Object
    assertIdentical(await readContent(read.Body), "6789");
    assertIdentical(read.ContentRange, "bytes 6-9/10");
  });

  it("answers a suffix with the last bytes of the Object", async () => {
    // Given an Object of known bytes
    const simS3 = await bucketHolding(content);

    // When the last three bytes are asked for, without saying where they start
    const read = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "widgets",
        Key: "digits.txt",
        Range: "bytes=-3",
      }),
    );

    // Then the suffix is resolved against the size the Object turned out to be
    assertIdentical(await readContent(read.Body), "789");
    assertIdentical(read.ContentRange, "bytes 7-9/10");
  });

  it("stops a range that runs past the end at the last byte", async () => {
    // Given an Object of known bytes
    const simS3 = await bucketHolding(content);

    // When more bytes are asked for than the Object holds
    const read = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "widgets",
        Key: "digits.txt",
        Range: "bytes=6-99",
      }),
    );

    // Then what there is comes back, which is what a client reading a file
    // whose size it guessed at depends on
    assertIdentical(await readContent(read.Body), "6789");
    assertIdentical(read.ContentRange, "bytes 6-9/10");
  });

  it("answers a suffix longer than the Object with the whole of it", async () => {
    // Given an Object of known bytes
    const simS3 = await bucketHolding(content);

    // When a suffix longer than the Object is asked for
    const read = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "widgets",
        Key: "digits.txt",
        Range: "bytes=-40",
      }),
    );

    // Then the whole Object comes back, still as a partial read
    assertIdentical(await readContent(read.Body), content);
    assertIdentical(read.ContentRange, "bytes 0-9/10");
  });

  it("refuses a range starting past the end of the Object", async () => {
    // Given an Object of known bytes
    const simS3 = await bucketHolding(content);

    // When a range beyond the last byte is asked for
    const error = await assertThrowsErrorAsync(async () => {
      await simS3.getObject(
        new GetObjectCommand({
          Bucket: "widgets",
          Key: "digits.txt",
          Range: "bytes=10-12",
        }),
      );
    });

    // Then it is refused under the name real S3 refuses it by, rather than
    // answered with no bytes
    assertIdentical(error.name, "InvalidRange");
  });

  it("refuses a suffix of no bytes", async () => {
    // Given an Object of known bytes
    const simS3 = await bucketHolding(content);

    // When the last nothing bytes are asked for
    const error = await assertThrowsErrorAsync(async () => {
      await simS3.getObject(
        new GetObjectCommand({
          Bucket: "widgets",
          Key: "digits.txt",
          Range: "bytes=-0",
        }),
      );
    });

    // Then there is no slice to answer with, so it is refused
    assertIdentical(error.name, "InvalidRange");
  });

  it("refuses any range of an empty Object", async () => {
    // Given an Object holding nothing
    const simS3 = await bucketHolding("");

    // When the first byte of it is asked for
    const error = await assertThrowsErrorAsync(async () => {
      await simS3.getObject(
        new GetObjectCommand({
          Bucket: "widgets",
          Key: "digits.txt",
          Range: "bytes=0-",
        }),
      );
    });

    // Then it is refused, there being no byte at any offset
    assertIdentical(error.name, "InvalidRange");
  });

  it("reads a Range it cannot make sense of as no Range at all", async () => {
    // Given an Object of known bytes
    const simS3 = await bucketHolding(content);

    // When ranges S3 does not answer are asked for (another unit, a start after
    // its end, several ranges at once, a header naming neither end of a range,
    // and one naming no range at all)
    const reads = await Promise.all(
      ["items=0-1", "bytes=5-2", "bytes=0-1,4-5", "bytes=-", "bytes"].map(
        async (header) => await readWholeObject(simS3, header),
      ),
    );

    // Then each one answers with the whole Object, describing no range, as a
    // read that asked for none does
    for (const read of reads) {
      assertIdentical(read.body, content);
      assertUndefined(read.contentRange);
    }
  });

  it("gives a partial read the whole Object's ETag", async () => {
    // Given an Object of known bytes
    const simS3 = await bucketHolding(content);

    // When part of it is read
    const whole = await simS3.getObject(
      new GetObjectCommand({ Bucket: "widgets", Key: "digits.txt" }),
    );
    const part = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "widgets",
        Key: "digits.txt",
        Range: "bytes=0-1",
      }),
    );

    // Then it identifies the Object the bytes came from, not the bytes, which
    // is what lets a client check the Object did not change between parts
    assertIdentical(part.ETag, whole.ETag);
  });

  it("leaves a read of the whole Object as it was", async () => {
    // Given an Object of known bytes
    const simS3 = await bucketHolding(content);

    // When it is read with no Range
    const read = await simS3.getObject(
      new GetObjectCommand({ Bucket: "widgets", Key: "digits.txt" }),
    );

    // Then the whole Object comes back, describing no range
    assertIdentical(await readContent(read.Body), content);
    assertIdentical(read.ContentLength, 10);
    assertUndefined(read.ContentRange);
  });
});
