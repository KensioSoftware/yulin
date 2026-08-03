import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { buffer } from "node:stream/consumers";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the template
 * for `bucket.addEventNotification(...)`, which CDK writes as a
 * Custom::S3BucketNotifications Resource rather than as a Bucket property.
 */
import { SimAws } from "../../../../aws/sim-aws.js";
import { TestCdkProject } from "../../../../../util/filesystem/test-cdk-project.js";

/**
 * The Account and Region the CDK app synthesizes for.
 *
 * The simulated scope has to match, because the `SourceAccount` on the
 * `AWS::Lambda::Permission` CDK writes beside the notification is a synth-time
 * literal. A Stack deployed into another Account leaves S3 unable to validate
 * the destination.
 */
const cdkAccountId = "111111111111";
const cdkRegionName = "eu-west-2";

/**
 * The part of the S3 event document these tests read.
 */
interface S3EventDocument {
  readonly Records: readonly [
    { readonly s3: { readonly object: { readonly key: string } } },
  ];
}

/**
 * A handler that writes a marker Object into the second Bucket of the Stack,
 * as the deployed function code rather than as a binding.
 */
const thumbnailHandlerSource = `
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const s3Client = new S3Client({});
exports.handler = async (event) => {
  const record = event.Records[0];
  await s3Client.send(
    new PutObjectCommand({
      Bucket: "cdk-notification-thumbs",
      Key: record.s3.object.key + ".thumb",
      Body: record.eventName,
    }),
  );
};
`;

describe("Sim CDK Bucket notification local integration", () => {
  it("delivers a created Object to the function the CDK app notified", async () => {
    // Given a CDK stack whose Bucket notifies a function on Object creation,
    // where the function writes a marker Object into a second Bucket.
    const cdkProject = new TestCdkProject();
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "${cdkAccountId}", region: "${cdkRegionName}" },
});

const uploadsBucket = new s3.Bucket(stack, "UploadsBucket", {
  bucketName: "cdk-notification-uploads",
});
const thumbsBucket = new s3.Bucket(stack, "ThumbsBucket", {
  bucketName: "cdk-notification-thumbs",
});

const thumbnailer = new lambda.Function(stack, "Thumbnailer", {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline(${JSON.stringify(thumbnailHandlerSource)}),
});

thumbsBucket.grantPut(thumbnailer);

uploadsBucket.addEventNotification(
  s3.EventType.OBJECT_CREATED,
  new s3n.LambdaDestination(thumbnailer),
);

app.synth();
      `,
    );
    const cdkOutDirectory = await cdkProject.synth();

    // When the synthesized template is deployed into a matching scope.
    const simAws = new SimAws();
    const scope = simAws.account(cdkAccountId).region(cdkRegionName);
    const stack = await scope
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    assertIdentical(stack.lifecycle.status, "CREATE_COMPLETE");

    // Then putting an Object into the deployed Bucket runs the deployed
    // function.
    await scope.s3().putObject(
      new PutObjectCommand({
        Bucket: "cdk-notification-uploads",
        Key: "cat.jpg",
        Body: "cat picture",
      }),
    );
    await simAws.backgroundTasksComplete();

    const marker = await scope.s3().getObject(
      new GetObjectCommand({
        Bucket: "cdk-notification-thumbs",
        Key: "cat.jpg.thumb",
      }),
    );
    assertNonNullable(marker.Body);
    const markerBytes = await buffer(marker.Body);
    assertIdentical(markerBytes.toString(), "ObjectCreated:Put");
  });

  it("delivers only the keys the CDK filter matches", async () => {
    // Given a CDK stack whose notification filters on a prefix, with the
    // function bound to a handler this test can watch.
    const cdkProject = new TestCdkProject();
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "${cdkAccountId}", region: "${cdkRegionName}" },
});

const uploadsBucket = new s3.Bucket(stack, "UploadsBucket", {
  bucketName: "cdk-filtered-uploads",
});

const thumbnailer = new lambda.Function(stack, "Thumbnailer", {
  functionName: "cdk-filtered-thumbnailer",
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline("exports.handler = async () => 'replaced';"),
});

uploadsBucket.addEventNotification(
  s3.EventType.OBJECT_CREATED,
  new s3n.LambdaDestination(thumbnailer),
  { prefix: "raw/" },
);

app.synth();
      `,
    );
    const cdkOutDirectory = await cdkProject.synth();

    // When the synthesized template is deployed into a matching scope.
    const simAws = new SimAws();
    const scope = simAws.account(cdkAccountId).region(cdkRegionName);
    const received: S3EventDocument[] = [];
    await scope.cloudFormation().deployTemplateFile({
      templatePath: path.join(cdkOutDirectory, "TestStack.template.json"),
      bindings: [
        {
          functionName: "cdk-filtered-thumbnailer",
          handler: (event: S3EventDocument): string => {
            received.push(event);

            return "thumbnailed";
          },
        },
      ],
    });
    await simAws.backgroundTasksComplete();

    // And Objects are put on both sides of the filter.
    await scope.s3().putObject(
      new PutObjectCommand({
        Bucket: "cdk-filtered-uploads",
        Key: "raw/cat.jpg",
        Body: "cat picture",
      }),
    );
    await scope.s3().putObject(
      new PutObjectCommand({
        Bucket: "cdk-filtered-uploads",
        Key: "thumbs/cat.jpg",
        Body: "thumbnail",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then only the matching key reaches the function.
    assertArrayLength(received, 1);
    assertIdentical(received[0].Records[0].s3.object.key, "raw/cat.jpg");
  });
});
