import {
  CopyObjectCommand,
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertBufferEqual,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { faker } from "@faker-js/faker";
import { Readable } from "node:stream";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { simS3BodyToBuffer } from "../../storage/s3-body-buffer.js";

describe("S3 CopyObjectCommand IAM authorization", () => {
  it("allows a Role holding both the read and the write", async () => {
    // Given a Role allowed to read anything and write anything. A copy asks
    // for both, across the two Buckets it touches.
    const simAws = new SimAws();
    const simS3 = simAws.s3();
    const inbox = `inbox-${faker.string.uuid()}`;
    const archive = `archive-${faker.string.uuid()}`;

    await simS3.createBucket(new CreateBucketCommand({ Bucket: inbox }));
    await simS3.createBucket(new CreateBucketCommand({ Bucket: archive }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: inbox,
        Key: "report.pdf",
        Body: "quarterly figures",
      }),
    );

    const archiver = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "ArchiverRole",
        actions: ["s3:GetObject", "s3:PutObject"],
        resource: "arn:aws:s3:::*/*",
      },
      simAws,
    );

    // When that Role copies the Object into the archive.
    await simS3.copyObject(
      new CopyObjectCommand({
        Bucket: archive,
        Key: "2026/report.pdf",
        CopySource: `${inbox}/report.pdf`,
      }),
      { caller: { kind: "arn", arn: archiver.Arn } },
    );

    // Then the copy is there.
    const copied = await simS3.getObject(
      new GetObjectCommand({ Bucket: archive, Key: "2026/report.pdf" }),
    );

    assertInstanceOf(copied.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(copied.Body),
      Buffer.from("quarterly figures"),
    );
  });

  it("denies a Role that may write the destination but not read the source", async () => {
    // Given a Role allowed to write into the archive and nothing else. A
    // caller holding only this would have looked sufficient to code that
    // copies by putting an Object.
    const simAws = new SimAws();
    const simS3 = simAws.s3();
    const inbox = `inbox-${faker.string.uuid()}`;
    const archive = `archive-${faker.string.uuid()}`;

    await simS3.createBucket(new CreateBucketCommand({ Bucket: inbox }));
    await simS3.createBucket(new CreateBucketCommand({ Bucket: archive }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: inbox,
        Key: "report.pdf",
        Body: "quarterly figures",
      }),
    );

    const writer = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "ArchiveWriterRole",
        actions: ["s3:PutObject"],
        resource: `arn:aws:s3:::${archive}/*`,
      },
      simAws,
    );

    // When it tries to copy the Object it cannot read.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.copyObject(
        new CopyObjectCommand({
          Bucket: archive,
          Key: "2026/report.pdf",
          CopySource: `${inbox}/report.pdf`,
        }),
        { caller: { kind: "arn", arn: writer.Arn } },
      ),
    );

    // Then the read is what refuses it.
    assertIdentical(error.name, "AccessDenied");
    assertStringIncludes(error.message, "s3:GetObject");
  });

  it("denies a Role that may read the source but not write the destination", async () => {
    // Given a Role allowed to read the inbox and nothing else.
    const simAws = new SimAws();
    const simS3 = simAws.s3();
    const inbox = `inbox-${faker.string.uuid()}`;
    const archive = `archive-${faker.string.uuid()}`;

    await simS3.createBucket(new CreateBucketCommand({ Bucket: inbox }));
    await simS3.createBucket(new CreateBucketCommand({ Bucket: archive }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: inbox,
        Key: "report.pdf",
        Body: "quarterly figures",
      }),
    );

    const reader = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "InboxReaderRole",
        actions: ["s3:GetObject"],
        resource: `arn:aws:s3:::${inbox}/*`,
      },
      simAws,
    );

    // When it tries to copy into the archive.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.copyObject(
        new CopyObjectCommand({
          Bucket: archive,
          Key: "2026/report.pdf",
          CopySource: `${inbox}/report.pdf`,
        }),
        { caller: { kind: "arn", arn: reader.Arn } },
      ),
    );

    // Then the write is what refuses it, and the destination key was left
    // empty rather than written before the decision.
    assertIdentical(error.name, "AccessDenied");
    assertStringIncludes(error.message, "s3:PutObject");

    const stored = await simS3
      .getSimBucketByName(archive)
      ?.getObject("2026/report.pdf");
    assertUndefined(stored);
  });
});
