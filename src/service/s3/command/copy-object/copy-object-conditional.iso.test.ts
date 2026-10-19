import {
  CopyObjectCommand,
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { assertIdentical, assertThrowsErrorAsync } from "@kensio/smartass";
import { faker } from "@faker-js/faker";
import { describe, it } from "vitest";

import { SimSdk } from "../../../../sdk/index.js";

describe("S3 CopyObjectCommand conditional writes", () => {
  it("refuses If-None-Match * onto an existing key and keeps the Object", async () => {
    // Given a source Object and a destination key that is already taken.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const bucketName = `conditional-${faker.string.uuid()}`;
    const source = `${faker.string.uuid()}.txt`;
    const destination = `${faker.string.uuid()}.txt`;
    const original = faker.lorem.sentence();

    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: source,
        Body: faker.lorem.sentence(),
      }),
    );
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: destination,
        Body: original,
      }),
    );

    // When a copy asks to write only if the destination is empty.
    const error = await assertThrowsErrorAsync(async () =>
      client.send(
        new CopyObjectCommand({
          Bucket: bucketName,
          Key: destination,
          CopySource: `${bucketName}/${source}`,
          IfNoneMatch: "*",
        }),
      ),
    );

    // Then S3 refuses it and the destination keeps what it held.
    assertIdentical(error.name, "PreconditionFailed");
    assertIdentical(
      (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode,
      412,
    );

    const stored = await client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: destination }),
    );
    assertIdentical(await stored.Body?.transformToString(), original);
  });

  it("copies with If-None-Match * onto a missing key", async () => {
    // Given a source Object and a destination key nothing has written.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const bucketName = `conditional-${faker.string.uuid()}`;
    const source = `${faker.string.uuid()}.txt`;
    const destination = `${faker.string.uuid()}.txt`;
    const body = faker.lorem.sentence();

    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    await client.send(
      new PutObjectCommand({ Bucket: bucketName, Key: source, Body: body }),
    );

    // When a copy asks to write only if the destination is empty.
    await client.send(
      new CopyObjectCommand({
        Bucket: bucketName,
        Key: destination,
        CopySource: `${bucketName}/${source}`,
        IfNoneMatch: "*",
      }),
    );

    // Then the copy is written.
    const stored = await client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: destination }),
    );
    assertIdentical(await stored.Body?.transformToString(), body);
  });

  it("copies with If-Match naming the destination's ETag", async () => {
    // Given a destination Object whose ETag the caller kept.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const bucketName = `conditional-${faker.string.uuid()}`;
    const source = `${faker.string.uuid()}.txt`;
    const destination = `${faker.string.uuid()}.txt`;
    const body = faker.lorem.sentence();

    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    await client.send(
      new PutObjectCommand({ Bucket: bucketName, Key: source, Body: body }),
    );
    const existing = await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: destination,
        Body: faker.lorem.sentence(),
      }),
    );

    // When a copy names that ETag as the one it expects to replace.
    await client.send(
      new CopyObjectCommand({
        Bucket: bucketName,
        Key: destination,
        CopySource: `${bucketName}/${source}`,
        IfMatch: existing.ETag,
      }),
    );

    // Then the destination is replaced by the copy.
    const stored = await client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: destination }),
    );
    assertIdentical(await stored.Body?.transformToString(), body);
  });

  it("refuses If-Match naming a different ETag and keeps the Object", async () => {
    // Given a destination Object and an ETag that is not its own.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const bucketName = `conditional-${faker.string.uuid()}`;
    const source = `${faker.string.uuid()}.txt`;
    const destination = `${faker.string.uuid()}.txt`;
    const original = faker.lorem.sentence();

    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    const sourcePut = await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: source,
        Body: `${original} (source)`,
      }),
    );
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: destination,
        Body: original,
      }),
    );

    // When a copy expects the destination to carry the source's ETag.
    const error = await assertThrowsErrorAsync(async () =>
      client.send(
        new CopyObjectCommand({
          Bucket: bucketName,
          Key: destination,
          CopySource: `${bucketName}/${source}`,
          IfMatch: sourcePut.ETag,
        }),
      ),
    );

    // Then S3 refuses it and the destination keeps what it held.
    assertIdentical(error.name, "PreconditionFailed");

    const stored = await client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: destination }),
    );
    assertIdentical(await stored.Body?.transformToString(), original);
  });

  it("refuses a source that fails CopySourceIfMatch", async () => {
    // Given a source Object and an ETag that is not its own.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const bucketName = `conditional-${faker.string.uuid()}`;
    const source = `${faker.string.uuid()}.txt`;

    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: source,
        Body: faker.lorem.sentence(),
      }),
    );

    // When a copy names that ETag as the source it expects.
    const error = await assertThrowsErrorAsync(async () =>
      client.send(
        new CopyObjectCommand({
          Bucket: bucketName,
          Key: `${faker.string.uuid()}.txt`,
          CopySource: `${bucketName}/${source}`,
          CopySourceIfMatch: `"${faker.string.hexadecimal({ length: 32, prefix: "" })}"`,
        }),
      ),
    );

    // Then S3 refuses the copy.
    assertIdentical(error.name, "PreconditionFailed");
  });

  it("refuses a source that fails CopySourceIfNoneMatch", async () => {
    // Given a source Object whose ETag the caller already holds.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const bucketName = `conditional-${faker.string.uuid()}`;
    const source = `${faker.string.uuid()}.txt`;

    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    const put = await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: source,
        Body: faker.lorem.sentence(),
      }),
    );

    // When a copy asks for the source only if it has changed from that ETag.
    // The date condition is ignored, as an ETag condition outranks it.
    const error = await assertThrowsErrorAsync(async () =>
      client.send(
        new CopyObjectCommand({
          Bucket: bucketName,
          Key: `${faker.string.uuid()}.txt`,
          CopySource: `${bucketName}/${source}`,
          CopySourceIfNoneMatch: put.ETag,
          CopySourceIfModifiedSince: faker.date.past({ years: 5 }),
        }),
      ),
    );

    // Then S3 refuses the copy.
    assertIdentical(error.name, "PreconditionFailed");
  });

  it("copies a source that passes its date conditions", async () => {
    // Given a source Object written now.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const bucketName = `conditional-${faker.string.uuid()}`;
    const source = `${faker.string.uuid()}.txt`;
    const destination = `${faker.string.uuid()}.txt`;
    const body = faker.lorem.sentence();

    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    await client.send(
      new PutObjectCommand({ Bucket: bucketName, Key: source, Body: body }),
    );

    // When a copy asks for a source changed since the past and unchanged since
    // the future.
    await client.send(
      new CopyObjectCommand({
        Bucket: bucketName,
        Key: destination,
        CopySource: `${bucketName}/${source}`,
        CopySourceIfModifiedSince: faker.date.past({ years: 5 }),
        CopySourceIfUnmodifiedSince: faker.date.future({ years: 5 }),
      }),
    );

    // Then the copy is written.
    const stored = await client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: destination }),
    );
    assertIdentical(await stored.Body?.transformToString(), body);
  });

  it("refuses a source modified after CopySourceIfUnmodifiedSince", async () => {
    // Given a source Object written now.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const bucketName = `conditional-${faker.string.uuid()}`;
    const source = `${faker.string.uuid()}.txt`;

    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: source,
        Body: faker.lorem.sentence(),
      }),
    );

    // When a copy asks for the source only if it has not changed since a
    // past date.
    const error = await assertThrowsErrorAsync(async () =>
      client.send(
        new CopyObjectCommand({
          Bucket: bucketName,
          Key: `${faker.string.uuid()}.txt`,
          CopySource: `${bucketName}/${source}`,
          CopySourceIfUnmodifiedSince: faker.date.past({ years: 5 }),
        }),
      ),
    );

    // Then S3 refuses the copy.
    assertIdentical(error.name, "PreconditionFailed");
  });
});
