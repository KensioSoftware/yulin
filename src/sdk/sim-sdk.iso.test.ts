import { describe, it } from "vitest";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { DynamoDBClient, ListTablesCommand } from "@aws-sdk/client-dynamodb";
import {
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { SimAws } from "../service/aws/sim-aws.js";
import {
  SimSdkAlreadyInterceptedError,
  SimSdkInvalidClientError,
} from "./error/sim-sdk.error.js";
import { SimSdk } from "./sim-sdk.js";

describe("simulated AWS SDK", () => {
  it("round-trips S3 Commands through an intercepted client alone", async () => {
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    await client.send(new CreateBucketCommand({ Bucket: "bucket-a" }));
    await client.send(
      new PutObjectCommand({
        Bucket: "bucket-a",
        Key: "foo.txt",
        Body: "Hello, world!",
      }),
    );
    const output = await client.send(
      new GetObjectCommand({ Bucket: "bucket-a", Key: "foo.txt" }),
    );

    assertIdentical(await output.Body?.transformToString(), "Hello, world!");
  });

  it("shares state between direct sim service use and intercepted clients", async () => {
    const simAws = new SimAws();
    using simSdk = new SimSdk({ simAws });

    const simS3 = simAws.account().region("eu-west-2").s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-b" }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "bucket-b",
        Key: "bar.txt",
        Body: "Direct sim state",
      }),
    );

    const client = new S3Client({ region: "eu-west-2" });
    simSdk.intercept(client);

    const output = await client.send(
      new GetObjectCommand({ Bucket: "bucket-b", Key: "bar.txt" }),
    );

    assertIdentical(await output.Body?.transformToString(), "Direct sim state");
  });

  it("resolves the Account scope per send from ambient run-as context", async () => {
    const simAws = new SimAws();
    using simSdk = new SimSdk({ simAws });

    const otherAccountS3 = simAws
      .account("222222222222")
      .region("us-east-1")
      .s3();
    await otherAccountS3.createBucket(
      new CreateBucketCommand({ Bucket: "bucket-c" }),
    );

    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    // The same intercepted client instance resolves a different Account scope
    // depending on the ambient caller at the time of each send, so scope must
    // never be memoized per client.
    const defaultScopeOutput = await client.send(new ListBucketsCommand({}));
    assertIdentical(defaultScopeOutput.Buckets?.length ?? 0, 0);

    await simAws.runAs(
      { kind: "arn", arn: "arn:aws:iam::222222222222:role/test-role" },
      async () => {
        const runAsOutput = await client.send(new ListBucketsCommand({}));
        assertIdentical(runAsOutput.Buckets?.[0]?.Name, "bucket-c");
      },
    );
  });

  it("restores the real client send when the sim SDK is disposed", () => {
    const client = new S3Client({ region: "us-east-1" });
    assertFalse(Object.hasOwn(client, "send"));

    {
      using simSdk = new SimSdk();
      const interception = simSdk.intercept(client);
      assertTrue(interception.isActive());
      assertTrue(Object.hasOwn(client, "send"));
    }

    assertFalse(Object.hasOwn(client, "send"));
  });

  it("restores a single interception without restoring the rest", () => {
    using simSdk = new SimSdk();
    const clientA = new S3Client({ region: "us-east-1" });
    const clientB = new S3Client({ region: "us-east-1" });

    const interceptionA = simSdk.intercept(clientA);
    const interceptionB = simSdk.intercept(clientB);

    interceptionA.restore();

    assertFalse(interceptionA.isActive());
    assertTrue(interceptionB.isActive());
  });

  it("rejects a Command the simulated service does not support", async () => {
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const error = await assertThrowsErrorAsync(async () => {
      await client.send(
        new HeadObjectCommand({ Bucket: "bucket-a", Key: "foo.txt" }),
      );
    });

    assertStringIncludes(error.message, "HeadObjectCommand");
    assertStringIncludes(error.message, "GetObjectCommand");
  });

  it("intercepts every instance of a client class", async () => {
    using simSdk = new SimSdk();
    simSdk.intercept(S3Client);

    const client = new S3Client({ region: "eu-west-2" });
    await client.send(new CreateBucketCommand({ Bucket: "bucket-class" }));

    const direct = await simSdk.simAws
      .account()
      .region("eu-west-2")
      .s3()
      .listBuckets(new ListBucketsCommand({}));

    assertIdentical(direct.Buckets?.[0]?.Name, "bucket-class");
  });

  it("ignores ambient run-as context from an unrelated SimAws", async () => {
    const unrelatedSimAws = new SimAws();
    using simSdk = new SimSdk();

    await simSdk.simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "bucket-default" }));

    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    await unrelatedSimAws.runAs(
      { kind: "arn", arn: "arn:aws:iam::333333333333:role/other-role" },
      async () => {
        const output = await client.send(new ListBucketsCommand({}));
        assertIdentical(output.Buckets?.[0]?.Name, "bucket-default");
      },
    );
  });

  it("restores an interception disposed with using", () => {
    const simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });

    {
      using interception = simSdk.intercept(client);
      assertTrue(interception.isActive());
    }

    assertFalse(Object.hasOwn(client, "send"));
  });

  it("rejects a client for a service without SDK interception support", async () => {
    using simSdk = new SimSdk();
    const client = new DynamoDBClient({ region: "us-east-1" });
    simSdk.intercept(client);

    const error = await assertThrowsErrorAsync(async () => {
      await client.send(new ListTablesCommand({}));
    });

    assertStringIncludes(error.message, "DynamoDB");
  });

  it("rejects intercepting a client that is already intercepted", () => {
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const error = assertThrowsError(() => {
      simSdk.intercept(client);
    });

    assertInstanceOf(error, SimSdkAlreadyInterceptedError);
    assertStringIncludes(error.message, "S3Client");
  });

  it("rejects intercepting a client already intercepted by another SimSdk", () => {
    using firstSimSdk = new SimSdk();
    using secondSimSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    firstSimSdk.intercept(client);

    const error = assertThrowsError(() => {
      secondSimSdk.intercept(client);
    });

    assertInstanceOf(error, SimSdkAlreadyInterceptedError);
  });

  it("rejects intercepting a client class without a prototype", () => {
    using simSdk = new SimSdk();

    const error = assertThrowsError(() => {
      simSdk.intercept(() => undefined);
    });

    assertInstanceOf(error, SimSdkInvalidClientError);
  });

  it("only intercepts the Commands in an explicit allow list", async () => {
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client, { commands: [ListBucketsCommand] });

    const output = await client.send(new ListBucketsCommand({}));
    assertIdentical(output.Buckets?.length ?? 0, 0);

    const error = await assertThrowsErrorAsync(async () => {
      await client.send(
        new GetObjectCommand({ Bucket: "bucket-a", Key: "foo.txt" }),
      );
    });

    assertStringIncludes(error.message, "GetObjectCommand");
  });

  it("accepts Command allow list entries as plain names", async () => {
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client, { commands: ["ListBucketsCommand"] });

    const output = await client.send(new ListBucketsCommand({}));

    assertIdentical(output.Buckets?.length ?? 0, 0);
  });
});
