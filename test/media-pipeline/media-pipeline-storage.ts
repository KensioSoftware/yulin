/**
 * The stored state the image pipeline runs on: the Bucket uploads land in, the
 * Table their progress is recorded in, the queue screened uploads are announced
 * on, the parameter holding what to build, and the Distribution renditions are
 * delivered through.
 */

import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import { CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { CreateQueueCommand } from "@aws-sdk/client-sqs";
import { PutParameterCommand } from "@aws-sdk/client-ssm";
import { assertNonNullable } from "@kensio/smartass";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import {
  mediaBucketName,
  mediaQueueName,
  mediaTableName,
  renditionWidths,
  renditionWidthsParameterName,
} from "./media-pipeline-names.js";

/**
 * What the rest of the pipeline needs to know about the stored state, once it
 * exists: the things whose identifiers AWS decides rather than the caller.
 */
export interface MediaPipelineStorage {
  readonly queueUrl: string;
  readonly queueArn: string;
  readonly deliveryDomainName: string;
}

/**
 * Create the Bucket, Table, queue, parameter and Distribution.
 */
export async function createMediaPipelineStorage(
  simAws: SimAws,
): Promise<MediaPipelineStorage> {
  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: mediaBucketName }));

  await createUploadsTable(simAws);
  await createWidthsParameter(simAws);

  const queue = await createScreenedQueue(simAws);
  const deliveryDomainName = await createDeliveryDistribution(simAws);

  return { ...queue, deliveryDomainName };
}

/**
 * One item per upload, so a user's uploads sit together under their own
 * partition key.
 */
async function createUploadsTable(simAws: SimAws): Promise<void> {
  await simAws.dynamoDb().createTable(
    new CreateTableCommand({
      TableName: mediaTableName,
      KeySchema: [
        { AttributeName: "userId", KeyType: "HASH" },
        { AttributeName: "uploadId", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "userId", AttributeType: "S" },
        { AttributeName: "uploadId", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );

  // Table creation finishes in the background, and the pipeline writes to it.
  await simAws.backgroundTasksComplete();
}

/**
 * The widths are configuration rather than code, so the function reads them
 * at runtime and a test can change what the pipeline produces without
 * redeploying anything.
 */
async function createWidthsParameter(simAws: SimAws): Promise<void> {
  await simAws.ssm().putParameter(
    new PutParameterCommand({
      Name: renditionWidthsParameterName,
      Type: "StringList",
      Value: renditionWidths.join(","),
    }),
  );
}

async function createScreenedQueue(
  simAws: SimAws,
): Promise<{ queueUrl: string; queueArn: string }> {
  const created = await simAws
    .sqs()
    .createQueue(new CreateQueueCommand({ QueueName: mediaQueueName }));
  const queueArn = simAws.sqs().findQueue(mediaQueueName)?.arn.value;

  assertNonNullable(created.QueueUrl, "CreateQueue answered with a queue URL");
  assertNonNullable(queueArn, "The queue has an ARN");

  return { queueUrl: created.QueueUrl, queueArn };
}

/**
 * Renditions are read through a Distribution in front of the Bucket, which is
 * the domain the API hands out.
 */
async function createDeliveryDistribution(simAws: SimAws): Promise<string> {
  const created = await simAws.cloudFront().createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "image-delivery",
        Comment: "Image delivery",
        Enabled: true,
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: "images-origin",
              DomainName: `${mediaBucketName}.s3.amazonaws.com`,
              S3OriginConfig: { OriginAccessIdentity: "" },
            },
          ],
        },
        DefaultCacheBehavior: {
          TargetOriginId: "images-origin",
          ViewerProtocolPolicy: "allow-all",
        },
      },
    }),
  );

  const domainName = created.Distribution?.DomainName;
  assertNonNullable(domainName, "The Distribution has a domain name");

  return domainName;
}
