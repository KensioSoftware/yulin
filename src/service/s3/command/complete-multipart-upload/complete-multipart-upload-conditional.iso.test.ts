import {
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { assertIdentical, assertThrowsErrorAsync } from "@kensio/smartass";
import { faker } from "@faker-js/faker";
import { describe, it } from "vitest";

import { SimSdk } from "../../../../sdk/index.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

/**
 * Start an upload of one part, answering what a completion has to name.
 */
async function givenOnePartUpload(
  client: S3Client,
  bucketName: string,
  key: string,
  body: string,
): Promise<{ uploadId: string; etag: string | undefined }> {
  const started = await client.send(
    new CreateMultipartUploadCommand({ Bucket: bucketName, Key: key }),
  );
  assertDefined(started.UploadId, "the issued upload id");

  const part = await client.send(
    new UploadPartCommand({
      Bucket: bucketName,
      Key: key,
      UploadId: started.UploadId,
      PartNumber: 1,
      Body: body,
    }),
  );

  return { uploadId: started.UploadId, etag: part.ETag };
}

describe("S3 CompleteMultipartUploadCommand conditional writes", () => {
  it("refuses If-None-Match * onto an existing key and keeps the upload", async () => {
    // Given an upload in progress for a key that already holds an Object.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const bucketName = `conditional-${faker.string.uuid()}`;
    const key = `${faker.string.uuid()}.bin`;
    const original = faker.lorem.sentence();
    const uploaded = faker.lorem.sentence();

    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    await client.send(
      new PutObjectCommand({ Bucket: bucketName, Key: key, Body: original }),
    );
    const { uploadId, etag } = await givenOnePartUpload(
      client,
      bucketName,
      key,
      uploaded,
    );
    const parts = { Parts: [{ PartNumber: 1, ETag: etag }] };

    // When the completion asks to write only if the key is empty.
    const error = await assertThrowsErrorAsync(async () =>
      client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucketName,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: parts,
          IfNoneMatch: "*",
        }),
      ),
    );

    // Then S3 refuses it and the existing Object is untouched.
    assertIdentical(error.name, "PreconditionFailed");

    const stored = await client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: key }),
    );
    assertIdentical(await stored.Body?.transformToString(), original);

    // And the upload can still be completed without the condition.
    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucketName,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: parts,
      }),
    );
    const replaced = await client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: key }),
    );
    assertIdentical(await replaced.Body?.transformToString(), uploaded);
  });

  it("completes with If-Match naming the current ETag", async () => {
    // Given an upload in progress for a key whose Object's ETag is known.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const bucketName = `conditional-${faker.string.uuid()}`;
    const key = `${faker.string.uuid()}.bin`;
    const uploaded = faker.lorem.sentence();

    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    const existing = await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: faker.lorem.sentence(),
      }),
    );
    const { uploadId, etag } = await givenOnePartUpload(
      client,
      bucketName,
      key,
      uploaded,
    );

    // When the completion names that ETag as the one it expects to replace.
    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucketName,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: [{ PartNumber: 1, ETag: etag }] },
        IfMatch: existing.ETag,
      }),
    );

    // Then the uploaded Object replaces it.
    const stored = await client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: key }),
    );
    assertIdentical(await stored.Body?.transformToString(), uploaded);
  });
});
