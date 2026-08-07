# Simulated S3

Yulin includes a simulated S3 service for tests and local development.

Sim S3 can be used directly through `SimAws` or instantiated on its own as `SimS3` with isolated
state. Yulin can serve a simulated S3 service on localhost.

## Basic usage

Create a simulated AWS environment, get simulated S3, create a Bucket, and put an Object into it.

```typescript sim-s3-bucket
/**
 * Creating a simulated S3 Bucket and putting an Object into it.
 */

import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "foo-bucket",
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "foo-bucket",
    Key: "hello.txt",
    Body: "Hello from simulated S3",
    ContentType: "text/plain; charset=utf-8",
    Metadata: {
      source: "yulin",
    },
  }),
);

const objectOut = await simS3.getObject(
  new GetObjectCommand({
    Bucket: "foo-bucket",
    Key: "hello.txt",
  }),
);

console.log(objectOut.Body);
console.log(objectOut.Metadata?.["source"]);
```

`PutObjectCommand` currently accepts `string`, `Uint8Array`, or `undefined` for `Body`. An undefined
body is stored as an empty Object.

`ContentType` is exposed as Object metadata under the `content-type` header name and is used when
serving Bucket website responses. It is one of several headers a write can say about an Object. See
[Object system metadata](#object-system-metadata).

## Accounts and Regions

Use `SimAws` scopes to simulate S3 in different AWS Accounts and Regions.

```typescript sim-s3-account-region-scoping
/**
 * Simulated S3 Account and Region scoping.
 */

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const defaultS3 = simAws.s3();
const euWest2S3 = simAws.region("eu-west-2").s3();
const accountS3 = simAws.account("111111111111").s3();
const scopedS3 = simAws.account("222222222222").region("ap-east-1").s3();

await defaultS3.createBucket(
  new CreateBucketCommand({
    Bucket: "default-bucket",
  }),
);

await euWest2S3.createBucket(
  new CreateBucketCommand({
    Bucket: "eu-west-2-bucket",
  }),
);

await accountS3.createBucket(
  new CreateBucketCommand({
    Bucket: "account-bucket",
  }),
);

await scopedS3.createBucket(
  new CreateBucketCommand({
    Bucket: "scoped-bucket",
  }),
);
```

Within one `SimAws` instance, Bucket names are globally registered across Accounts and Regions.
Creating a Bucket with a name already used in another simulated Region or Account throws an error.

Each `SimAws` instance has its own isolated state, so you can create a fresh `SimAws` instance per
test or share one across all tests as you prefer.

## Listing Buckets

Use `ListBucketsCommand` to inspect Buckets in the selected simulated S3 scope.

```typescript sim-s3-list-buckets
/**
 * Listing Buckets in simulated S3.
 */

import { CreateBucketCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "foo-bucket",
  }),
);

const listBucketsOutput = await simS3.listBuckets(new ListBucketsCommand());

console.log(listBucketsOutput.Buckets?.map((bucket) => bucket.Name));
```

## Listing Objects

Use `ListObjectsCommand` to list Object keys in a Bucket. The simulator supports `Prefix`, `MaxKeys`,
and `Marker`.

```typescript sim-s3-list-objects
/**
 * Listing Objects in a simulated S3 Bucket.
 */

import {
  CreateBucketCommand,
  ListObjectsCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "assets-bucket",
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "assets-bucket",
    Key: "images/logo.svg",
    Body: "<svg></svg>",
    ContentType: "image/svg+xml",
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "assets-bucket",
    Key: "docs/index.html",
    Body: "<h1>Docs</h1>",
    ContentType: "text/html; charset=utf-8",
  }),
);

const listObjectsOutput = await simS3.listObjects(
  new ListObjectsCommand({
    Bucket: "assets-bucket",
    Prefix: "docs/",
    MaxKeys: 10,
  }),
);

const objectContentItems = listObjectsOutput.Contents ?? [];
for (const object of objectContentItems) {
  console.log(object.Key, object.Size);
}
```

Object listings are sorted by key.

## Deleting Objects

Use `DeleteObjectCommand` to remove one Object, and `DeleteObjectsCommand` to remove several in one
request. Both are authorized against `s3:DeleteObject` on the Object ARN, so a caller allowed to read
a Bucket cannot empty it.

```typescript sim-s3-delete-object
/**
 * Deleting Objects from a simulated S3 Bucket.
 */

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "uploads-bucket",
  }),
);

for (const key of ["receipt.pdf", "invoice.pdf", "notes.txt"]) {
  await simS3.putObject(
    new PutObjectCommand({
      Bucket: "uploads-bucket",
      Key: key,
      Body: "file contents",
    }),
  );
}

await simS3.deleteObject(
  new DeleteObjectCommand({
    Bucket: "uploads-bucket",
    Key: "receipt.pdf",
  }),
);

const batchOutput = await simS3.deleteObjects(
  new DeleteObjectsCommand({
    Bucket: "uploads-bucket",
    Delete: {
      Objects: [{ Key: "invoice.pdf" }, { Key: "notes.txt" }],
    },
  }),
);

const removedObjects = batchOutput.Deleted ?? [];
for (const removed of removedObjects) {
  console.log(removed.Key);
}

const refusedObjects = batchOutput.Errors ?? [];
for (const refused of refusedObjects) {
  console.log(refused.Key, refused.Code);
}
```

Deletion is idempotent, as it is in real S3. Deleting a key that is not in the Bucket succeeds, and
`DeleteObjects` reports it among the keys it deleted. Deleting from a Bucket that does not exist
raises `NoSuchBucket`.

`DeleteObjects` authorizes each key on its own and carries on through the batch. A key the caller may
not delete appears in `Errors` with the code `AccessDenied`, while the rest are still removed and
reported in `Deleted`. Setting `Quiet: true` leaves `Deleted` out of the response, so only the
failures come back.

### Limitations

- Object versioning is not simulated, so deletion removes the Object rather than writing a delete
  marker, and neither `VersionId` nor `MFA` is read from the request.
- A request naming no Objects, or more than the thousand S3 accepts, is refused with `MalformedXML`
  before anything is deleted.
- A Bucket using filesystem-backed storage refuses deletion. See
  [Filesystem-backed Bucket storage](#filesystem-backed-bucket-storage).

## Event notifications

A simulated S3 Bucket can notify a simulated Lambda function, a simulated SQS queue or a simulated
SNS topic when an Object is created or removed. The configuration is applied with
`PutBucketNotificationConfigurationCommand` and read back with
`GetBucketNotificationConfigurationCommand`.

The destination's own policy decides whether S3 may reach it: the function's resource policy, the
queue's `Policy` attribute, or the topic's. That is checked when the configuration is applied, and
again for every event, as real S3 does.

```typescript sim-s3-event-notifications
/**
 * Notifying a simulated Lambda function when an Object is created.
 */

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
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

interface S3EventDocument {
  Records: [{ eventName: string; s3: { object: { key: string } } }];
}

const simAws = new SimAws();
const thumbnailerArn = `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:thumbnailer`;

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "thumbnailer",
    Role: `arn:aws:iam::${simAws.defaultAccountId}:role/ThumbnailerRole`,
    Code: {
      ZipFile: makeLambdaZipFileInput((event: S3EventDocument) => {
        console.log(event.Records[0].eventName, event.Records[0].s3.object.key);

        return "thumbnailed";
      }),
    },
  }),
);

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "thumbnailer",
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
          Id: "thumbnail-raw-uploads",
          Events: ["s3:ObjectCreated:*"],
          LambdaFunctionArn: thumbnailerArn,
          Filter: { Key: { FilterRules: [{ Name: "prefix", Value: "raw/" }] } },
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

// Delivery happens in the background, so wait for the simulation to settle.
await simAws.backgroundTasksComplete();
```

The event types a configuration can name are `s3:ObjectCreated:*`, `s3:ObjectCreated:Put`,
`s3:ObjectRemoved:*` and `s3:ObjectRemoved:Delete`. Any other S3 event type is refused by name rather
than stored and never raised.

A configuration can filter on an object key prefix, a suffix, or both. Two configurations that share
an event type and whose filters could both match the same key are refused with `InvalidArgument`, as
real S3 refuses them. Overlapping prefixes are fine when the suffixes do not overlap, so one function
can take the `.jpg` files under a prefix while another takes the `.png` files under the same one.
The rule applies across the destination groups, so a function and a queue that both want the same
event are refused as readily as two functions.

`PutBucketNotificationConfigurationCommand` replaces the whole configuration rather than adding to
it. `GetBucketNotificationConfigurationCommand` answers an empty configuration for a Bucket that has
none. Note that the response carries the destination groups at the top level, while the request nests
them under `NotificationConfiguration`:

```typescript
const read = await simAws
  .s3()
  .getBucketNotificationConfiguration(
    new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
  );
const configurations = read.LambdaFunctionConfigurations ?? [];
```

The two commands are authorized as `s3:PutBucketNotification` and `s3:GetBucketNotification`. Those
are the real IAM action names, and they do not match the API names.

### To an SQS queue

A `QueueConfigurations` entry names a queue by ARN. The whole `Records` document arrives as one
message body, so a consumer parses `record.body` to get at the event. Put a Lambda event source
mapping on the queue and the chain runs end to end after one `backgroundTasksComplete()`.

The queue's `Policy` attribute has to allow `sqs:SendMessage` for the `s3.amazonaws.com` service
principal. S3 supplies `aws:SourceArn` and `aws:SourceAccount`, so the `ArnLike` condition CDK's
`SqsDestination` writes and the `StringEquals aws:SourceAccount` guard AWS documents are both
satisfied.

```typescript sim-s3-sqs-notification
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
```

The queue has to be in the Bucket's Region, as real S3 requires. It can be in another Account, since
its own policy and its own Account's IAM are what admit the Bucket. A FIFO queue is refused by name.

### To an SNS topic

A `TopicConfigurations` entry names a topic by ARN. The whole `Records` document is published as the
SNS `Message`, with a `Subject` of `Amazon S3 Notification`, which is what real S3 publishes. A queue
subscribed to the topic therefore has two envelopes to reach through: parse the message body for the
SNS envelope, then parse its `Message` for the S3 event.

The topic's `Policy` attribute has to allow `sns:Publish` for the `s3.amazonaws.com` service
principal. S3 supplies `aws:SourceArn` and `aws:SourceAccount`, so the `ArnLike` condition CDK's
`SnsDestination` writes and the `StringEquals aws:SourceAccount` guard AWS documents are both
satisfied.

```typescript sim-s3-sns-notification
/**
 * An Object event reaching a queue through an SNS topic.
 */

import {
  CreateBucketCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  CreateTopicCommand,
  SetTopicAttributesCommand,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import { SimAws } from "@kensio/yulin";

interface SnsEnvelope {
  Subject: string;
  Message: string;
}

interface S3EventDocument {
  Records: [{ eventName: string; s3: { object: { key: string } } }];
}

const simAws = new SimAws();
const { defaultRegionName: region, defaultAccountId: account } = simAws;
const bucketArn = "arn:aws:s3:::uploads";
const topicArn = `arn:aws:sns:${region}:${account}:uploads`;
const queueArn = `arn:aws:sqs:${region}:${account}:uploads-queue`;

const { TopicArn } = await simAws
  .sns()
  .createTopic(new CreateTopicCommand({ Name: "uploads" }));

// The topic policy is the whole decision, because S3 owns no identity
// policies. S3 supplies aws:SourceArn, so the grant names one Bucket.
await simAws.sns().setTopicAttributes(
  new SetTopicAttributesCommand({
    TopicArn,
    AttributeName: "Policy",
    AttributeValue: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "s3.amazonaws.com" },
          Action: "sns:Publish",
          Resource: topicArn,
          Condition: { ArnLike: { "aws:SourceArn": bucketArn } },
        },
      ],
    }),
  }),
);

const { QueueUrl } = await simAws
  .sqs()
  .createQueue(new CreateQueueCommand({ QueueName: "uploads-queue" }));

await simAws.sqs().setQueueAttributes(
  new SetQueueAttributesCommand({
    QueueUrl,
    Attributes: {
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "sns.amazonaws.com" },
            Action: "sqs:SendMessage",
            Resource: queueArn,
            Condition: { ArnLike: { "aws:SourceArn": topicArn } },
          },
        ],
      }),
    },
  }),
);

await simAws
  .sns()
  .subscribe(
    new SubscribeCommand({ TopicArn, Protocol: "sqs", Endpoint: queueArn }),
  );

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

await simAws.s3().putBucketNotificationConfiguration(
  new PutBucketNotificationConfigurationCommand({
    Bucket: "uploads",
    NotificationConfiguration: {
      TopicConfigurations: [
        {
          Id: "raw-uploads",
          Events: ["s3:ObjectCreated:*"],
          TopicArn,
          Filter: { Key: { FilterRules: [{ Name: "prefix", Value: "raw/" }] } },
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

// One wait covers the publish to the topic and the delivery to the queue.
await simAws.backgroundTasksComplete();

const received = await simAws
  .sqs()
  .receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

// Two envelopes to reach through: the SNS envelope, then the S3 event.
const envelope = JSON.parse(received.Messages?.[0]?.Body ?? "") as SnsEnvelope;

console.log(envelope.Subject); // "Amazon S3 Notification"

const event = JSON.parse(envelope.Message) as S3EventDocument;

console.log(event.Records[0].s3.object.key); // "raw/cat.jpg"
```

The topic has to be in the Bucket's Region, as real S3 requires. It can be in another Account, since
its own policy and its own Account's IAM are what admit the Bucket. A FIFO topic is refused by name.

The publish goes through the ordinary `Publish` path, so the topic's own subscriptions take it from
there. That means a topic destination reaches everything the topic reaches, and a subscribed queue is
two hops from the Object that was written. One `backgroundTasksComplete()` covers both.

### From a CloudFormation template

The `NotificationConfiguration` property of `AWS::S3::Bucket` deploys through the same
`PutBucketNotificationConfiguration` path, so a template and an SDK caller get identical validation.
CloudFormation names the same configuration differently in several places: `LambdaConfigurations`
rather than `LambdaFunctionConfigurations`, a single `Event` string rather than an `Events` list,
`Function` rather than `LambdaFunctionArn`, `Queue` rather than `QueueArn`, `Topic` rather than
`TopicArn`, and `Filter.S3Key.Rules` rather than `Filter.Key.FilterRules`. `QueueConfigurations` and
`TopicConfigurations` are the names both spell the same way. Yulin reads the CloudFormation names and
refuses the others, so a template using the SDK spelling fails the stack rather than deploying an
unfiltered configuration.

```typescript sim-s3-cfn-event-notification
/**
 * Configuring Bucket event notifications from a CloudFormation template.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "uploads-stack",
  template: {
    Resources: {
      Thumbnailer: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "thumbnailer",
          Role: { "Fn::GetAtt": ["ThumbnailerRole", "Arn"] },
          Handler: "index.handler",
          Runtime: "nodejs20.x",
          Code: { ZipFile: "exports.handler = async () => 'thumbnailed';" },
        },
      },
      ThumbnailerRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "thumbnailer-role",
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "lambda.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          },
        },
      },
      ThumbnailerPermission: {
        Type: "AWS::Lambda::Permission",
        Properties: {
          Action: "lambda:InvokeFunction",
          FunctionName: { "Fn::GetAtt": ["Thumbnailer", "Arn"] },
          Principal: "s3.amazonaws.com",
          SourceAccount: { Ref: "AWS::AccountId" },
          SourceArn: "arn:aws:s3:::uploads",
        },
      },
      UploadsBucket: {
        Type: "AWS::S3::Bucket",
        DependsOn: ["ThumbnailerPermission"],
        Properties: {
          BucketName: "uploads",
          NotificationConfiguration: {
            LambdaConfigurations: [
              {
                Event: "s3:ObjectCreated:*",
                Function: { "Fn::GetAtt": ["Thumbnailer", "Arn"] },
                Filter: {
                  S3Key: { Rules: [{ Name: "prefix", Value: "raw/" }] },
                },
              },
            ],
          },
        },
      },
    },
  },
});
await stack.waitForDeployComplete();

await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: "raw/cat.jpg",
    Body: "cat picture",
  }),
);

// Delivery happens in the background, so wait for the simulation to settle.
await simAws.backgroundTasksComplete();
```

Two things in that template are there because real CloudFormation needs them, and simulated
CloudFormation needs them for the same reasons. The Bucket names itself rather than letting
CloudFormation name it, and the permission names the Bucket by ARN literal rather than by
`Fn::GetAtt`. Written the other way round, the Bucket needs the function's ARN and the permission
needs the Bucket's, which is a circular dependency. The `DependsOn` then puts the permission in place
before S3 validates the destination the notification names.

S3 generates the configuration id, because CloudFormation has no property for stating one. Read it
back with `GetBucketNotificationConfigurationCommand` if a test needs it.

### From a CDK app

`bucket.addEventNotification(...)` deploys through simulated CloudFormation. CDK does not write the
`AWS::S3::Bucket` `NotificationConfiguration` property for it. It writes a
`Custom::S3BucketNotifications` resource carrying the same request
`PutBucketNotificationConfigurationCommand` takes, alongside the `AWS::Lambda::Permission` that lets
S3 invoke the function. Yulin applies that request through the same command path an SDK caller
reaches, so a configuration is validated the same way whichever it arrives by.

`SqsDestination` and `SnsDestination` write their entry into the same resource, alongside the
`AWS::SQS::QueuePolicy` or `AWS::SNS::TopicPolicy` that grants S3 access. Both of those deploy, as
does the `AWS::SNS::Topic` beside them, so a stack whose Bucket notifies a topic needs nothing set
up by hand.

Deploy into an Account and Region matching the ones the CDK app synthesized for. The `SourceAccount`
on the permission CDK writes beside the notification is a synth-time literal, so a stack deployed
into another Account leaves S3 unable to validate the destination, and the stack fails.

```typescript sim-s3-cdk-event-notification
/**
 * Deploying a CDK Bucket event notification into simulated AWS.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// The Account and Region the CDK app synthesized for.
const scope = simAws.account("111111111111").region("eu-west-2");

await scope
  .cloudFormation()
  .deployTemplateFile("cdk.out/TestStack.template.json");

await scope.s3().putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: "raw/cat.jpg",
    Body: "cat picture",
  }),
);

// Delivery happens in the background, so wait for the simulation to settle.
await simAws.backgroundTasksComplete();
```

CDK's own provider function for this resource is written in Python, so simulated CloudFormation skips
it on its runtime and Yulin does the work the function would have done. The `ServiceToken` naming it
is read and ignored.

A resource carrying `Managed: false` is refused, and the stack fails. CDK writes it for a Bucket the
app imported rather than declared. It asks S3 to merge the configuration with the configurations
already on the Bucket instead of replacing them, and simulated S3 only replaces, so applying it as
written would drop configurations that survive on real AWS. Declare the Bucket in the same stack to
get a managed notification configuration.

### What arrives at the destination

A function is invoked with the `Records` document real S3 sends. A queue gets the same document as
one message body, and a topic gets it as the published `Message`. One event produces one record.

Creation records carry the Object's `size` and its `eTag`, which is the MD5 of the bytes as it is for
an Object real S3 stored in one part. Removal records carry neither, because the Object they describe
is gone. Both carry a `sequencer`, which orders the events for one object key. The object key is
form-URL-encoded, so `red flower.jpg` arrives as `red+flower.jpg`.

`eventTime` comes from the simulation's clock, so a frozen clock produces a fixed timestamp.

### When delivery fails

Real S3 tells the caller who wrote the Object nothing about a delivery, and neither does the
simulator: a handler that throws does not fail the `PutObject` and does not reject
`backgroundTasksComplete()`. The outcome is still readable:

```typescript
for (const failure of simAws.s3().getNotificationDeliveryFailures()) {
  console.log(failure.destinationArn, failure.reason, failure.wasRefused);
}
```

A handler that threw is also warned about on the console, once per destination and cause. A
destination that refused the event, because its resource policy no longer admits the Bucket, is
recorded without a warning.

A handler that writes back into the Bucket that triggered it notifies itself forever, and in process
there is nothing to slow it down. Filter the configuration by prefix or suffix so the handler's own
writes do not match it. Without that, the simulation stops after a thousand deliveries and
`backgroundTasksComplete()` raises an error naming the Bucket.

### Limitations

- A Lambda function, an SQS queue and an SNS topic are the destinations. EventBridge is refused by
  name.
- A destination goes where the group it was declared in says, not where its ARN says: a queue ARN
  under `LambdaFunctionConfigurations` is refused for not being a function ARN rather than delivered
  to as a queue.
- Only `s3:ObjectCreated:Put` and `s3:ObjectRemoved:Delete` are raised. `Copy`, `Post`,
  `CompleteMultipartUpload`, `DeleteMarkerCreated`, the `ObjectRestore:*`, `Replication:*`,
  `LifecycleExpiration:*` and `ObjectTagging:*` families, `LifecycleTransition`,
  `IntelligentTiering`, `ObjectAcl:Put` and `ReducedRedundancyLostObject` are refused by name.
  `s3:ObjectCreated:*` and `s3:ObjectRemoved:*` therefore expand to one member each.
- `userIdentity.principalId` carries the caller's ARN rather than the `AIDA...` unique id real S3
  puts there. Simulated IAM has no unique-id namespace to draw one from, and an ARN is what a test
  would assert on. `requestParameters.sourceIPAddress` is the loopback address, because the request
  was made in this process, and the `responseElements` request ids are generated per event and match
  nothing.
- `eventVersion` is the version the S3 event message structure page documents now. AWS increments the
  minor version whenever it adds a field, so compare the major for equality rather than asserting on
  the whole string.
- `versionId` is absent from every record, which is what real S3 does for a Bucket without
  versioning. Versioning is not simulated.
- A notification cannot be configured on a standalone `SimS3`. It has no other simulated services to
  notify, and no shared background scheduler for `backgroundTasksComplete()` to drain. Reach
  simulated S3 through `SimAws` instead.
- An `EventBridgeConfiguration` in an `AWS::S3::Bucket` `NotificationConfiguration` is refused by
  name, as it is for an SDK caller.
- `Managed: false` on a `Custom::S3BucketNotifications` resource is refused rather than approximated,
  and an EventBridge destination in one is refused by name as it is for an SDK caller.
- A FIFO queue destination is refused by name, as real S3 refuses one. Simulated SQS has no FIFO
  queues either, and neither does simulated SNS, so a FIFO topic destination is refused the same way.
- The KMS key policy statement CDK's `SqsDestination` writes for an encrypted queue is not acted on.
  Queue encryption is not simulated.
- A CDK `BucketDeployment` and `mountBucketFilesystem(...)` both replace the whole storage backend
  rather than putting Objects, so neither raises anything, whereas real CDK `BucketDeployment` fires
  one `ObjectCreated:Put` per file.
- A function ARN naming a version or an alias is refused, since simulated Lambda has neither.
- A topic destination publishes with no message attributes, since real S3 publishes none. The only
  thing on the message besides the event document is the `Amazon S3 Notification` subject.
- `s3:TestEvent` is not sent. Real S3 puts one on a queue or topic when a configuration naming it is
  applied, carrying a flat `{Service, Event, Time, Bucket, RequestId, HostId}` document with no
  `Records` in it. Sending it here would make the simplest test two messages long and hand a
  consumer a body it cannot parse as an event. What the message exists to prove, that S3 may reach
  the destination, is simulated directly by the destination check.

## Buckets from CloudFormation

An `AWS::S3::Bucket` resource carries four properties simulated S3 acts on: `BucketName`,
`NotificationConfiguration`, `PublicAccessBlockConfiguration` and `WebsiteConfiguration`. Without
`BucketName` the Bucket is named after the resource's logical id, lowercased, rather than the
generated name real CloudFormation invents.

Any other property is left out and recorded in
[`stack.ignoredProperties`](../cloudformation/README.md#properties-a-resource-was-created-without),
so the Bucket is created and the stack carries on. That matters because a Bucket deployed without the
lifecycle rules, versioning or CORS configuration its template asked for looks configured and behaves
as though it were not, and the failure that causes turns up somewhere else entirely. The record is
where a test checks which of those it is standing on. A property name `AWS::S3::Bucket` does not have
is recorded the same way, rather than a stack failing over a typo.

One of the four that is there but is not the shape it should be still fails the stack, rather than
being read as absent, and so does a `BucketName` that is not a string: there is no Bucket to create
under a name nothing else in the template refers to.

`BucketEncryption` and `Tags` are read, ignored and not recorded, because nothing this simulator
models can tell the difference: there is no simulated KMS, Object bytes are stored as they arrive,
and no simulated service reads a Bucket tag. CDK puts both on almost every Bucket it synthesizes, and
listing a difference no test could observe would only bury the ones that matter.

## Bucket policies

A Bucket policy is a resource policy stored on the Bucket. Sim IAM evaluates it alongside the
caller's identity policies whenever an Object command is authorized, so a policy can grant access to
a principal that holds no identity policy at all, including an anonymous caller.

Apply one with `PutBucketPolicyCommand`, read it back with `GetBucketPolicyCommand`, and remove it
with `DeleteBucketPolicyCommand`. Each is authorized in its own right, against `s3:PutBucketPolicy`,
`s3:GetBucketPolicy` and `s3:DeleteBucketPolicy`.

In a CloudFormation template, a Bucket policy is a separate `AWS::S3::BucketPolicy` resource rather
than a property of `AWS::S3::Bucket`. This is what CDK synthesizes for `bucket.grantRead(...)`,
`grantPut(...)` and `addToResourcePolicy(...)`, so a template reaches it whether or not the app
mentions a Bucket policy itself. Sim CloudFormation attaches it through the same `PutBucketPolicy`
path an SDK call takes, so the document is validated and enforced identically either way.

```typescript sim-s3-bucket-policy
/**
 * Granting access to a simulated S3 Bucket with a Bucket policy.
 */

import { CreateRoleCommand } from "@aws-sdk/client-iam";
import {
  GetBucketPolicyCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simIam = simAws.iam();
const simS3 = simAws.s3();

// The principal the Bucket policy will name. It gets no identity policy, so
// the Bucket policy is the whole of its access.
const roleOut = await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "ReportReader",
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

await simAws.cloudFormation().deployTemplate({
  stackName: "reports-stack",
  template: {
    Resources: {
      ReportsBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "reports" },
      },
      ReportsBucketPolicy: {
        Type: "AWS::S3::BucketPolicy",
        Properties: {
          Bucket: { Ref: "ReportsBucket" },
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { AWS: roleOut.Role.Arn },
                Action: "s3:GetObject",
                Resource: "arn:aws:s3:::reports/*",
              },
            ],
          },
        },
      },
    },
  },
});

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "reports",
    Key: "q3/report.txt",
    Body: "quarterly numbers",
  }),
);

// The deployed policy authorizes the read.
const objectOut = await simS3.getObject(
  new GetObjectCommand({ Bucket: "reports", Key: "q3/report.txt" }),
  { caller: { kind: "arn", arn: roleOut.Role.Arn } },
);

console.log(objectOut.Metadata);

// The same document comes back out as a JSON string.
const policyOut = await simS3.getBucketPolicy(
  new GetBucketPolicyCommand({ Bucket: "reports" }),
);

console.log(policyOut.Policy);
```

`GetBucketPolicyCommand` throws `NoSuchBucketPolicy` when the Bucket exists but has no policy, which
is how real S3 distinguishes that from a Bucket that does not exist. `DeleteBucketPolicyCommand`
succeeds either way, matching S3's idempotent behaviour.

A Bucket policy granting `Principal: "*"` is refused by default. See
[Block Public Access](#block-public-access) below.

## Block Public Access

Real S3 turns on all four Block Public Access settings for every new Bucket, and `BlockPublicPolicy`
makes `PutBucketPolicy` reject a policy that allows public access. Sim S3 does the same, so a Bucket
starts closed and a public Bucket policy is refused with `AccessDenied` until the Bucket opts out:

```typescript
await simS3.putPublicAccessBlock(
  new PutPublicAccessBlockCommand({
    Bucket: "site",
    PublicAccessBlockConfiguration: { BlockPublicPolicy: false },
  }),
);
```

The configuration you supply replaces the previous one wholesale, so a setting you leave out of it
is off rather than kept. That matches CDK: `BlockPublicAccess.BLOCK_ACLS` names only the two ACL
settings, and pairing it with `publicReadAccess: true` is the usual way to build a public website
Bucket.

`GetPublicAccessBlockCommand` reads the settings back and `DeletePublicAccessBlockCommand` removes
them, which returns the Bucket to fully blocked rather than leaving it open. In a CloudFormation
template the settings are the `PublicAccessBlockConfiguration` property of `AWS::S3::Bucket`, and a
Stack whose `AWS::S3::BucketPolicy` is public without that opt-out fails to deploy, exactly as the
real deployment would.

The settings govern what may be written rather than what is already stored, so turning
`BlockPublicPolicy` back on afterwards leaves an existing public policy in place.

### What counts as public

A statement is public when it allows a wildcard `Principal` without pinning the caller down. A
`Condition` fixing `aws:SourceAccount`, `aws:SourceArn`, `aws:PrincipalOrgID`, `aws:SourceVpc`,
`aws:SourceVpce`, `aws:SourceOwner`, `aws:userid`, `s3:DataAccessPointArn` or
`s3:DataAccessPointAccount` to a value with no wildcard in it makes the statement non-public, as it
does in real S3. A `Service` principal is never a wildcard, and a `Deny` statement is never public.

### Limitations

Only `BlockPublicPolicy` changes behaviour. The other three settings are stored and reported but do
nothing: `BlockPublicAcls` and `IgnorePublicAcls` govern ACLs, which are not modelled, and
`RestrictPublicBuckets` changes how an existing public policy is evaluated for cross-account callers
rather than rejecting a write, which is not yet simulated.

Anything the simulator cannot classify confidently counts as public and is refused, so it can be
stricter than real S3. A `NotPrincipal` statement, a statement with no `Principal`, and a
`Condition` on `aws:SourceIp` all count as public here. Real S3 accepts a sufficiently narrow
`aws:SourceIp` CIDR range as non-public; the simulator does not judge range breadth.

Account-level and organisation-level Block Public Access, access points, and `GetBucketPolicyStatus`
are not simulated.

The static website endpoint authorizes a request that names a principal as that principal, where a
real S3 website endpoint supports only publicly readable content and authenticates nothing. The
simulator is looser here, so a website reachable in a test as a named principal can be unreachable
in the same way against real S3.

Bucket ACLs and Object ownership settings are not modelled and are not planned. Object Ownership
defaults to Bucket owner enforced on new Buckets, which disables ACLs, and AWS recommends keeping
them disabled in favour of policies.

## Static website hosting

Configure Bucket website hosting with `PutBucketWebsiteCommand`.

Website hosting settles which Object answers a request, not who may read it. A browser asking for a
page is anonymous, and anonymous holds nothing unless a Bucket policy grants it, so a site with no
Bucket policy answers `403` to every ordinary visitor, as it does on real S3. See
[Block Public Access](#block-public-access) for the two commands a public site needs; the localhost
serving example below shows them in place. The examples in this section configure hosting without
serving it, so they leave that out.

A request that does name a principal, through a signature or the `x-sim-aws-caller` header, is
authorized as that principal, so an identity policy granting `s3:GetObject` reaches the website
endpoint too. Real S3 has no such thing: its website endpoint supports only publicly readable
content and never authenticates a request. This is a deliberate simulator affordance, in keeping
with the other simulated services that serve HTTP, and it means a website test driven as a named
principal proves less than one driven as a browser would be.

```typescript sim-s3-static-website-hosting
/**
 * Simulated S3 static website hosting.
 */

import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.region("eu-west-2").s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "foo-site",
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "foo-site",
    Key: "index.html",
    Body: "<h1>Hello from simulated S3</h1>",
    ContentType: "text/html; charset=utf-8",
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "foo-site",
    Key: "docs/index.html",
    Body: "<h1>Docs</h1>",
    ContentType: "text/html; charset=utf-8",
  }),
);

await simS3.putBucketWebsite(
  new PutBucketWebsiteCommand({
    Bucket: "foo-site",
    WebsiteConfiguration: {
      IndexDocument: {
        Suffix: "index.html",
      },
    },
  }),
);

console.log(simS3.getBucketWebsiteUrl("foo-site").toString());
```

With an index document configured:

- `/` resolves to `index.html`
- `/docs/` resolves to `docs/index.html`
- `/docs` redirects to `/docs/` when `docs/index.html` exists

Static website hosting must be enabled before the sim Bucket can be served over HTTP. If it is not
enabled, the localhost server returns `403`.

## Serve simulated S3 on localhost

Use `serveSimAws` when you want application code to make real HTTP requests to the simulated S3, or
to access the simulated services via your browser or commandline with curl.

```typescript sim-s3-serve-localhost
/**
 * Serving simulated S3 on localhost.
 */

import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const simS3 = simAws.region("eu-west-2").s3();

  await simS3.createBucket(
    new CreateBucketCommand({
      Bucket: "foo-site",
    }),
  );

  await simS3.putObject(
    new PutObjectCommand({
      Bucket: "foo-site",
      Key: "index.html",
      Body: "<h1>Hello from localhost S3</h1>",
      ContentType: "text/html; charset=utf-8",
    }),
  );

  await simS3.putBucketWebsite(
    new PutBucketWebsiteCommand({
      Bucket: "foo-site",
      WebsiteConfiguration: {
        IndexDocument: {
          Suffix: "index.html",
        },
      },
    }),
  );

  // A website endpoint serves only what the Bucket policy makes readable, and
  // a public policy needs the Block Public Access opt-out first.
  await simS3.putPublicAccessBlock(
    new PutPublicAccessBlockCommand({
      Bucket: "foo-site",
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
      },
    }),
  );
  await simS3.putBucketPolicy(
    new PutBucketPolicyCommand({
      Bucket: "foo-site",
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::foo-site/*",
        },
      }),
    }),
  );

  const websiteUrl = simS3.getBucketWebsiteUrl("foo-site");
  const localWebsiteUrl = srv.localUrl(websiteUrl);

  const response = await fetch(localWebsiteUrl);

  console.log(response.status);
  console.log(response.headers.get("content-type"));
  console.log(await response.text());
} finally {
  await srv.close();
}
```

The `getBucketWebsiteUrl(...)` method returns the simulated S3 website URL for the Bucket. The
`localUrl(...)` method on the localhost server adapts that URL so the request is sent to the local
server while preserving the simulated S3 website hostname.

## Presigned URLs

Sim S3 serves a REST API endpoint alongside the website endpoint, and it accepts presigned URLs
built by the real AWS presigner, `getSignedUrl` from `@aws-sdk/s3-request-presigner`. Nothing about
the signing is simulated: an `S3Client` is pointed at the simulated endpoint and signs as it would
against real S3, and sim IAM verifies the signature it produced.

Presigning is entirely client-side, so this works whether or not the URL is ever fetched over a real
socket. Install the presigner alongside the SDK:

```bash
npm install --save-dev @aws-sdk/s3-request-presigner
```

`simS3.getServiceUrl()` gives the endpoint to configure the client with. Sim S3 also has
`getBucketUrl(...)` for the virtual-hosted endpoint of one Bucket, though a client adds the Bucket
to the service endpoint for itself.

```typescript sim-s3-presigned-url
/**
 * Downloading a simulated S3 Object through a presigned URL.
 */

import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const simS3 = simAws.region("eu-west-2").s3();
  const simIam = simAws.iam();

  await simS3.createBucket(new CreateBucketCommand({ Bucket: "reports" }));
  await simS3.putObject(
    new PutObjectCommand({
      Bucket: "reports",
      Key: "q3/report.txt",
      Body: "quarterly numbers",
      ContentType: "text/plain",
    }),
  );

  // Whoever presigns the URL needs permission for what it will be used for.
  await simIam.createUser(new CreateUserCommand({ UserName: "Publisher" }));
  await simIam.putUserPolicy(
    new PutUserPolicyCommand({
      UserName: "Publisher",
      PolicyName: "ReadReports",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::reports/*",
        },
      }),
    }),
  );
  const accessKey = await simIam.createAccessKey(
    new CreateAccessKeyCommand({ UserName: "Publisher" }),
  );

  // The endpoint includes the port the local server took, because a presigned
  // URL signs its own host and cannot be redirected elsewhere afterwards.
  const s3Client = new S3Client({
    region: "eu-west-2",
    endpoint: srv.localUrl(simS3.getServiceUrl()).toString(),
    credentials: {
      accessKeyId: accessKey.AccessKey.AccessKeyId,
      secretAccessKey: accessKey.AccessKey.SecretAccessKey,
    },
  });

  const url = await getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: "reports", Key: "q3/report.txt" }),
    { expiresIn: 900 },
  );

  const response = await fetch(url);

  console.log(response.status);
  console.log(await response.text());
} finally {
  await srv.close();
}
```

A presigned URL grants exactly what the principal who signed it holds. Sim IAM resolves that
principal from the signature and authorizes `s3:GetObject` as them, so a user without permission
cannot presign around it. Temporary credentials from an STS `AssumeRoleCommand` work the same way,
carrying their session token in the URL.

A request to the REST endpoint that neither presents a signature nor names a principal in the
`x-sim-aws-caller` header is anonymous, and anonymous holds nothing unless a Bucket policy says
otherwise. That header is always enabled and wins over a signature, so a request driven by hand can
be any principal without signing anything, exactly as it can against the other simulated services
that serve HTTP. See
[the sim IAM docs](../iam/README.md#what-the-simulator-reports-back) for the whole boundary.

### Expiry in simulated time

`X-Amz-Expires` is judged against Yulin's simulated clock. A frozen clock keeps a URL usable however
long a test spends, and advancing past the window expires it with the `AccessDenied` and
`Request has expired` real S3 answers with:

```typescript
simAws.clock().freeze();
const url = await getSignedUrl(s3Client, command, { expiresIn: 900 });

await simAws.clock().advanceBy({ minutes: 20 });
const response = await fetch(url); // 403
```

### Uploads and checksums

Presigned `PutObjectCommand` URLs work in the same way, with one thing to watch. The AWS SDK computes
a checksum when it presigns, which is before there is a body to hash, and hoists it into the signed
URL. Uploading anything else through that URL then fails against real S3, and fails here too, with
`XAmzContentChecksumMismatch`. Build the client with
`requestChecksumCalculation: "WHEN_REQUIRED"` to presign upload URLs that accept a body:

```typescript
const s3Client = new S3Client({
  region: "eu-west-2",
  endpoint: srv.localUrl(simS3.getServiceUrl()).toString(),
  requestChecksumCalculation: "WHEN_REQUIRED",
  credentials,
});
```

### Limitations

- `GET`, `HEAD`, `PUT` and `DELETE` of an Object are served over the REST endpoint. Bucket operations
  and multipart uploads are not, and are refused with `501` rather than answered. `DeleteObjects` is
  a `POST` to the Bucket, so it is available through the SDK but not over HTTP.
- `createPresignedPost` and SigV4A presigning are not simulated.
- Checksums are verified for CRC32, SHA1 and SHA256. An upload stating a CRC32C or CRC64NVME checksum
  is refused rather than stored unchecked.
- Responses carry no `ETag`, because sim S3 does not model Object entity tags.

## Error documents

Configure an error document to return custom content with a `404` response when an Object is
missing.

```typescript sim-s3-error-document
/**
 * Simulated S3 error documents.
 */

import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "error-site",
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "error-site",
    Key: "error.html",
    Body: "<h1>Not found</h1>",
    ContentType: "text/html; charset=utf-8",
  }),
);

await simS3.putBucketWebsite(
  new PutBucketWebsiteCommand({
    Bucket: "error-site",
    WebsiteConfiguration: {
      IndexDocument: {
        Suffix: "index.html",
      },
      ErrorDocument: {
        Key: "error.html",
      },
    },
  }),
);
```

## Website redirects

Sim S3 supports common S3 website redirect configuration.

Redirect all requests to another host:

```typescript sim-s3-website-redirect
/**
 * Simulated S3 website redirects.
 */

import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "redirect-site",
  }),
);

await simS3.putBucketWebsite(
  new PutBucketWebsiteCommand({
    Bucket: "redirect-site",
    WebsiteConfiguration: {
      RedirectAllRequestsTo: {
        HostName: "example.test",
        Protocol: "https",
      },
    },
  }),
);
```

Add routing rules for conditional redirects:

```typescript sim-s3-conditional-redirect
/**
 * Conditional redirects in simulated S3.
 */

import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "docs-site",
  }),
);

await simS3.putBucketWebsite(
  new PutBucketWebsiteCommand({
    Bucket: "docs-site",
    WebsiteConfiguration: {
      IndexDocument: {
        Suffix: "index.html",
      },
      RoutingRules: [
        {
          Condition: {
            KeyPrefixEquals: "old/",
          },
          Redirect: {
            ReplaceKeyPrefixWith: "new/",
          },
        },
        {
          Condition: {
            HttpErrorCodeReturnedEquals: "404",
          },
          Redirect: {
            HttpRedirectCode: "302",
            ReplaceKeyWith: "not-found.html",
          },
        },
      ],
    },
  }),
);
```

The first matching routing rule is used. A rule can match by `KeyPrefixEquals`,
`HttpErrorCodeReturnedEquals`, both, or neither. Redirects support configured host, protocol,
replacement key, replacement key prefix, and redirect status code.

## Filesystem-backed Bucket storage

By default, simulated S3 stores Objects in memory. For local development, you can mount a Bucket to a
filesystem directory. This is handy for serving a static website on the local filesystem through
simulated S3.

```typescript sim-s3-filesystem-storage
/**
 * Local filesystem storage for simulated S3 Buckets.
 */

import path from "node:path";

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "public-assets",
  }),
);

simS3.mountBucketFilesystem(
  "public-assets",
  path.join(process.cwd(), "public"),
);
```

After mounting, Object reads and writes for that Bucket use the filesystem directory.

### Reloading the browser when the directory changes

The Bucket is reading the files, so a rebuild needs nothing copying into it. All that is left is
telling the browser. Give the mount somewhere to reload and it watches the directory for you:

```typescript sim-s3-mount-reload
/**
 * Reloading the browser when a build writes into a mounted directory.
 */

import path from "node:path";

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws, port: 8787, liveReload: true });

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "site" }));

simAws.s3().mountBucketFilesystem("site", path.join(process.cwd(), "public"), {
  reload: srv,
});
```

A build writing a whole tree of files is one reload, not one per file: the writes are held until
they stop arriving. `settleMs` is how long that wait is, in milliseconds, for a generator that
pauses part way through a build:

```typescript sim-s3-mount-reload-settle
/**
 * Waiting longer for a slow build to finish writing.
 */

import path from "node:path";

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws, liveReload: true });

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "site" }));

simAws.s3().mountBucketFilesystem("site", path.join(process.cwd(), "dist"), {
  reload: srv,
  settleMs: 500,
});
```

Anything with a `reload()` method will do, so a test can watch a mount without serving anything.

The watch is recursive, and holds an open filesystem handle, which keeps the process alive. A dev
process wants exactly that. Anything with an end, such as a test, calls
`simAws.s3().stopWatchingMountedDirectories()` when it is done.
`simAws.s3().watchedMountedDirectories()` says which directories are being watched.
[`simAws.close()`](../../serve/README.md#stopping-and-restarting) is the one that does not need
naming a service or a scope: it lets go of the mounted directory watches along with everything else
the environment is holding, and a served environment gets that from `srv.close()`.

Under [`yulin watch`](../../serve/README.md#restarting-on-a-file-change), a mount that reloads for
itself is left alone by the supervisor: a rebuild reloads the page rather than restarting the
process and taking every simulated Bucket, Table and Stack with it. A mount without a reload target
is still reported to the supervisor as a directory to watch, and a change in it restarts the
process.

Filesystem storage is somewhat restrictive to make it slightly safer:

- The directory path must be absolute
- The directory must not be the filesystem root
- The directory must not be the user's home directory
- The path must not contain `..`
- Object keys must not be absolute paths or contain `..`
- Only files whose extension is on a cautious list are served; see below
- Symlinks are ignored when listing Objects
- Deletion is refused rather than unlinking a real file

`DeleteObject` against a filesystem-backed Bucket raises `NotImplemented`, and `DeleteObjects`
reports the same code for every key. This is stricter than real S3, deliberately: the directory a
Bucket is mounted on is an ordinary directory of yours, and removing files from it because a test
called `DeleteObject` is not a reasonable default. Leave a Bucket on the default in-memory storage
when a test needs deletion to work.

When reading files from filesystem-backed storage, Yulin infers common `content-type` metadata from
file extensions such as `.html`, `.css`, `.js`, `.json`, `.png`, `.svg`, `.txt`, `.xml`, and common
font and image formats. A served file whose extension is not one of those gets
`application/octet-stream`, which is what S3 reports for an object whose type it was never told.
That only comes up for an extension a mount named itself, below: no other file is served at all,
with or without a type.

### Serving a file extension of your own

A mounted Bucket only serves files whose extension is on a cautious list — the web's own types, and
nothing else — so that pointing a Bucket at a directory cannot be talked into reading whatever else
happens to be in it. A file with any other extension is not served, and a `GetObject` for it comes
back as though the file were not there. That is the right default and the wrong answer for a site
with a data file of its own, so a mount can name the extensions it needs:

```typescript sim-s3-mount-file-extensions
/**
 * Serving a data file whose extension is not one of the web's own.
 */

import path from "node:path";

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "site" }));

simAws.s3().mountBucketFilesystem("site", path.join(process.cwd(), "public"), {
  // A pinyin dictionary ships a binary frequency table beside its text files.
  additionalFileExtensions: [".freq"],
});
```

These are added to the list rather than replacing it, so naming one cannot cost you `.html`, and a
leading dot is optional. Everything not named is still refused.

## Object system metadata

S3 keeps a handful of headers about an Object when it is written and hands them back on every read.
Sim S3 stores and returns `cache-control`, `content-disposition`, `content-encoding`,
`content-language`, `content-type` and `expires`, alongside a `content-length` describing the body
being served.

Every path that serves an Object goes through the same mapping, so the REST endpoint, the
[website endpoint](#static-website-hosting) and a CloudFront S3 Origin all report the same headers
for it. `content-encoding` is the one that matters most: bytes served without it are bytes no client
can decode, so an Object stored as brotli is only usable if the header comes back with it.

`PutObjectCommand` sets them, one request field per header.

```typescript sim-s3-object-system-metadata
/**
 * Writing an Object with the system metadata S3 returns on a read.
 */

import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simS3 = new SimAws().s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "site" }));

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "site",
    Key: "app.js",
    Body: "compressed bytes",
    CacheControl: "public, max-age=31536000, immutable",
    ContentDisposition: 'inline; filename="app.js"',
    ContentEncoding: "br",
    ContentLanguage: "en-GB",
    ContentType: "text/javascript",
    Expires: new Date("2027-01-02T03:04:05Z"),
  }),
);

const objectOut = await simS3.getObject(
  new GetObjectCommand({ Bucket: "site", Key: "app.js" }),
);

// Each header is stored under the name a read returns it as.
console.log(objectOut.Metadata?.["content-encoding"]); // br
console.log(objectOut.Metadata?.["expires"]); // Sat, 02 Jan 2027 03:04:05 GMT
```

A header the write says nothing about is left unset rather than stored empty, so a read does not
report it. `Expires` is the one field that is not a string: the SDK takes a `Date`, which is stored
as the HTTP date a read hands back.

A CDK BucketDeployment's `SystemMetadata` sets the same headers on every Object it copies. See
[CDK S3 BucketDeployment](../cloudformation/README.md#cdk-s3-bucketdeployment).

## Standalone SimS3

If you only need S3 alone, you can instantiate `SimS3` directly.

```typescript sim-s3-standalone
/**
 * Standalone simulated S3 instance.
 */

import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SimS3 } from "@kensio/yulin/s3";

const simS3 = new SimS3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "standalone-bucket",
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "standalone-bucket",
    Key: "hello.txt",
    Body: "Hello from standalone SimS3",
  }),
);
```

A standalone `SimS3` instance has its own isolated state and is not connected to a wider `SimAws`
environment.

## Available functionality

Sim S3 currently supports:

- `CreateBucketCommand` and `ListBucketsCommand`
- `PutObjectCommand`, `GetObjectCommand` and `ListObjectsCommand`
- `DeleteObjectCommand` and `DeleteObjectsCommand`, authorized per Object by sim IAM
- `PutBucketNotificationConfigurationCommand` and `GetBucketNotificationConfigurationCommand`, with
  Object events delivered to a simulated Lambda function, a simulated SQS queue or a simulated SNS
  topic
- `PutBucketWebsiteCommand`, for static website hosting
- `PutBucketPolicyCommand`, `GetBucketPolicyCommand` and `DeleteBucketPolicyCommand`, evaluated by
  sim IAM alongside identity policies
- The `AWS::S3::Bucket` and `AWS::S3::BucketPolicy` CloudFormation resources
- Block Public Access, on by default as in real S3, refusing a public Bucket policy unless the Bucket
  opts out with `PutPublicAccessBlockCommand` or `PublicAccessBlockConfiguration`
- Serving static website requests on localhost with `serveSimAws`
- Serving Object `GET`, `HEAD`, `PUT` and `DELETE` over the S3 REST endpoint, authorized by sim IAM
- Presigned URLs built by the real `@aws-sdk/s3-request-presigner`, with expiry in simulated time
- Object system metadata set by a `PutObjectCommand` and returned on a read, over every endpoint
  that serves an Object
- Bucket website index documents, error documents, trailing-slash redirects, redirect-all
  configuration, and routing-rule redirects
- Bucket-global uniqueness within a `SimAws` instance across simulated Accounts and Regions
- In-memory Object storage by default
- Optional filesystem-backed Bucket storage with `mountBucketFilesystem(...)`, watching the mounted
  directory and reloading connected browsers when it is rebuilt

The simulator focuses on useful behaviour for tests and local development rather than full S3 feature
parity. Unsupported S3 options may be ignored or may throw errors depending on whether the simulator
needs them to model the requested behaviour.

## Limitations

These apply across the page. The sections above each list what is specific to them.

- Object versioning is not simulated. There are no version ids, no delete markers and no
  `VersionId` on any request or response.
- Multipart uploads are not simulated. An Object is stored by one `PutObject`, so an ETag is always
  the MD5 of the whole body.
- `GetObject` and `ListObjects` do not report an ETag or a last-modified time. Object event
  notifications do carry an ETag, since they compute it at the moment the Object is written.
- Object tags, ACLs, storage classes, lifecycle rules, replication and server-side encryption are
  not simulated.
- A Bucket using filesystem-backed storage cannot delete Objects, and raises no event
  notifications, because it swaps the whole storage backend rather than putting Objects.
- `GetObjectCommand` returns system metadata through `Metadata`, under the header name it is stored
  as, rather than through the `ContentType`, `CacheControl` and other response fields real S3 uses.
  See [Object system metadata](#object-system-metadata).
- An upload over the S3 REST endpoint keeps its `content-type` and no other system metadata, so a
  presigned `PUT` cannot set the rest. A `PutObjectCommand` through the SDK keeps all of them.
- A presigned `GetObject` ignores the `response-content-type`, `response-cache-control` and other
  `response-*` parameters that override a response header in real S3. An Object is served with the
  system metadata it was written with.
