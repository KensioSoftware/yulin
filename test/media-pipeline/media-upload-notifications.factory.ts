import { AddPermissionCommand } from "@aws-sdk/client-lambda";
import { PutBucketNotificationConfigurationCommand } from "@aws-sdk/client-s3";
import { AsyncMappedFactory } from "@kensio/part-factory";
import { assertNonNullable } from "@kensio/smartass";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimS3Bucket } from "../../src/service/s3/bucket/sim-s3-bucket.js";

/**
 * What the pipeline asks for when it wants its Bucket to set the rest of it
 * off.
 *
 * The two prefixes are the joins between the pipeline's steps: an Object under
 * the first sets off screening, and an Object under the second is announced to
 * the queue the rendition builder polls.
 */
export interface MediaUploadNotificationsInput {
  readonly bucketName: string;
  readonly incomingPrefix: string;
  readonly screenedPrefix: string;
  readonly screeningFunctionName: string;
  readonly screeningFunctionArn: string;
  readonly screenedQueueArn: string;
}

/**
 * Puts the notifications on an existing Bucket, along with the permission the
 * notified function needs before it can be notified.
 *
 * ```typescript
 * const bucket = await mediaUploadNotificationsFactory.make(
 *   { screeningFunctionArn, screenedQueueArn },
 *   simAws,
 * );
 * ```
 *
 * The invoke permission belongs here rather than with the function because it
 * exists for the notification: S3 owns no identity policy, so a function it
 * notifies has to admit it by name.
 *
 * The Bucket is created before this rather than by it, because the Distribution
 * in front of it has to be able to find it, and that happens before there are
 * any functions to notify.
 */
export const mediaUploadNotificationsFactory = new AsyncMappedFactory<
  MediaUploadNotificationsInput,
  SimS3Bucket,
  SimAws
>(
  () => ({
    bucketName: "image-uploads",
    incomingPrefix: "incoming/",
    screenedPrefix: "screened/",
    screeningFunctionName: "screen-upload",
    screeningFunctionArn: "",
    screenedQueueArn: "",
  }),
  async (input, simAws) => {
    const simS3 = simAws.s3();

    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: input.screeningFunctionName,
        StatementId: "AllowBucketNotification",
        Action: "lambda:InvokeFunction",
        Principal: "s3.amazonaws.com",
        SourceArn: `arn:aws:s3:::${input.bucketName}`,
        SourceAccount: simAws.defaultAccountId,
      }),
    );

    await simS3.putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: input.bucketName,
        NotificationConfiguration: {
          LambdaFunctionConfigurations: [
            {
              Id: "screen-incoming-uploads",
              Events: ["s3:ObjectCreated:*"],
              LambdaFunctionArn: input.screeningFunctionArn,
              Filter: {
                Key: {
                  FilterRules: [
                    { Name: "prefix", Value: input.incomingPrefix },
                  ],
                },
              },
            },
          ],
          QueueConfigurations: [
            {
              Id: "announce-screened-uploads",
              Events: ["s3:ObjectCreated:*"],
              QueueArn: input.screenedQueueArn,
              Filter: {
                Key: {
                  FilterRules: [
                    { Name: "prefix", Value: input.screenedPrefix },
                  ],
                },
              },
            },
          ],
        },
      }),
    );

    const bucket = simS3.getSimBucketByName(input.bucketName);
    assertNonNullable(bucket, `Simulated S3 holds ${input.bucketName}`);

    return bucket;
  },
);
