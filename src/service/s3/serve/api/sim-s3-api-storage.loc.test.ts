import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  DeleteBucketEncryptionCommand,
  GetBucketEncryptionCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutBucketEncryptionCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { assertIdentical, assertTrue } from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAwsLocalServer } from "../../../../serve/index.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimAws } from "../../../aws/sim-aws.js";

/**
 * Where and how S3 keeps an Object, over the served REST endpoint.
 *
 * The storage class and the encryption travel as headers on the way in and on
 * the way out, and the Bucket's default encryption travels as an XML document,
 * so what these cover is whether either survives the round trip.
 */
describe("Serving simulated S3 storage classes and encryption", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });

  let client: S3Client;

  beforeAll(async () => {
    await srv.listen();

    const simIam = simAws.iam();

    await simIam.createUser(new CreateUserCommand({ UserName: "Writer" }));
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "Writer",
        PolicyName: "Served",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: { Effect: "Allow", Action: "*", Resource: "*" },
        }),
      }),
    );
    const created = await simIam.createAccessKey(
      new CreateAccessKeyCommand({ UserName: "Writer" }),
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

  it("round-trips a default encryption configuration", async () => {
    // Given a Bucket configured for KMS through the endpoint
    await client.send(new CreateBucketCommand({ Bucket: "encrypted" }));
    await client.send(
      new PutBucketEncryptionCommand({
        Bucket: "encrypted",
        ServerSideEncryptionConfiguration: {
          Rules: [
            {
              ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "aws:kms" },
              BucketKeyEnabled: true,
            },
          ],
        },
      }),
    );

    // When the configuration is read back, and then removed
    const read = await client.send(
      new GetBucketEncryptionCommand({ Bucket: "encrypted" }),
    );
    await client.send(
      new DeleteBucketEncryptionCommand({ Bucket: "encrypted" }),
    );
    const removed = await client.send(
      new GetBucketEncryptionCommand({ Bucket: "encrypted" }),
    );

    // Then the rule survived the XML document in both directions, and the
    // Bucket went back to the SSE-S3 default rather than to nothing at all
    const rule = read.ServerSideEncryptionConfiguration?.Rules?.[0];
    assertDefined(rule, "the encryption rule");
    assertIdentical(
      rule.ApplyServerSideEncryptionByDefault?.SSEAlgorithm,
      "aws:kms",
    );
    assertTrue(rule.BucketKeyEnabled);
    assertIdentical(
      removed.ServerSideEncryptionConfiguration?.Rules?.[0]
        ?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm,
      "AES256",
    );
  });

  it("carries an Object's storage class and encryption over the endpoint", async () => {
    // Given an Object uploaded into an archival class through the endpoint
    await client.send(new CreateBucketCommand({ Bucket: "endpoint-archive" }));
    await client.send(
      new PutObjectCommand({
        Bucket: "endpoint-archive",
        Key: "ledgers/2026.csv",
        Body: "a,b",
        StorageClass: "GLACIER",
      }),
    );

    // When the Object is read and listed
    const read = await client.send(
      new GetObjectCommand({
        Bucket: "endpoint-archive",
        Key: "ledgers/2026.csv",
      }),
    );
    const listing = await client.send(
      new ListObjectsV2Command({ Bucket: "endpoint-archive" }),
    );

    // Then the class arrived on the way in and comes back on the way out,
    // alongside the encryption S3 stamped on it
    assertIdentical(read.StorageClass, "GLACIER");
    assertIdentical(read.ServerSideEncryption, "AES256");
    assertIdentical(listing.Contents?.[0]?.StorageClass, "GLACIER");
  });
});
