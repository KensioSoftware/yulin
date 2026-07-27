import { describe, it } from "vitest";
import {
  CreateBucketCommand,
  DeleteBucketPolicyCommand,
  GetBucketPolicyCommand,
  ListObjectsCommand,
  PutBucketPolicyCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  assertArrayIncludes,
  assertArrayLength,
  assertIdentical,
  assertObjectEquals,
  assertStringIncludes,
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
              Principal: "*",
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
          Principal: "*",
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

  it("lists its supported SDK Command names", () => {
    const router = new SimS3SdkCommandRouter({} as SimS3);

    const supported = router.supportedCommandNames();

    assertArrayLength(supported, 9);
    assertArrayIncludes(supported, "GetObjectCommand");
    assertArrayIncludes(supported, "GetBucketPolicyCommand");
    assertArrayIncludes(supported, "DeleteBucketPolicyCommand");
    assertUndefined(router.route("HeadObjectCommand"));
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
