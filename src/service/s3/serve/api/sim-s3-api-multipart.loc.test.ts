import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  ListMultipartUploadsCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertStringEndsWith,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAwsLocalServer } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

/**
 * The multipart upload operations reached the way a client outside the process
 * reaches them: an endpoint URL, credentials, and no simulator in sight.
 *
 * S3 states these six in a `?uploads` or `?uploadId` sub-resource on the same
 * methods and paths the single-part operations use, and answers four of them in
 * XML documents an SDK parses. What this covers is whether an upload survives
 * that round trip.
 */
describe("Serving the simulated S3 multipart operations on an endpoint URL", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });

  let client: S3Client;

  beforeAll(async () => {
    await srv.listen();

    const simIam = simAws.iam();
    await simIam.createUser(new CreateUserCommand({ UserName: "Uploader" }));
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "Uploader",
        PolicyName: "Uploads",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: { Effect: "Allow", Action: "*", Resource: "*" },
        }),
      }),
    );
    const created = await simIam.createAccessKey(
      new CreateAccessKeyCommand({ UserName: "Uploader" }),
    );

    client = new S3Client({
      region: simAws.defaultRegionName,
      endpoint: `http://localhost:${srv.port}`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: created.AccessKey.AccessKeyId,
        secretAccessKey: created.AccessKey.SecretAccessKey,
      },
    });

    await client.send(new CreateBucketCommand({ Bucket: "served-uploads" }));
  });

  afterAll(async () => {
    await srv.close();
  });

  async function startUpload(key: string): Promise<string> {
    const started = await client.send(
      new CreateMultipartUploadCommand({ Bucket: "served-uploads", Key: key }),
    );
    assertDefined(started.UploadId, "the issued upload id");

    return started.UploadId;
  }

  it("round-trips an upload sent in parts through the endpoint", async () => {
    // Given an upload started and sent in two parts over HTTP
    const uploadId = await startUpload("joined.txt");

    const first = await client.send(
      new UploadPartCommand({
        Bucket: "served-uploads",
        Key: "joined.txt",
        UploadId: uploadId,
        PartNumber: 1,
        Body: "hello ",
      }),
    );
    const second = await client.send(
      new UploadPartCommand({
        Bucket: "served-uploads",
        Key: "joined.txt",
        UploadId: uploadId,
        PartNumber: 2,
        Body: "world",
      }),
    );

    // When the upload is completed
    const completed = await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: "served-uploads",
        Key: "joined.txt",
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [
            { PartNumber: 1, ETag: first.ETag },
            { PartNumber: 2, ETag: second.ETag },
          ],
        },
      }),
    );

    // Then the Object is readable, and its ETag says it arrived in two parts
    assertStringEndsWith(completed.ETag ?? "", '-2"');
    assertIdentical(completed.Key, "joined.txt");

    const read = await client.send(
      new GetObjectCommand({ Bucket: "served-uploads", Key: "joined.txt" }),
    );
    assertIdentical(await read.Body?.transformToString(), "hello world");
  });

  it("reports what is in flight, and what one upload holds", async () => {
    // Given an upload with a part stored against it
    const uploadId = await startUpload("listed.bin");
    await client.send(
      new UploadPartCommand({
        Bucket: "served-uploads",
        Key: "listed.bin",
        UploadId: uploadId,
        PartNumber: 1,
        Body: "twelve chars",
      }),
    );

    // When the uploads and their parts are listed
    const uploads = await client.send(
      new ListMultipartUploadsCommand({
        Bucket: "served-uploads",
        Prefix: "listed.bin",
      }),
    );
    const parts = await client.send(
      new ListPartsCommand({
        Bucket: "served-uploads",
        Key: "listed.bin",
        UploadId: uploadId,
      }),
    );

    // Then both listings survived their XML documents, sizes and all
    assertDefined(uploads.Uploads, "the uploads in progress");
    assertArrayLength(uploads.Uploads, 1);
    assertIdentical(uploads.Uploads[0].UploadId, uploadId);

    assertDefined(parts.Parts, "the stored parts");
    assertArrayLength(parts.Parts, 1);
    assertIdentical(parts.Parts[0].PartNumber, 1);
    assertIdentical(parts.Parts[0].Size, 12);
  });

  it("abandons an upload, and then does not know it", async () => {
    // Given an upload in progress
    const uploadId = await startUpload("abandoned.bin");

    // When it is aborted
    const aborted = await client.send(
      new AbortMultipartUploadCommand({
        Bucket: "served-uploads",
        Key: "abandoned.bin",
        UploadId: uploadId,
      }),
    );

    // Then it is gone, and asking about it again is the S3 error a client
    // retrying an upload it has lost track of reads
    assertIdentical(aborted.$metadata.httpStatusCode, 204);

    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(
          new ListPartsCommand({
            Bucket: "served-uploads",
            Key: "abandoned.bin",
            UploadId: uploadId,
          }),
        ),
    );
    assertIdentical(error.name, "NoSuchUpload");
  });

  it("says a Bucket has nothing in flight rather than saying nothing", async () => {
    // Given a Bucket with no upload in progress
    await client.send(new CreateBucketCommand({ Bucket: "quiet-uploads" }));

    // When its uploads are listed
    const listed = await client.send(
      new ListMultipartUploadsCommand({ Bucket: "quiet-uploads" }),
    );

    // Then the listing is empty rather than absent, which is what a caller
    // reaching for `Uploads ?? []` gets from real S3 too
    assertUndefined(listed.Uploads);
    assertIdentical(listed.Bucket, "quiet-uploads");
  });
});
