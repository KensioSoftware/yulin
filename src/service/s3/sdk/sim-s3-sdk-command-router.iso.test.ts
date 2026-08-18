import { describe, it } from "vitest";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteBucketPolicyCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  DeletePublicAccessBlockCommand,
  GetBucketNotificationConfigurationCommand,
  GetBucketPolicyCommand,
  GetPublicAccessBlockCommand,
  ListObjectsCommand,
  ListObjectsV2Command,
  PutBucketNotificationConfigurationCommand,
  PutBucketPolicyCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  assertArrayIncludes,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertObjectEquals,
  assertStringIncludes,
  assertTrue,
  assertTypeObject,
  assertUndefined,
} from "@kensio/smartass";
import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimSdk } from "../../../sdk/index.js";
import type { SimS3 } from "../sim-s3.js";
import { SimS3SdkCommandRouter } from "./sim-s3-sdk-command-router.js";

describe("simulated S3 SDK Command routing", () => {
  it("routes ListObjectsCommand through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    await client.send(new CreateBucketCommand({ Bucket: "bucket-a" }));
    await client.send(
      new PutObjectCommand({ Bucket: "bucket-a", Key: "a.txt", Body: "a" }),
    );
    await client.send(
      new PutObjectCommand({ Bucket: "bucket-a", Key: "b.txt", Body: "b" }),
    );

    const output = await client.send(
      new ListObjectsCommand({ Bucket: "bucket-a" }),
    );

    assertIdentical(output.Contents?.length, 2);
  });

  it("routes ListObjectsV2Command through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    await client.send(new CreateBucketCommand({ Bucket: "bucket-v2" }));
    await client.send(
      new PutObjectCommand({ Bucket: "bucket-v2", Key: "a.txt", Body: "a" }),
    );
    await client.send(
      new PutObjectCommand({ Bucket: "bucket-v2", Key: "b.txt", Body: "b" }),
    );

    const output = await client.send(
      new ListObjectsV2Command({ Bucket: "bucket-v2" }),
    );

    assertIdentical(output.KeyCount, 2);
    assertIdentical(output.Contents?.[0]?.Key, "a.txt");
  });

  it("routes DeleteBucketCommand through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    await client.send(new CreateBucketCommand({ Bucket: "bucket-to-go" }));

    await client.send(new DeleteBucketCommand({ Bucket: "bucket-to-go" }));

    assertUndefined(
      simSdk.simAws.region("us-east-1").s3().getSimBucketByName("bucket-to-go"),
    );
  });

  it("routes PutBucketWebsiteCommand through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    await client.send(new CreateBucketCommand({ Bucket: "bucket-web" }));
    await client.send(
      new PutBucketWebsiteCommand({
        Bucket: "bucket-web",
        WebsiteConfiguration: {
          IndexDocument: { Suffix: "index.html" },
        },
      }),
    );

    const websiteUrl = simSdk.simAws.s3().getBucketWebsiteUrl("bucket-web");

    assertStringIncludes(websiteUrl.href, "bucket-web");
  });

  it("routes PutBucketPolicyCommand through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    await client.send(new CreateBucketCommand({ Bucket: "bucket-policy" }));

    const output = await client.send(
      new PutBucketPolicyCommand({
        Bucket: "bucket-policy",
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { AWS: "arn:aws:iam::222222222222:role/Reader" },
              Action: "s3:GetObject",
              Resource: "arn:aws:s3:::bucket-policy/*",
            },
          ],
        }),
      }),
    );

    assertTypeObject(output.$metadata);
  });

  it("routes GetBucketPolicyCommand and DeleteBucketPolicyCommand through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const policy = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: "arn:aws:iam::222222222222:role/Reader" },
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::bucket-policy-lifecycle/*",
        },
      ],
    };

    await client.send(
      new CreateBucketCommand({ Bucket: "bucket-policy-lifecycle" }),
    );
    await client.send(
      new PutBucketPolicyCommand({
        Bucket: "bucket-policy-lifecycle",
        Policy: JSON.stringify(policy),
      }),
    );

    // The policy round-trips through the intercepted client.
    const readPolicyOut = await client.send(
      new GetBucketPolicyCommand({ Bucket: "bucket-policy-lifecycle" }),
    );
    assertDefined(readPolicyOut.Policy, "GetBucketPolicy output Policy");
    assertObjectEquals(JSON.parse(readPolicyOut.Policy), policy);

    // And removing it goes through the same interception path.
    const deletionOut = await client.send(
      new DeleteBucketPolicyCommand({ Bucket: "bucket-policy-lifecycle" }),
    );
    assertTypeObject(deletionOut.$metadata);
  });

  it("routes the Block Public Access Commands through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    await client.send(new CreateBucketCommand({ Bucket: "bucket-bpa" }));

    await client.send(
      new PutPublicAccessBlockCommand({
        Bucket: "bucket-bpa",
        PublicAccessBlockConfiguration: { BlockPublicPolicy: false },
      }),
    );

    const readOut = await client.send(
      new GetPublicAccessBlockCommand({ Bucket: "bucket-bpa" }),
    );
    assertFalse(readOut.PublicAccessBlockConfiguration?.BlockPublicPolicy);

    // Removing the configuration restores the blocked default.
    await client.send(
      new DeletePublicAccessBlockCommand({ Bucket: "bucket-bpa" }),
    );
    const restoredOut = await client.send(
      new GetPublicAccessBlockCommand({ Bucket: "bucket-bpa" }),
    );
    assertTrue(restoredOut.PublicAccessBlockConfiguration?.BlockPublicPolicy);
  });

  it("routes the Object deletion Commands through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    await client.send(new CreateBucketCommand({ Bucket: "bucket-delete" }));
    await Promise.all(
      ["a.txt", "b.txt", "c.txt"].map(
        async (key) =>
          await client.send(
            new PutObjectCommand({
              Bucket: "bucket-delete",
              Key: key,
              Body: key,
            }),
          ),
      ),
    );

    await client.send(
      new DeleteObjectCommand({ Bucket: "bucket-delete", Key: "a.txt" }),
    );

    const batchOut = await client.send(
      new DeleteObjectsCommand({
        Bucket: "bucket-delete",
        Delete: { Objects: [{ Key: "b.txt" }] },
      }),
    );
    assertIdentical(batchOut.Deleted?.length, 1);

    const listOut = await client.send(
      new ListObjectsCommand({ Bucket: "bucket-delete" }),
    );
    const remaining = listOut.Contents ?? [];
    assertArrayLength(remaining, 1);
    assertIdentical(remaining[0].Key, "c.txt");
  });

  it("routes the Bucket notification configuration Commands", async () => {
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    await client.send(new CreateBucketCommand({ Bucket: "bucket-n" }));
    await client.send(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "bucket-n",
        // Nothing is configured, so nothing has to exist to be notified. What
        // this is about is that both Commands reach simulated S3 at all.
        NotificationConfiguration: {},
      }),
    );

    const read = await client.send(
      new GetBucketNotificationConfigurationCommand({ Bucket: "bucket-n" }),
    );

    assertUndefined(read.LambdaFunctionConfigurations);
  });

  it("lists its supported SDK Command names", () => {
    const router = new SimS3SdkCommandRouter({} as SimS3);

    const supported = router.supportedCommandNames();

    assertArrayLength(supported, 26);
    assertArrayIncludes(supported, "GetObjectCommand");
    assertArrayIncludes(supported, "ListObjectsV2Command");
    assertArrayIncludes(supported, "DeleteBucketCommand");
    assertArrayIncludes(supported, "PutBucketNotificationConfigurationCommand");
    assertArrayIncludes(supported, "GetBucketNotificationConfigurationCommand");
    assertArrayIncludes(supported, "DeleteObjectCommand");
    assertArrayIncludes(supported, "DeleteObjectsCommand");
    assertArrayIncludes(supported, "GetBucketPolicyCommand");
    assertArrayIncludes(supported, "DeleteBucketPolicyCommand");
    assertArrayIncludes(supported, "PutPublicAccessBlockCommand");
    assertArrayIncludes(supported, "HeadObjectCommand");
    assertArrayIncludes(supported, "HeadBucketCommand");
    assertArrayIncludes(supported, "CreateMultipartUploadCommand");
    assertArrayIncludes(supported, "UploadPartCommand");
    assertArrayIncludes(supported, "CompleteMultipartUploadCommand");
    assertArrayIncludes(supported, "AbortMultipartUploadCommand");
    assertArrayIncludes(supported, "ListMultipartUploadsCommand");
    assertArrayIncludes(supported, "ListPartsCommand");
    assertUndefined(router.route("GetBucketAclCommand"));
  });

  it("passes through a GetObject output without a Body", async () => {
    const simS3Stub = {
      getObject: () => Promise.resolve({ $metadata: {} }),
    } as unknown as SimS3;
    const router = new SimS3SdkCommandRouter(simS3Stub);

    const route = router.route("GetObjectCommand");
    assertDefined(route, "GetObjectCommand route should exist");
    const output = await route({ input: {} }, {});

    assertUndefined((output as { Body?: unknown }).Body);
  });
});
