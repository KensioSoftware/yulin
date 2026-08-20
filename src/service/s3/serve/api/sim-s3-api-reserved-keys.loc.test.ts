import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { assertIdentical } from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAwsLocalServer } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

/**
 * Object keys holding the characters a real Bucket is full of: a space in a
 * filename someone typed, an ampersand, a percent sign of the key's own.
 *
 * These reach the endpoint percent-encoded, and the encoding is what the
 * client signed over. The path has to survive verification exactly as it
 * arrived for any of these operations to be reachable at all.
 */
describe("Serving Objects whose keys hold reserved characters", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });

  let client: S3Client;

  beforeAll(async () => {
    await srv.listen();

    const simIam = simAws.iam();

    await simIam.createUser(new CreateUserCommand({ UserName: "Archivist" }));
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "Archivist",
        PolicyName: "Served",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: { Effect: "Allow", Action: "s3:*", Resource: "*" },
        }),
      }),
    );
    const created = await simIam.createAccessKey(
      new CreateAccessKeyCommand({ UserName: "Archivist" }),
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

    await client.send(new CreateBucketCommand({ Bucket: "reserved" }));
  });

  afterAll(async () => {
    await srv.close();
  });

  it.each([
    ["quarterly report.pdf"],
    ["plus+key.txt"],
    ["sales&marketing.txt"],
    ["report(1).txt"],
    ["width=100.txt"],
    ["someone@example.com.txt"],
    ["pct%20literal.txt"],
    ["2026/q1 results/final draft.txt"],
  ])("writes, reads, describes and deletes %s", async (key) => {
    // Given an Object written to the served endpoint under the key
    await client.send(
      new PutObjectCommand({ Bucket: "reserved", Key: key, Body: key }),
    );

    // When it is described and read back
    const head = await client.send(
      new HeadObjectCommand({ Bucket: "reserved", Key: key }),
    );
    const read = await client.send(
      new GetObjectCommand({ Bucket: "reserved", Key: key }),
    );

    // Then both found the Object the key names
    assertIdentical(head.ContentLength, key.length);
    assertIdentical(await read.Body?.transformToString(), key);

    // And the listing reports the key with the characters it was written with
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: "reserved", Prefix: key }),
    );
    assertDefined(listed.Contents, "the listed Objects");
    assertIdentical(listed.Contents[0]?.Key, key);

    // And deleting it takes that same Object away again
    await client.send(
      new DeleteObjectCommand({ Bucket: "reserved", Key: key }),
    );

    const remaining = await client.send(
      new ListObjectsV2Command({ Bucket: "reserved", Prefix: key }),
    );
    assertIdentical(remaining.KeyCount, 0);
  });
});
