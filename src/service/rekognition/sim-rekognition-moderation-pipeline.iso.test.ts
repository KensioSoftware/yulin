import { text } from "node:stream/consumers";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateBucketCommand,
  GetObjectCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  bluePngBytes,
  redPngBytes,
} from "../../../test/rekognition/image-fixture.js";
import { SimAws } from "../aws/sim-aws.js";
import { makeLambdaCodeZip } from "../lambda/function/code/make-lambda-code-zip.js";

/**
 * A moderation handler as an application would write one: it reads the object
 * the event names, moderates it, and writes the labels somewhere else in the
 * Bucket when there are any.
 *
 * It is real function code rather than a stowaway handler because the SDK
 * calls it makes are the point: they run as the function's execution Role,
 * which is what makes the Role's policy part of what the test exercises.
 */
const moderatorSource =
  'const { RekognitionClient, DetectModerationLabelsCommand } = require("@aws-sdk/client-rekognition");\n' +
  'const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");\n' +
  "exports.handler = async (event) => {\n" +
  "  const record = event.Records[0].s3;\n" +
  "  const detected = await new RekognitionClient({}).send(\n" +
  "    new DetectModerationLabelsCommand({\n" +
  "      Image: { S3Object: { Bucket: record.bucket.name, Name: record.object.key } },\n" +
  "    }),\n" +
  "  );\n" +
  "  if (detected.ModerationLabels.length === 0) {\n" +
  '    return "clean";\n' +
  "  }\n" +
  "  await new S3Client({}).send(new PutObjectCommand({\n" +
  "    Bucket: record.bucket.name,\n" +
  '    Key: "flagged/" + record.object.key,\n' +
  '    Body: detected.ModerationLabels.map((label) => label.Name).join(","),\n' +
  "  }));\n" +
  '  return "flagged";\n' +
  "};\n";

async function simAwsWithModerationPipeline(): Promise<SimAws> {
  const simAws = new SimAws();

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
      // The policy the docs show: a detection has no resource to name, so it
      // has to be `*`, while reading and writing the image does.
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: "rekognition:DetectModerationLabels",
            Resource: "*",
          },
          {
            Effect: "Allow",
            Action: ["s3:GetObject", "s3:PutObject"],
            Resource: "arn:aws:s3:::uploads/*",
          },
        ],
      }),
    }),
  );

  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "moderator",
      Role: role.Role.Arn,
      Handler: "index.handler",
      Code: { ZipFile: makeLambdaCodeZip({ "index.js": moderatorSource }) },
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

  // The handler writes back into the Bucket that triggers it, so the
  // configuration is filtered to the prefix uploads arrive under. Without the
  // filter the function would notify itself for ever.
  await simAws.s3().putBucketNotificationConfiguration(
    new PutBucketNotificationConfigurationCommand({
      Bucket: "uploads",
      NotificationConfiguration: {
        LambdaFunctionConfigurations: [
          {
            Id: "moderate-uploads",
            Events: ["s3:ObjectCreated:*"],
            LambdaFunctionArn: `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:moderator`,
            Filter: {
              Key: { FilterRules: [{ Name: "prefix", Value: "raw/" }] },
            },
          },
        ],
      },
    }),
  );

  await simAws.backgroundTasksComplete();

  return simAws;
}

describe("Moderating an uploaded image through a simulated pipeline", () => {
  it("flags an upload the moderation rules declare as explicit", async () => {
    // Given a Bucket that moderates its uploads with a Lambda function, and an
    // image declared to fail moderation.
    const simAws = await simAwsWithModerationPipeline();
    simAws
      .rekognition()
      .moderation()
      .onName("raw/nsfw.png", { labels: ["Explicit Nudity"] });

    // When the image is uploaded.
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "raw/nsfw.png",
        Body: redPngBytes,
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the handler's own Rekognition call found the declared labels and
    // wrote them where the application puts them.
    const flagged = await simAws.s3().getObject(
      new GetObjectCommand({
        Bucket: "uploads",
        Key: "flagged/raw/nsfw.png",
      }),
    );
    assertNonNullable(flagged.Body);
    assertStringIncludes(await text(flagged.Body), "Explicit,Explicit Nudity");
  });

  it("leaves a clean upload alone", async () => {
    // Given the same pipeline and an image nothing was declared for.
    const simAws = await simAwsWithModerationPipeline();

    // When the image is uploaded.
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "raw/holiday.png",
        Body: bluePngBytes,
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then nothing was flagged, because an image is clean until a rule says
    // otherwise.
    await assertThrowsErrorAsync(
      async () =>
        await simAws.s3().getObject(
          new GetObjectCommand({
            Bucket: "uploads",
            Key: "flagged/raw/holiday.png",
          }),
        ),
    );
  });
});
