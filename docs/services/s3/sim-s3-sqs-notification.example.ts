/**
 * An Object event reaching a Lambda function through an SQS queue.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateBucketCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  CreateQueueCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import { SimAws } from "@kensio/yulin";
import {
  makeLambdaZipFileInput,
  type SimLambdaSqsEvent,
} from "@kensio/yulin/lambda";

interface S3EventDocument {
  Records: [{ eventName: string; s3: { object: { key: string } } }];
}

const simAws = new SimAws();
const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:uploads`;

const { QueueUrl } = await simAws
  .sqs()
  .createQueue(new CreateQueueCommand({ QueueName: "uploads" }));

// The queue policy is the whole of what admits S3, which owns no identity
// policies anywhere.
await simAws.sqs().setQueueAttributes(
  new SetQueueAttributesCommand({
    QueueUrl,
    Attributes: {
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { Service: "s3.amazonaws.com" },
          Action: "sqs:SendMessage",
          Resource: queueArn,
          Condition: { ArnLike: { "aws:SourceArn": "arn:aws:s3:::uploads" } },
        },
      }),
    },
  }),
);

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "UploadConsumerRole",
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
    RoleName: "UploadConsumerRole",
    PolicyName: "ConsumeUploads",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
        ],
        Resource: queueArn,
      },
    }),
  }),
);

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "upload-consumer",
    Role: role.Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimLambdaSqsEvent) => {
        for (const record of event.Records) {
          // The S3 event document is the SQS message body, so it is parsed
          // out of the record rather than being the event itself.
          const document = JSON.parse(record.body) as S3EventDocument;

          console.log(document.Records[0].s3.object.key); // "raw/cat.jpg"
        }
      }),
    },
  }),
);

await simAws.lambda().createEventSourceMapping(
  new CreateEventSourceMappingCommand({
    EventSourceArn: queueArn,
    FunctionName: "upload-consumer",
  }),
);

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

await simAws.s3().putBucketNotificationConfiguration(
  new PutBucketNotificationConfigurationCommand({
    Bucket: "uploads",
    NotificationConfiguration: {
      QueueConfigurations: [
        {
          Id: "raw-uploads",
          Events: ["s3:ObjectCreated:*"],
          QueueArn: queueArn,
        },
      ],
    },
  }),
);

await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: "raw/cat.jpg",
    Body: "cat picture",
  }),
);

// One wait covers the delivery to the queue and the poll that follows it.
await simAws.backgroundTasksComplete();
