import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import {
  CreateBucketCommand,
  GetObjectCommand,
  ListMultipartUploadsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertStringEndsWith,
  assertStringNotIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  simS3MultipartETag,
  simS3ObjectETag,
  simS3QuotedETag,
} from "../../object/s3-object-etag.js";
import { SimSdk } from "../../../../sdk/index.js";
import { simS3BodyToBuffer } from "../../storage/s3-body-buffer.js";

/**
 * Uploading through `@aws-sdk/lib-storage`, which is what production code does.
 *
 * The individual multipart operations are covered by their own tests, and this
 * one exists because passing those does not prove this works. `Upload` decides
 * on its own which path to take, and it takes the single-part one below its
 * part size: a test fixture of a few bytes therefore exercises PutObject and
 * says nothing about the code path a real file goes down. Both paths are driven
 * here from bodies sized either side of that threshold, so a change that breaks
 * either one fails here rather than in a caller's production upload.
 */
describe("Simulated S3 upload through lib-storage", () => {
  // What `Upload` splits a body at unless it is told otherwise, and the
  // smallest part size S3 accepts, so a test cannot shrink it to save memory.
  const partSize = 5 * 1024 * 1024;

  const interceptedClient = async (
    simSdk: SimSdk,
    bucketName: string,
  ): Promise<S3Client> => {
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));

    return client;
  };

  // The stored bytes as a length and a digest rather than the bytes
  // themselves. A body of this size is compared this way because a failed
  // comparison of two multi-megabyte Buffers leaves the test runner building a
  // diff it cannot finish, which costs a suite run rather than a test.
  const storedDigest = async (
    client: S3Client,
    bucketName: string,
    key: string,
  ): Promise<string> => {
    const read = await client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: key }),
    );
    assertDefined(read.Body, "the read Object body");
    const body = await simS3BodyToBuffer(read.Body as Readable);

    return `${body.length} bytes, md5 ${simS3ObjectETag(body)}`;
  };

  const expectedDigest = (body: Buffer): string =>
    `${body.length} bytes, md5 ${simS3ObjectETag(body)}`;

  it("uploads a body larger than the part size in parts", async () => {
    // Given a body of three parts' worth, each part filled differently so that
    // parts joined in the wrong order do not read back as the original bytes.
    using simSdk = new SimSdk();
    const client = await interceptedClient(simSdk, "lib-storage");
    const parts = [
      Buffer.alloc(partSize, "a"),
      Buffer.alloc(partSize, "b"),
      Buffer.alloc(2 * 1024 * 1024, "c"),
    ];
    const body = Buffer.concat(parts);

    // When lib-storage uploads it, choosing its own path as production would.
    const upload = new Upload({
      client,
      params: { Bucket: "lib-storage", Key: "big.bin", Body: body },
    });
    const completed = await upload.done();

    // Then the Object holds the bytes that went in, in order.
    assertIdentical(
      await storedDigest(client, "lib-storage", "big.bin"),
      expectedDigest(body),
    );

    // And it carries the multipart ETag over the three parts lib-storage sent,
    // which is how a caller comparing hashes tells the two forms apart.
    const expected = simS3QuotedETag(
      simS3MultipartETag(parts.map((part) => simS3ObjectETag(part))),
    );
    assertIdentical(completed.ETag, expected);
    assertStringEndsWith(expected, '-3"');

    // And nothing is left in progress: the upload was completed, not abandoned
    // with its parts still holding storage as an interrupted one would.
    const inProgress = await client.send(
      new ListMultipartUploadsCommand({ Bucket: "lib-storage" }),
    );
    assertArrayEmpty(inProgress.Uploads ?? []);
  });

  it("uploads a body smaller than the part size in one request", async () => {
    // Given a body of the size a test fixture usually is, which lib-storage
    // sends as a single PutObject rather than starting an upload for.
    using simSdk = new SimSdk();
    const client = await interceptedClient(simSdk, "small-uploads");
    const body = Buffer.from("small enough to go in one request");

    // When lib-storage uploads it.
    const upload = new Upload({
      client,
      params: { Bucket: "small-uploads", Key: "small.txt", Body: body },
    });
    const completed = await upload.done();

    // Then the Object is the plain MD5 of its bytes, with no part-count suffix,
    // which is what says the single-part path was the one taken.
    assertIdentical(
      await storedDigest(client, "small-uploads", "small.txt"),
      expectedDigest(body),
    );
    assertIdentical(
      completed.ETag,
      simS3QuotedETag(createHash("md5").update(body).digest("hex")),
    );
    assertStringNotIncludes(completed.ETag ?? "", "-");
  });

  it("reports progress across the parts it sends", async () => {
    // Given an upload of two parts with its progress being watched, as an
    // upload of a file of real size is.
    using simSdk = new SimSdk();
    const client = await interceptedClient(simSdk, "progress");
    const body = Buffer.alloc(partSize + 1024, "d");
    const upload = new Upload({
      client,
      params: { Bucket: "progress", Key: "watched.bin", Body: body },
    });
    const loadedAtEachStep: number[] = [];
    upload.on("httpUploadProgress", (progress) => {
      loadedAtEachStep.push(progress.loaded ?? 0);
    });

    // When it runs to completion.
    await upload.done();

    // Then progress was reported once per part and reached the whole body, so
    // a caller driving a progress bar off this sees it finish.
    assertArrayLength(loadedAtEachStep, 2);
    assertIdentical(loadedAtEachStep.at(-1), body.length);
  });

  it("uploads a stream, whose length it cannot know in advance", async () => {
    // Given a body arriving as a stream, which is how a file being read or a
    // response being passed straight through reaches an upload. Its length is
    // not known when the upload starts, so lib-storage reads it part by part.
    using simSdk = new SimSdk();
    const client = await interceptedClient(simSdk, "streamed");
    const parts = [Buffer.alloc(partSize, "f"), Buffer.from("tail")];
    const body = Readable.from(parts);

    // When lib-storage uploads it.
    const completed = await new Upload({
      client,
      params: { Bucket: "streamed", Key: "streamed.bin", Body: body },
    }).done();

    // Then the Object holds the whole stream, under a two-part ETag.
    assertIdentical(
      await storedDigest(client, "streamed", "streamed.bin"),
      expectedDigest(Buffer.concat(parts)),
    );
    assertStringEndsWith(completed.ETag ?? "", '-2"');
  });
});
