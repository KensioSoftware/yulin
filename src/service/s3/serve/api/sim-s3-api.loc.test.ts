import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  GetBucketPolicyCommand,
  PutBucketPolicyCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetBucketAclCommand,
  GetObjectCommand,
  GetPublicAccessBlockCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAwsLocalServer } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

/**
 * Simulated S3 reached the way a client outside the process reaches it: an
 * endpoint URL, credentials, and no simulator in sight.
 *
 * S3 speaks REST-XML rather than the AWS JSON protocol the other served
 * services speak, so what these cover is whether an operation survives the
 * round trip through a method, a path, a query string and an XML document.
 */
describe("Serving the simulated S3 REST API on an endpoint URL", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });

  let client: S3Client;
  let readOnlyClient: S3Client;

  beforeAll(async () => {
    await srv.listen();

    client = await s3ClientFor("Writer", {
      Effect: "Allow",
      Action: "*",
      Resource: "*",
    });
    readOnlyClient = await s3ClientFor("Reader", {
      Effect: "Allow",
      Action: "s3:ListBucket",
      Resource: "*",
    });
  });

  afterAll(async () => {
    await srv.close();
  });

  async function s3ClientFor(
    username: string,
    statement: object,
  ): Promise<S3Client> {
    const simIam = simAws.iam();

    await simIam.createUser(new CreateUserCommand({ UserName: username }));
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: username,
        PolicyName: "Served",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: statement,
        }),
      }),
    );
    const created = await simIam.createAccessKey(
      new CreateAccessKeyCommand({ UserName: username }),
    );

    return new S3Client({
      region: simAws.defaultRegionName,
      endpoint: `http://localhost:${srv.port}`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: created.AccessKey.AccessKeyId,
        secretAccessKey: created.AccessKey.SecretAccessKey,
      },
    });
  }

  it("creates a Bucket and lists it back", async () => {
    // Given a Bucket created through the served endpoint
    await client.send(new CreateBucketCommand({ Bucket: "listed-bucket" }));

    // When the Buckets are listed
    const listed = await client.send(new ListBucketsCommand({}));

    // Then the new Bucket is among them
    assertDefined(listed.Buckets, "the listed Buckets");
    assertTrue(
      listed.Buckets.some((bucket) => bucket.Name === "listed-bucket"),
    );
  });

  it("round-trips an Object through the endpoint", async () => {
    // Given an Object written through the served endpoint
    await client.send(new CreateBucketCommand({ Bucket: "round-trip" }));
    await client.send(
      new PutObjectCommand({
        Bucket: "round-trip",
        Key: "nested/one.txt",
        Body: "hello from HTTP",
        ContentType: "text/plain",
      }),
    );

    // When it is read back
    const read = await client.send(
      new GetObjectCommand({ Bucket: "round-trip", Key: "nested/one.txt" }),
    );

    // Then the body and its content type both survived the round trip
    assertIdentical(await read.Body?.transformToString(), "hello from HTTP");
    assertIdentical(read.ContentType, "text/plain");
  });

  it("lists Objects with their sizes, and filters by prefix", async () => {
    // Given a Bucket holding Objects under two prefixes
    await client.send(new CreateBucketCommand({ Bucket: "listing" }));
    await client.send(
      new PutObjectCommand({ Bucket: "listing", Key: "a/one", Body: "12345" }),
    );
    await client.send(
      new PutObjectCommand({ Bucket: "listing", Key: "b/two", Body: "123" }),
    );

    // When the whole Bucket is listed
    const all = await client.send(
      new ListObjectsV2Command({ Bucket: "listing" }),
    );

    // Then every Object came back, with the size it was written with
    assertIdentical(all.KeyCount, 2);

    assertDefined(all.Contents, "the listed Objects");
    const [firstListed] = all.Contents;
    assertDefined(firstListed, "the first listed Object");
    assertIdentical(firstListed.Key, "a/one");
    assertIdentical(firstListed.Size, 5);

    // And a prefix narrows the listing to the Objects under it
    const prefixed = await client.send(
      new ListObjectsV2Command({ Bucket: "listing", Prefix: "b/" }),
    );

    assertDefined(prefixed.Contents, "the Objects under the prefix");
    assertArrayLength(prefixed.Contents, 1);

    const [onlyPrefixed] = prefixed.Contents;
    assertDefined(onlyPrefixed, "the only Object under the prefix");
    assertIdentical(onlyPrefixed.Key, "b/two");
  });

  it("removes Objects one at a time and in a batch", async () => {
    // Given a Bucket holding two Objects
    await client.send(new CreateBucketCommand({ Bucket: "removals" }));
    await client.send(
      new PutObjectCommand({ Bucket: "removals", Key: "one", Body: "1" }),
    );
    await client.send(
      new PutObjectCommand({ Bucket: "removals", Key: "two", Body: "2" }),
    );

    // When one is removed on its own and the other in a batch
    await client.send(
      new DeleteObjectCommand({ Bucket: "removals", Key: "one" }),
    );
    const batch = await client.send(
      new DeleteObjectsCommand({
        Bucket: "removals",
        Delete: { Objects: [{ Key: "two" }] },
      }),
    );

    // Then the batch reported what it removed, and the Bucket is empty
    assertIdentical(batch.Deleted?.[0]?.Key, "two");

    const remaining = await client.send(
      new ListObjectsV2Command({ Bucket: "removals" }),
    );

    assertIdentical(remaining.KeyCount, 0);
  });

  it("round-trips a Block Public Access configuration", async () => {
    // Given a Bucket with Block Public Access configured through the endpoint
    await client.send(new CreateBucketCommand({ Bucket: "access-block" }));
    await client.send(
      new PutPublicAccessBlockCommand({
        Bucket: "access-block",
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          RestrictPublicBuckets: false,
        },
      }),
    );

    // When the configuration is read back
    const read = await client.send(
      new GetPublicAccessBlockCommand({ Bucket: "access-block" }),
    );

    // Then the settings survived the XML document in both directions
    const configuration = read.PublicAccessBlockConfiguration;
    assertDefined(configuration, "the Block Public Access configuration");
    assertTrue(configuration.BlockPublicAcls);
    assertFalse(configuration.RestrictPublicBuckets);
  });

  it("round-trips a Bucket policy, which travels as JSON rather than XML", async () => {
    // Given a Bucket with a policy set through the served endpoint. The
    // principal is the Account rather than everyone, because Block Public
    // Access refuses a public policy here exactly as it does in real S3.
    await client.send(new CreateBucketCommand({ Bucket: "policied" }));

    const policy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::policied/*",
        },
      ],
    });

    await client.send(
      new PutBucketPolicyCommand({ Bucket: "policied", Policy: policy }),
    );

    // When it is read back
    const read = await client.send(
      new GetBucketPolicyCommand({ Bucket: "policied" }),
    );

    // Then the document survived, which the XML path never touches
    assertDefined(read.Policy, "the Bucket policy");
    assertIdentical(
      JSON.parse(read.Policy).Statement[0].Action,
      "s3:GetObject",
    );
  });

  it("reports a missing Object as the S3 error the SDK expects", async () => {
    // Given a Bucket with nothing under the key being asked for
    await client.send(new CreateBucketCommand({ Bucket: "missing-keys" }));

    // When an absent Object is read
    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(
          new GetObjectCommand({ Bucket: "missing-keys", Key: "absent" }),
        ),
    );

    // Then the SDK raised it under the AWS error name rather than a parse
    // failure, which is what reading the XML error shape buys
    assertIdentical(error.name, "NoSuchKey");
  });

  it("refuses a caller the Bucket policy does not allow to write", async () => {
    // Given a Bucket and a client allowed only to list
    await client.send(new CreateBucketCommand({ Bucket: "read-only" }));

    // When it attempts a write
    const error = await assertThrowsErrorAsync(
      async () =>
        await readOnlyClient.send(
          new PutObjectCommand({
            Bucket: "read-only",
            Key: "denied",
            Body: "nope",
          }),
        ),
    );

    // Then simulated IAM denied it, in the S3 error shape
    assertIdentical(error.name, "AccessDenied");
    assertStringIncludes(error.message, "s3:PutObject");
  });

  it("refuses an operation whose method it has no route for", async () => {
    // Given a Bucket holding an Object
    await client.send(new CreateBucketCommand({ Bucket: "no-route" }));
    await client.send(
      new PutObjectCommand({ Bucket: "no-route", Key: "one", Body: "1" }),
    );

    // When a HEAD is asked for, which simulated S3 has no operation behind
    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(
          new HeadObjectCommand({ Bucket: "no-route", Key: "one" }),
        ),
    );

    // Then it is refused rather than answered from a route meant for a
    // different method
    assertIdentical(
      (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode,
      501,
    );
  });

  it("refuses a sub-resource it does not serve instead of answering something else", async () => {
    // Given a Bucket that exists
    await client.send(new CreateBucketCommand({ Bucket: "sub-resources" }));

    // When an operation simulated S3 does not serve is asked for, which shares
    // its method and path with the Object listing
    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(new GetBucketAclCommand({ Bucket: "sub-resources" })),
    );

    // Then it is refused by name, rather than quietly answered with a listing
    assertIdentical(error.name, "NotImplemented");
    assertStringIncludes(error.message, "acl");
  });
});
