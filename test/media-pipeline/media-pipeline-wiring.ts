/**
 * What connects the pipeline's steps to each other: the Bucket notifications,
 * the queue policy admitting S3, and the event source mapping that delivers
 * screened uploads to the function building renditions.
 */

import {
  AddPermissionCommand,
  CreateEventSourceMappingCommand,
} from "@aws-sdk/client-lambda";
import { PutBucketNotificationConfigurationCommand } from "@aws-sdk/client-s3";
import { SetQueueAttributesCommand } from "@aws-sdk/client-sqs";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import { buildRenditionsFunctionName } from "./media-pipeline-functions.js";
import {
  incomingPrefix,
  mediaBucketName,
  screenedPrefix,
} from "./media-pipeline-names.js";

interface MediaPipelineWiringProperties {
  readonly simAws: SimAws;
  readonly screenUploadArn: string;
  readonly screenUploadFunctionName: string;
  readonly queueArn: string;
  readonly queueUrl: string;
}

/**
 * Wire the Bucket to the screening function, the Bucket to the queue, and the
 * queue to the rendition function.
 */
export async function wireMediaPipeline(
  properties: MediaPipelineWiringProperties,
): Promise<void> {
  const { simAws, queueArn, queueUrl } = properties;

  await allowS3ToInvoke(simAws, properties.screenUploadFunctionName);
  await allowS3ToSendMessages(simAws, queueUrl, queueArn);

  await simAws.s3().putBucketNotificationConfiguration(
    new PutBucketNotificationConfigurationCommand({
      Bucket: mediaBucketName,
      NotificationConfiguration: {
        LambdaFunctionConfigurations: [
          {
            Id: "screen-incoming-uploads",
            Events: ["s3:ObjectCreated:*"],
            LambdaFunctionArn: properties.screenUploadArn,
            Filter: {
              Key: { FilterRules: [{ Name: "prefix", Value: incomingPrefix }] },
            },
          },
        ],
        QueueConfigurations: [
          {
            Id: "announce-screened-uploads",
            Events: ["s3:ObjectCreated:*"],
            QueueArn: queueArn,
            Filter: {
              Key: {
                FilterRules: [{ Name: "prefix", Value: screenedPrefix }],
              },
            },
          },
        ],
      },
    }),
  );

  await simAws.lambda().createEventSourceMapping(
    new CreateEventSourceMappingCommand({
      EventSourceArn: queueArn,
      FunctionName: buildRenditionsFunctionName,
    }),
  );
}

/**
 * S3 owns no identity policy, so what admits it is a policy on the thing it is
 * notifying.
 */
async function allowS3ToInvoke(
  simAws: SimAws,
  functionName: string,
): Promise<void> {
  await simAws.lambda().addPermission(
    new AddPermissionCommand({
      FunctionName: functionName,
      StatementId: "AllowBucketNotification",
      Action: "lambda:InvokeFunction",
      Principal: "s3.amazonaws.com",
      SourceArn: `arn:aws:s3:::${mediaBucketName}`,
      SourceAccount: simAws.defaultAccountId,
    }),
  );
}

async function allowS3ToSendMessages(
  simAws: SimAws,
  queueUrl: string,
  queueArn: string,
): Promise<void> {
  await simAws.sqs().setQueueAttributes(
    new SetQueueAttributesCommand({
      QueueUrl: queueUrl,
      Attributes: {
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { Service: "s3.amazonaws.com" },
            Action: "sqs:SendMessage",
            Resource: queueArn,
            Condition: {
              ArnLike: { "aws:SourceArn": `arn:aws:s3:::${mediaBucketName}` },
            },
          },
        }),
      },
    }),
  );
}
