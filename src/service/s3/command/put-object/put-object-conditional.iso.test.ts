import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { assertIdentical, assertThrowsErrorAsync } from "@kensio/smartass";
import { faker } from "@faker-js/faker";
import { describe, it } from "vitest";

import { SimSdk } from "../../../../sdk/index.js";

describe("S3 PutObjectCommand conditional writes", () => {
  it("refuses If-None-Match * onto an existing key and keeps the Object", async () => {
    // Given an intercepted client and a key that already holds an Object.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const bucketName = `conditional-${faker.string.uuid()}`;
    const key = `${faker.string.uuid()}.txt`;
    const original = faker.lorem.sentence();

    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    await client.send(
      new PutObjectCommand({ Bucket: bucketName, Key: key, Body: original }),
    );

    // When a put asks to write only if the key is empty.
    const error = await assertThrowsErrorAsync(async () =>
      client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: faker.lorem.sentence(),
          IfNoneMatch: "*",
        }),
      ),
    );

    // Then S3 refuses it and the first Object is still there.
    assertIdentical(error.name, "PreconditionFailed");
    assertIdentical(
      (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode,
      412,
    );

    const stored = await client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: key }),
    );
    assertIdentical(await stored.Body?.transformToString(), original);
  });

  it("writes with If-None-Match * onto a missing key", async () => {
    // Given an intercepted client and an empty Bucket.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const bucketName = `conditional-${faker.string.uuid()}`;
    const key = `${faker.string.uuid()}.txt`;
    const body = faker.lorem.sentence();

    await client.send(new CreateBucketCommand({ Bucket: bucketName }));

    // When a put asks to write only if the key is empty.
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        IfNoneMatch: "*",
      }),
    );

    // Then the Object is written.
    const stored = await client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: key }),
    );
    assertIdentical(await stored.Body?.transformToString(), body);
  });

  it("writes with If-None-Match * over a delete marker", async () => {
    // Given a versioned Bucket whose key's current version is a delete marker.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const bucketName = `conditional-${faker.string.uuid()}`;
    const key = `${faker.string.uuid()}.txt`;
    const body = faker.lorem.sentence();

    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    await client.send(
      new PutBucketVersioningCommand({
        Bucket: bucketName,
        VersioningConfiguration: { Status: "Enabled" },
      }),
    );
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: faker.lorem.sentence(),
      }),
    );
    await client.send(
      new DeleteObjectCommand({ Bucket: bucketName, Key: key }),
    );

    // When a put asks to write only if the key is empty.
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        IfNoneMatch: "*",
      }),
    );

    // Then the marker does not count as an Object and the write goes ahead.
    const stored = await client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: key }),
    );
    assertIdentical(await stored.Body?.transformToString(), body);
  });

  it("writes with If-Match naming the current ETag", async () => {
    // Given a key holding an Object whose ETag the caller kept.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const bucketName = `conditional-${faker.string.uuid()}`;
    const key = `${faker.string.uuid()}.txt`;
    const replacement = faker.lorem.sentence();

    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    const first = await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: faker.lorem.sentence(),
      }),
    );

    // When a put names that ETag as the one it expects to replace.
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: replacement,
        IfMatch: first.ETag,
      }),
    );

    // Then the Object is replaced.
    const stored = await client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: key }),
    );
    assertIdentical(await stored.Body?.transformToString(), replacement);
  });

  it("refuses If-Match naming a stale ETag and keeps the Object", async () => {
    // Given a key whose Object changed after the caller read its ETag.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const bucketName = `conditional-${faker.string.uuid()}`;
    const key = `${faker.string.uuid()}.txt`;
    const current = faker.lorem.sentence();

    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    const stale = await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: `${current} (stale)`,
      }),
    );
    await client.send(
      new PutObjectCommand({ Bucket: bucketName, Key: key, Body: current }),
    );

    // When a put names the stale ETag.
    const error = await assertThrowsErrorAsync(async () =>
      client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: faker.lorem.sentence(),
          IfMatch: stale.ETag,
        }),
      ),
    );

    // Then S3 refuses it and the current Object is untouched.
    assertIdentical(error.name, "PreconditionFailed");

    const stored = await client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: key }),
    );
    assertIdentical(await stored.Body?.transformToString(), current);
  });

  it("answers NoSuchKey to If-Match on a missing key", async () => {
    // Given an empty Bucket.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const bucketName = `conditional-${faker.string.uuid()}`;
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));

    // When a put expects an Object to be there already.
    const error = await assertThrowsErrorAsync(async () =>
      client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: `${faker.string.uuid()}.txt`,
          Body: faker.lorem.sentence(),
          IfMatch: `"${faker.string.hexadecimal({ length: 32, prefix: "" })}"`,
        }),
      ),
    );

    // Then S3 reports the key missing.
    assertIdentical(error.name, "NoSuchKey");
  });

  it("refuses If-None-Match naming an ETag", async () => {
    // Given an empty Bucket.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const bucketName = `conditional-${faker.string.uuid()}`;
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));

    // When a put gives If-None-Match something other than *.
    const error = await assertThrowsErrorAsync(async () =>
      client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: `${faker.string.uuid()}.txt`,
          Body: faker.lorem.sentence(),
          IfNoneMatch: `"${faker.string.hexadecimal({ length: 32, prefix: "" })}"`,
        }),
      ),
    );

    // Then S3 answers that it does not do that.
    assertIdentical(error.name, "NotImplemented");
  });
});
