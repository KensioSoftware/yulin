import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  DeleteObjectTaggingCommand,
  GetObjectTaggingCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAwsLocalServer } from "../../../../serve/index.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimAws } from "../../../aws/sim-aws.js";

/**
 * Object tags over the served REST endpoint.
 *
 * The tag set travels as a header on a write and as an XML document on the
 * three tagging operations, and the operation itself is named by a `?tagging`
 * sub-resource rather than in the path. What these cover is whether a tag set
 * survives that round trip.
 */
describe("Serving simulated S3 Object tagging", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });

  let client: S3Client;

  beforeAll(async () => {
    await srv.listen();

    const simIam = simAws.iam();

    await simIam.createUser(new CreateUserCommand({ UserName: "Tagger" }));
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "Tagger",
        PolicyName: "Served",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: { Effect: "Allow", Action: "*", Resource: "*" },
        }),
      }),
    );
    const created = await simIam.createAccessKey(
      new CreateAccessKeyCommand({ UserName: "Tagger" }),
    );

    assertDefined(created.AccessKey.AccessKeyId, "the access key id");
    assertDefined(created.AccessKey.SecretAccessKey, "the secret access key");

    client = new S3Client({
      region: simAws.defaultRegionName,
      endpoint: `http://localhost:${srv.port}`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: created.AccessKey.AccessKeyId,
        secretAccessKey: created.AccessKey.SecretAccessKey,
      },
    });
  });

  afterAll(async () => {
    await srv.close();
  });

  it("round-trips a tag set through the tagging operations", async () => {
    // Given an Object stored through the endpoint
    await client.send(new CreateBucketCommand({ Bucket: "tagged" }));
    await client.send(
      new PutObjectCommand({
        Bucket: "tagged",
        Key: "reports/quarterly.csv",
        Body: "period,total",
      }),
    );

    // When a tag set is put on it and read back
    await client.send(
      new PutObjectTaggingCommand({
        Bucket: "tagged",
        Key: "reports/quarterly.csv",
        Tagging: {
          TagSet: [
            { Key: "department", Value: "finance" },
            { Key: "retention", Value: "long" },
          ],
        },
      }),
    );
    const read = await client.send(
      new GetObjectTaggingCommand({
        Bucket: "tagged",
        Key: "reports/quarterly.csv",
      }),
    );

    // Then the tags arrived back as they were sent
    assertArrayLength(read.TagSet, 2);
    assertIdentical(read.TagSet[0].Key, "department");
    assertIdentical(read.TagSet[0].Value, "finance");
    assertIdentical(read.TagSet[1].Key, "retention");
    assertIdentical(read.TagSet[1].Value, "long");
  });

  it("stores the tags a write sent in its header", async () => {
    // Given a Bucket
    await client.send(new CreateBucketCommand({ Bucket: "tagged-on-write" }));

    // When an Object is written with a tag set
    await client.send(
      new PutObjectCommand({
        Bucket: "tagged-on-write",
        Key: "reports/quarterly.csv",
        Body: "period,total",
        Tagging: "department=finance",
      }),
    );

    // Then a read of its tags reports them
    const read = await client.send(
      new GetObjectTaggingCommand({
        Bucket: "tagged-on-write",
        Key: "reports/quarterly.csv",
      }),
    );

    assertArrayLength(read.TagSet, 1);
    assertIdentical(read.TagSet[0].Value, "finance");
  });

  it("takes every tag off an Object", async () => {
    // Given a tagged Object
    await client.send(new CreateBucketCommand({ Bucket: "untagged" }));
    await client.send(
      new PutObjectCommand({
        Bucket: "untagged",
        Key: "reports/quarterly.csv",
        Body: "period,total",
        Tagging: "department=finance&retention=long",
      }),
    );

    // When its tags are deleted
    await client.send(
      new DeleteObjectTaggingCommand({
        Bucket: "untagged",
        Key: "reports/quarterly.csv",
      }),
    );

    // Then it carries none
    const read = await client.send(
      new GetObjectTaggingCommand({
        Bucket: "untagged",
        Key: "reports/quarterly.csv",
      }),
    );

    assertArrayEmpty(read.TagSet);
  });
});
