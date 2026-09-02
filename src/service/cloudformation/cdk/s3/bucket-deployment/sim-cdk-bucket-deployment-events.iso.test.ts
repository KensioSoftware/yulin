import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateBucketCommand,
  type Event,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../../../lambda/function/code/lambda-zip-file-input.js";
import { jsonStringify } from "../../../../../util/type-guard/json.js";
import { TemporaryDirectory } from "../../../../../util/filesystem/temporary-directory.js";

/**
 * The part of the S3 event document these tests read.
 */
interface S3EventDocument {
  readonly Records: readonly [
    {
      readonly eventName: string;
      readonly s3: { readonly object: { readonly key: string } };
    },
  ];
}

/**
 * What a Bucket hears when a CDK BucketDeployment fills it.
 *
 * Real CDK runs a provider function that syncs the staged asset into the
 * Bucket, one PutObject per file and one DeleteObject per Object the sync
 * prunes. A Bucket notifying a function of its uploads is told about the
 * deployment's files the same way it is told about anyone else's.
 */
describe("Events from a CDK BucketDeployment [iso]", () => {
  const bucketName = "site-bucket";
  const siteAsset = "asset.aaaa1111";
  const templatePathParts = ["cdk.out", "FooStack.template.json"];

  /**
   * A cloud assembly holding one deployment, publishing the files it is given.
   */
  async function writeAssembly(files: Record<string, string>): Promise<string> {
    const temporaryDirectory = new TemporaryDirectory();

    await Promise.all(
      Object.entries(files).map(async ([relativePath, content]) => {
        await temporaryDirectory.writeFile(
          ["cdk.out", siteAsset, ...relativePath.split("/")],
          content,
        );
      }),
    );

    await temporaryDirectory.writeFile(
      templatePathParts,
      jsonStringify({
        Resources: {
          DeploySite: {
            Type: "Custom::CDKBucketDeployment",
            Properties: {
              DestinationBucketName: bucketName,
              SourceObjectKeys: ["site.zip"],
            },
          },
        },
      }),
    );

    await temporaryDirectory.writeFile(
      ["cdk.out", "FooStack.assets.json"],
      jsonStringify({
        files: {
          site: {
            source: { path: siteAsset, packaging: "zip" },
            destinations: {
              "current_account-current_region": { objectKey: "site.zip" },
            },
          },
        },
      }),
    );

    return temporaryDirectory.join(...templatePathParts);
  }

  /**
   * A Bucket that tells a function about the events it is asked to watch, and
   * the documents the function was called with.
   */
  async function watchingBucket(
    simAws: SimAws,
    events: readonly Event[],
  ): Promise<S3EventDocument[]> {
    const received: S3EventDocument[] = [];

    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "auditor",
        Role: "arn:aws:iam::888888888888:role/AuditorRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: S3EventDocument) => {
            received.push(event);

            return "audited";
          }),
        },
      }),
    );
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "auditor",
        StatementId: "AllowS3",
        Action: "lambda:InvokeFunction",
        Principal: "s3.amazonaws.com",
        SourceArn: `arn:aws:s3:::${bucketName}`,
      }),
    );
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: bucketName,
        NotificationConfiguration: {
          LambdaFunctionConfigurations: [
            {
              Id: "deployments",
              Events: [...events],
              LambdaFunctionArn: `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:auditor`,
            },
          ],
        },
      }),
    );

    return received;
  }

  /** What the function was told, as one record each. */
  function records(
    received: readonly S3EventDocument[],
  ): { eventName: string; key: string }[] {
    return received
      .flatMap((document) => document.Records)
      .map((record) => ({
        eventName: record.eventName,
        key: record.s3.object.key,
      }))
      .toSorted((one, other) => one.key.localeCompare(other.key));
  }

  it("raises one created event for each file it publishes", async () => {
    // Given a Bucket that tells a function about the Objects created in it
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: bucketName }));
    const received = await watchingBucket(simAws, ["s3:ObjectCreated:*"]);

    // When a deployment publishes two files into it
    const templatePath = await writeAssembly({
      "index.html": "<h1>Hello</h1>",
      "js/app.js": "console.log('hi');",
    });

    await simAws.cloudFormation().deployTemplateFile(templatePath);
    await simAws.backgroundTasksComplete();

    // Then the function heard about each file as the Put that real CDK's sync
    // makes of it
    const raised = records(received);

    assertArrayLength(raised, 2);
    assertIdentical(raised[0].eventName, "ObjectCreated:Put");
    assertIdentical(raised[0].key, "index.html");
    assertIdentical(raised[1].eventName, "ObjectCreated:Put");
    assertIdentical(raised[1].key, "js/app.js");
  });

  it("raises a removed event for each Object it prunes", async () => {
    // Given a Bucket holding an Object from an earlier deployment, telling a
    // function about the Objects removed from it
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: bucketName }));
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "gone.html",
        Body: "<h1>Gone</h1>",
      }),
    );
    const received = await watchingBucket(simAws, ["s3:ObjectRemoved:*"]);

    // When a deployment whose source no longer holds it publishes
    const templatePath = await writeAssembly({ "index.html": "<h1>Hi</h1>" });

    await simAws.cloudFormation().deployTemplateFile(templatePath);
    await simAws.backgroundTasksComplete();

    // Then the function heard about the pruned Object as the delete the sync
    // makes of it
    const raised = records(received);

    assertArrayLength(raised, 1);
    assertIdentical(raised[0].eventName, "ObjectRemoved:Delete");
    assertIdentical(raised[0].key, "gone.html");
  });

  it("publishes into a Bucket with no notification configuration", async () => {
    // Given a Bucket nothing is configured to hear about
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: bucketName }));

    // When a deployment publishes into it
    const templatePath = await writeAssembly({ "index.html": "<h1>Hi</h1>" });

    await simAws.cloudFormation().deployTemplateFile(templatePath);
    await simAws.backgroundTasksComplete();

    // Then the file is there, and nothing was attempted with the event
    const bucket = simAws.s3().getSimBucketByName(bucketName);

    assertNonNullable(bucket);
    assertNonNullable(await bucket.getObject("index.html"));
    assertArrayEmpty([...simAws.s3().getNotificationDeliveryFailures()]);
  });
});
