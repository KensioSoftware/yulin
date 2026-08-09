/**
 * An upload moderated by the Lambda function its Bucket notifies.
 */

import { randomUUID } from "node:crypto";

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateBucketCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";
import { makeLambdaCodeZip } from "@kensio/yulin/lambda";
import { simRekognitionSampleImages } from "@kensio/yulin/rekognition";

const simAws = new SimAws();
const moderatorArn = `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:moderator`;

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "ModeratorRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ModeratorRole",
    PolicyName: "ModeratePolicy",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        // A detection has no resource to name, so this one has to be `*`.
        {
          Effect: "Allow",
          Action: "rekognition:DetectModerationLabels",
          Resource: "*",
        },
        // Reading the image does, so this one names the Bucket.
        {
          Effect: "Allow",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::uploads/*",
        },
      ],
    }),
  }),
);

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "moderator",
    Role: role.Role.Arn,
    Handler: "index.handler",
    Code: {
      ZipFile: makeLambdaCodeZip({
        "index.js": `
const {
  RekognitionClient,
  DetectModerationLabelsCommand,
} = require("@aws-sdk/client-rekognition");

exports.handler = async (event) => {
  const record = event.Records[0].s3;
  const detected = await new RekognitionClient({}).send(
    new DetectModerationLabelsCommand({
      Image: {
        S3Object: { Bucket: record.bucket.name, Name: record.object.key },
      },
    }),
  );

  console.log(record.object.key, detected.ModerationLabels.length);

  return detected.ModerationLabels.length === 0 ? "clean" : "flagged";
};
`,
      }),
    },
  }),
);

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "moderator",
    StatementId: "AllowS3",
    Action: "lambda:InvokeFunction",
    Principal: "s3.amazonaws.com",
    SourceArn: "arn:aws:s3:::uploads",
    SourceAccount: simAws.defaultAccountId,
  }),
);

await simAws.s3().putBucketNotificationConfiguration(
  new PutBucketNotificationConfigurationCommand({
    Bucket: "uploads",
    NotificationConfiguration: {
      LambdaFunctionConfigurations: [
        {
          Id: "moderate-uploads",
          Events: ["s3:ObjectCreated:*"],
          LambdaFunctionArn: moderatorArn,
          Filter: {
            Key: { FilterRules: [{ Name: "prefix", Value: "incoming/" }] },
          },
        },
      ],
    },
  }),
);

// The sample image is already declared as failing moderation, so the key it
// goes in under is the application's business rather than the test's.
await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: `incoming/${randomUUID()}.jpg`,
    Body: simRekognitionSampleImages.flaggedByModeration(),
  }),
);

// Delivery and the detection it triggers both happen in the background.
await simAws.backgroundTasksComplete();
