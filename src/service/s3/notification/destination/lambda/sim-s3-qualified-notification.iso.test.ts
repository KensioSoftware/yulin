import {
  CreateBucketCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simLambdaAliasedFunction,
  simLambdaAllowAliasInvoke,
} from "../../../../../../test/lambda/alias-fixture.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import { simS3ServicePrincipal } from "../sim-s3-service-principal.js";

const bucketArn = "arn:aws:s3:::uploads";

/**
 * A simulation with a Bucket to notify from.
 */
async function simAwsWithBucket(): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

  return simAws;
}

/**
 * Configure the Bucket to notify a destination on object creation.
 */
async function notifyOnUpload(
  simAws: SimAws,
  destinationArn: string,
): Promise<void> {
  await simAws.s3().putBucketNotificationConfiguration(
    new PutBucketNotificationConfigurationCommand({
      Bucket: "uploads",
      NotificationConfiguration: {
        LambdaFunctionConfigurations: [
          {
            Id: "thumbnails",
            Events: ["s3:ObjectCreated:*"],
            LambdaFunctionArn: destinationArn,
          },
        ],
      },
    }),
  );
}

describe("A simulated S3 notification to a Lambda alias", () => {
  it("invokes the version the alias points at", async () => {
    // Given a Bucket and a function with an alias admitting S3.
    const simAws = await simAwsWithBucket();
    const thumbnailer = await simLambdaAliasedFunction(simAws, "thumbnailer");
    await simLambdaAllowAliasInvoke(
      simAws,
      "thumbnailer",
      simS3ServicePrincipal,
      bucketArn,
    );

    // When the Bucket notifies the alias and an object is uploaded.
    await notifyOnUpload(simAws, thumbnailer.aliasArn);
    await simAws
      .s3()
      .putObject(
        new PutObjectCommand({ Bucket: "uploads", Key: "one.png", Body: "x" }),
      );
    await simAws.backgroundTasksComplete();

    // Then the version behind the alias ran, rather than `$LATEST`.
    assertArrayEquals(thumbnailer.ranAs, [thumbnailer.version]);
  });

  it("refuses a qualifier naming no version or alias", async () => {
    // Given a Bucket and a function with an alias.
    const simAws = await simAwsWithBucket();
    const thumbnailer = await simLambdaAliasedFunction(simAws, "thumbnailer");

    // When the configuration names an alias the function does not have.
    const error = await assertThrowsErrorAsync(async () => {
      await notifyOnUpload(simAws, `${thumbnailer.functionArn}:old`);
    });

    // Then it is refused where the notification is configured.
    assertStringIncludes(
      error.message,
      "names no simulated Lambda function version or alias",
    );
  });

  it("does not deliver to an alias its grant does not cover", async () => {
    // Given a Bucket and a function granting S3 the invoke action on the
    // function itself rather than on the alias.
    const simAws = await simAwsWithBucket();
    const thumbnailer = await simLambdaAliasedFunction(simAws, "thumbnailer");
    await simAws.lambda().addPermission({
      input: {
        FunctionName: "thumbnailer",
        StatementId: "AllowS3",
        Action: "lambda:InvokeFunction",
        Principal: simS3ServicePrincipal,
        SourceArn: bucketArn,
      },
    });

    // When the configuration names the alias.
    const error = await assertThrowsErrorAsync(async () => {
      await notifyOnUpload(simAws, thumbnailer.aliasArn);
    });

    // Then the grant on the function says nothing about the alias, the same
    // way it does for an Invoke through one.
    assertStringIncludes(error.message, "does not allow s3.amazonaws.com");
  });
});
