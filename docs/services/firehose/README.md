# Simulated Kinesis Data Firehose

Yulin includes a simulated Kinesis Data Firehose for tests and local development. A delivery stream
takes records, buffers them, and writes them into a simulated S3 Bucket under the key format real
Firehose uses. The records come from `PutRecord` or off a simulated Kinesis stream. A test can put an
event and assert on the Object it landed in, without an AWS account and without waiting five minutes
for a buffer to flush.

Firehose specific types are imported from the `@kensio/yulin/firehose` subpath.

## Putting a record and finding the Object

`simAws.firehose()` gives the service for the default account and region. A delivery stream needs a
Bucket to write into and a Role to write as, so both exist before it does. Advancing the clock past
the buffering interval is what delivers the buffer.

```typescript sim-firehose-put-and-deliver
/**
 * Putting an order event on a delivery stream and finding it in the Bucket.
 */

import {
  CreateDeliveryStreamCommand,
  PutRecordCommand,
} from "@aws-sdk/client-firehose";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws
  .s3()
  .createBucket(new CreateBucketCommand({ Bucket: "order-archive" }));

const { Role } = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrderArchiveRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "firehose.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "OrderArchiveRole",
    PolicyName: "ArchiveOrders",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:PutObject",
        Resource: "arn:aws:s3:::order-archive/*",
      },
    }),
  }),
);

await simAws.firehose().createDeliveryStream(
  new CreateDeliveryStreamCommand({
    DeliveryStreamName: "order-events",
    ExtendedS3DestinationConfiguration: {
      BucketARN: "arn:aws:s3:::order-archive",
      RoleARN: Role.Arn,
      BufferingHints: { IntervalInSeconds: 60 },
    },
  }),
);

const orderEvent = `${JSON.stringify({ id: "order-1" })}\n`;

await simAws.firehose().putRecord(
  new PutRecordCommand({
    DeliveryStreamName: "order-events",
    Record: { Data: new TextEncoder().encode(orderEvent) },
  }),
);

await simAws.clock().advanceBy({ seconds: 61 });

const { Contents } = await simAws
  .s3()
  .listObjectsV2(new ListObjectsV2Command({ Bucket: "order-archive" }));

// 2026/08/22/13/order-events-1-2026-08-22-13-51-01-92076704-cf4a-...
console.log(Contents?.[0]?.Key);
```

The put is answered straight away with a record id. The Bucket stays empty until the buffer is
delivered. That delay is what a Firehose pipeline is built around.

## Buffering

A delivery stream holds its records until the buffer passes `SizeInMBs` or `IntervalInSeconds`,
whichever comes first. Everything in one buffer arrives as one Object, with the records concatenated
end to end. A producer that wants lines puts the newline on the end of each record. The example
below does exactly that.

`IntervalInSeconds` runs from the first record of a buffer. The default is 300 seconds and the
default size is 5 MB, as they are on real Firehose.

```typescript sim-firehose-buffering
/**
 * Three records inside one buffering window, and the single Object they land
 * in.
 */

import { text } from "node:stream/consumers";

import {
  CreateDeliveryStreamCommand,
  PutRecordBatchCommand,
} from "@aws-sdk/client-firehose";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "@kensio/yulin";

/**
 * A Bucket, a delivery Role allowed the S3 actions given, and a delivery
 * stream writing into the one as the other.
 */
async function makeOrderArchive(
  simAws: SimAws,
  actions: readonly string[] = ["s3:PutObject"],
): Promise<void> {
  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: "order-archive" }));

  const { Role } = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "OrderArchiveRole",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { Service: "firehose.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "OrderArchiveRole",
      PolicyName: "ArchiveOrders",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: actions,
          Resource: "arn:aws:s3:::order-archive/*",
        },
      }),
    }),
  );

  await simAws.firehose().createDeliveryStream(
    new CreateDeliveryStreamCommand({
      DeliveryStreamName: "order-events",
      ExtendedS3DestinationConfiguration: {
        BucketARN: "arn:aws:s3:::order-archive",
        RoleARN: Role.Arn,
        BufferingHints: { IntervalInSeconds: 60 },
      },
    }),
  );
}

const simAws = new SimAws();

await makeOrderArchive(simAws);

await simAws.firehose().putRecordBatch(
  new PutRecordBatchCommand({
    DeliveryStreamName: "order-events",
    Records: ["order-1", "order-2", "order-3"].map((id) => ({
      Data: new TextEncoder().encode(`${JSON.stringify({ id })}\n`),
    })),
  }),
);

await simAws.clock().advanceBy({ minutes: 2 });

const { Contents } = await simAws
  .s3()
  .listObjectsV2(new ListObjectsV2Command({ Bucket: "order-archive" }));

// 1
console.log(Contents?.length);

const object = await simAws.s3().getObject(
  new GetObjectCommand({
    Bucket: "order-archive",
    Key: Contents?.[0]?.Key,
  }),
);

assertNonNullable(object.Body, "The delivered Object has a body");

// {"id":"order-1"}
// {"id":"order-2"}
// {"id":"order-3"}
console.log(await text(object.Body));
```

A buffer that fills before its interval is delivered on the size instead. That delivery happens on
the background scheduler, the way real Firehose answers the producer before it writes anything.
`simAws.backgroundTasksComplete()` is what a test waits on for it.

## The Object key

The key is the `Prefix`, then the UTC date path, then the delivery stream name, its version, the
delivery time and a random string:

```
<Prefix>YYYY/MM/DD/HH/<delivery-stream-name>-<version>-YYYY-MM-DD-HH-MM-SS-<random>
```

A delivery stream with no `Prefix` gets the bare date path. The version is `1` and stays there,
since a delivery stream's configuration is fixed once it is created.

Simulated time is what the date path and the timestamp come from. A test that sets the clock to a
known instant knows the prefix its Objects are under, and can list them.

## Reading from a Kinesis stream

A delivery stream can take its records off a simulated Kinesis stream instead. Create it with a
`DeliveryStreamType` of `KinesisStreamAsSource` and a `KinesisStreamSourceConfiguration` naming the
stream and the Role to read it as. Records put on the stream from then on are buffered and delivered
the way put records are.

```typescript sim-firehose-kinesis-source
/**
 * An order event put on a Kinesis stream, and the Object the delivery stream
 * reading that stream wrote it into.
 */

import { CreateDeliveryStreamCommand } from "@aws-sdk/client-firehose";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateStreamCommand,
  DescribeStreamSummaryCommand,
  PutRecordCommand,
} from "@aws-sdk/client-kinesis";
import { CreateBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws
  .s3()
  .createBucket(new CreateBucketCommand({ Bucket: "order-archive" }));

await simAws
  .kinesis()
  .createStream(
    new CreateStreamCommand({ StreamName: "orders", ShardCount: 2 }),
  );

const { StreamDescriptionSummary } = await simAws
  .kinesis()
  .describeStreamSummary(
    new DescribeStreamSummaryCommand({ StreamName: "orders" }),
  );

const { Role } = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrderArchiveRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "firehose.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "OrderArchiveRole",
    PolicyName: "ArchiveOrders",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "s3:PutObject",
          Resource: "arn:aws:s3:::order-archive/*",
        },
        {
          Effect: "Allow",
          Action: [
            "kinesis:DescribeStream",
            "kinesis:GetShardIterator",
            "kinesis:GetRecords",
          ],
          Resource: StreamDescriptionSummary.StreamARN,
        },
      ],
    }),
  }),
);

await simAws.firehose().createDeliveryStream(
  new CreateDeliveryStreamCommand({
    DeliveryStreamName: "order-events",
    DeliveryStreamType: "KinesisStreamAsSource",
    KinesisStreamSourceConfiguration: {
      KinesisStreamARN: StreamDescriptionSummary.StreamARN,
      RoleARN: Role.Arn,
    },
    ExtendedS3DestinationConfiguration: {
      BucketARN: "arn:aws:s3:::order-archive",
      RoleARN: Role.Arn,
      BufferingHints: { IntervalInSeconds: 60 },
    },
  }),
);

const orderEvent = `${JSON.stringify({ id: "order-1" })}\n`;

await simAws.kinesis().putRecord(
  new PutRecordCommand({
    StreamName: "orders",
    PartitionKey: "order-1",
    Data: new TextEncoder().encode(orderEvent),
  }),
);

await simAws.clock().advanceBy({ seconds: 60 });

const { Contents } = await simAws
  .s3()
  .listObjectsV2(new ListObjectsV2Command({ Bucket: "order-archive" }));

// 1
console.log(Contents?.length);
```

Every shard of the stream is read, so records spread across partition keys all arrive. The Object
holds the record data as it was put on the stream. Firehose delivers those bytes and nothing else
about the Kinesis record.

Reading starts at the end of the stream when the delivery stream is created. Real Firehose starts
there too. A record put before that stays on the stream for whatever else is reading it.

The read happens on the clock. A record put on the stream is read when simulated time next moves, so
one `advanceBy` past the buffering interval covers both halves. `simAws.backgroundTasksComplete()`
does not move simulated time and leaves the record on the stream.

`DescribeDeliveryStream` reports the stream, the Role and the instant reading started under
`Source.KinesisStreamSourceDescription`. `PutRecord` and `PutRecordBatch` on a delivery stream with a
Kinesis source raise `InvalidArgumentException`, as they do on real Firehose. Put the record onto the
stream instead.

Deleting the delivery stream stops it reading. Records put afterwards stay on the stream.

## Permissions

Every Firehose operation authorizes against the `firehose:` action of the same name, on the ARN of
the delivery stream it names. `ListDeliveryStreams` names none, and authorizes against `*`.

The delivery itself is a separate request, made as the delivery stream's `RoleARN`. The caller who
put the record needs no S3 permission at all, and a Role that cannot write to the Bucket fails the
delivery. Real
Firehose answered that `PutRecord` minutes earlier, and what became of the buffer reaches the
producer through CloudWatch. The simulator keeps the failure for a test to read instead.

```typescript sim-firehose-permissions
/**
 * A delivery Role that cannot write to the Bucket, and where the failure shows
 * up.
 */

import {
  CreateDeliveryStreamCommand,
  PutRecordCommand,
} from "@aws-sdk/client-firehose";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

/**
 * A Bucket, a delivery Role allowed the S3 actions given, and a delivery
 * stream writing into the one as the other.
 */
async function makeOrderArchive(
  simAws: SimAws,
  actions: readonly string[] = ["s3:PutObject"],
): Promise<void> {
  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: "order-archive" }));

  const { Role } = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "OrderArchiveRole",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { Service: "firehose.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "OrderArchiveRole",
      PolicyName: "ArchiveOrders",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: actions,
          Resource: "arn:aws:s3:::order-archive/*",
        },
      }),
    }),
  );

  await simAws.firehose().createDeliveryStream(
    new CreateDeliveryStreamCommand({
      DeliveryStreamName: "order-events",
      ExtendedS3DestinationConfiguration: {
        BucketARN: "arn:aws:s3:::order-archive",
        RoleARN: Role.Arn,
        BufferingHints: { IntervalInSeconds: 60 },
      },
    }),
  );
}

const simAws = new SimAws();

// The Role may read the Bucket, and it may not write to it.
await makeOrderArchive(simAws, ["s3:GetObject", "s3:ListBucket"]);

await simAws.firehose().putRecord(
  new PutRecordCommand({
    DeliveryStreamName: "order-events",
    Record: { Data: new TextEncoder().encode("one\n") },
  }),
);

await simAws.clock().advanceBy({ minutes: 2 });

const { Contents } = await simAws
  .s3()
  .listObjectsV2(new ListObjectsV2Command({ Bucket: "order-archive" }));

// 0
console.log(Contents?.length ?? 0);

const [failure] = simAws.firehose().getDeliveryFailures();

// order-events could not write 1 record to order-archive
console.log(
  `${failure?.deliveryStreamName} could not write ` +
    `${failure?.recordCount} record to ${failure?.bucketName}`,
);

// true
console.log(failure?.wasRefused);
```

The source `RoleARN` is a second Role, and reading is authorized against it in the same way. A Role
that cannot read the stream stops the delivery stream reading, and the failure goes to
`getSourceFailures()`. There is one of those per delivery stream at most. The Role is refused every
time it asks, and going round again would record the same refusal for as long as the simulation ran.

A failure carries the delivery stream, the Bucket, the key it tried, how many records were in the
buffer, the Role it wrote as and the error itself. A source failure carries the delivery stream, the
stream ARN, the Role it read as and the error. `wasRefused` separates an IAM denial from a
delivery that broke some other way. A denial is recorded quietly, since removing `s3:PutObject` is
what a test checking the denial does. Anything else is also warned about on the console.

## Deploying from CloudFormation

`AWS::KinesisFirehose::DeliveryStream` deploys a delivery stream. `DeliveryStreamName`,
`DeliveryStreamType`, `ExtendedS3DestinationConfiguration`, `S3DestinationConfiguration` and `Tags`
are read. A `Ref` gives the delivery stream name and `Fn::GetAtt` on `Arn` gives the ARN, the way
real CloudFormation publishes them.

A CDK `DeliveryStream` with an `S3Bucket` destination synthesizes that resource, along with the
delivery Role and its policy. A CDK project reaches a simulated delivery stream by deploying its
synthesized template, and nothing here has to be written by hand.

```typescript sim-firehose-cloudformation
/**
 * Deploying a delivery stream from a template and putting a record onto it.
 */

import { PutRecordCommand } from "@aws-sdk/client-firehose";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrderArchive: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "order-archive" },
      },
      DeliveryRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "firehose.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          },
          Policies: [
            {
              PolicyName: "ArchiveOrders",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: "s3:PutObject",
                    Resource: "arn:aws:s3:::order-archive/*",
                  },
                ],
              },
            },
          ],
        },
      },
      OrderEvents: {
        Type: "AWS::KinesisFirehose::DeliveryStream",
        Properties: {
          DeliveryStreamName: "order-events",
          DeliveryStreamType: "DirectPut",
          ExtendedS3DestinationConfiguration: {
            BucketARN: { "Fn::GetAtt": ["OrderArchive", "Arn"] },
            RoleARN: { "Fn::GetAtt": ["DeliveryRole", "Arn"] },
            Prefix: "orders/",
            BufferingHints: { IntervalInSeconds: 60, SizeInMBs: 1 },
          },
        },
      },
    },
    Outputs: {
      DeliveryStreamArn: { Value: { "Fn::GetAtt": ["OrderEvents", "Arn"] } },
    },
  },
});

await stack.waitForDeployComplete();

// arn:aws:firehose:us-east-1:<account>:deliverystream/order-events
console.log(stack.outputs.get("DeliveryStreamArn")?.value);

await simAws.firehose().putRecord(
  new PutRecordCommand({
    DeliveryStreamName: "order-events",
    Record: { Data: new TextEncoder().encode('{"id":"order-1"}\n') },
  }),
);

await simAws.clock().advanceBy({ minutes: 2 });

const { Contents } = await simAws
  .s3()
  .listObjectsV2(new ListObjectsV2Command({ Bucket: "order-archive" }));

// orders/2026/08/22/13/order-events-1-2026-08-22-13-51-01-92076704-cf4a-...
console.log(Contents?.[0]?.Key);
```

Both S3 destination properties are read, and a template declaring both is refused, the same as a
`CreateDeliveryStream` request carrying both.

The Bucket and the Role are named by ARN. A stack declaring all three deploys a delivery stream that
writes into the Bucket beside it, as the Role beside it, and a Role without `s3:PutObject` fails the
delivery the same way one created through `CreateDeliveryStream` does. Deleting the stack deletes the
delivery stream.

A delivery stream the template does not name is named after the stack and the logical ID, as real
CloudFormation names one. The name is trimmed to the 64 characters Firehose allows.

`DeliveryStreamEncryptionConfigurationInput` and `DirectPutSourceConfiguration` are recorded against
the resource as unsimulated, and the delivery stream deploys anyway. The destination properties this
simulation has no behaviour for go the same way, including `ProcessingConfiguration`,
`DynamicPartitioningConfiguration`, `DataFormatConversionConfiguration`, `CompressionFormat` and the
`CloudWatchLoggingOptions` CDK writes into every destination. They are all in
`stack.ignoredProperties`.

A delivery stream this simulation cannot deliver for is skipped and recorded in
`stack.skippedResources`, and the rest of the stack deploys. That covers a destination other than
S3, a `DeliveryStreamType` of `KinesisStreamAsSource`, and a source property naming somewhere the
records cannot come from, such as `MSKSourceConfiguration` or `DatabaseSourceConfiguration`. The
source property is what the skip is decided on, because a template that leaves `DeliveryStreamType`
out gets `DirectPut` by default.

## SDK interception

`SimSdk` intercepts a `FirehoseClient`, so application code that constructs its own client reaches
the simulation without being handed one.

```typescript sim-firehose-sdk-interception
/**
 * Application code sending to its own FirehoseClient, answered by the
 * simulation.
 */

import {
  CreateDeliveryStreamCommand,
  FirehoseClient,
  PutRecordCommand,
} from "@aws-sdk/client-firehose";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

import type { SimAws } from "@kensio/yulin";
import { SimSdk } from "@kensio/yulin/sdk";

/**
 * A Bucket, a delivery Role allowed the S3 actions given, and a delivery
 * stream writing into the one as the other.
 */
async function makeOrderArchive(
  simAws: SimAws,
  actions: readonly string[] = ["s3:PutObject"],
): Promise<void> {
  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: "order-archive" }));

  const { Role } = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "OrderArchiveRole",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { Service: "firehose.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "OrderArchiveRole",
      PolicyName: "ArchiveOrders",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: actions,
          Resource: "arn:aws:s3:::order-archive/*",
        },
      }),
    }),
  );

  await simAws.firehose().createDeliveryStream(
    new CreateDeliveryStreamCommand({
      DeliveryStreamName: "order-events",
      ExtendedS3DestinationConfiguration: {
        BucketARN: "arn:aws:s3:::order-archive",
        RoleARN: Role.Arn,
        BufferingHints: { IntervalInSeconds: 60 },
      },
    }),
  );
}

using simSdk = new SimSdk();

simSdk.intercept(FirehoseClient);
simSdk.intercept(S3Client);

await makeOrderArchive(simSdk.simAws);

const firehose = new FirehoseClient({ region: "us-east-1" });
const s3 = new S3Client({ region: "us-east-1" });

await firehose.send(
  new PutRecordCommand({
    DeliveryStreamName: "order-events",
    Record: { Data: new TextEncoder().encode("one\n") },
  }),
);

await simSdk.simAws.clock().advanceBy({ minutes: 2 });

const { Contents } = await s3.send(
  new ListObjectsV2Command({ Bucket: "order-archive" }),
);

// 1
console.log(Contents?.length);
```

## Supported commands

| Command                  | Notes                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `CreateDeliveryStream`   | A name already in use raises `ResourceInUseException`.                                                  |
| `DeleteDeliveryStream`   | The name is free again at once. Whatever was buffered goes with it.                                     |
| `ListDeliveryStreams`    | Sorted by name, paged with `Limit` and `ExclusiveStartDeliveryStreamName`.                              |
| `DescribeDeliveryStream` | Reports the one destination, and a Kinesis source under `Source`.                                       |
| `PutRecord`              | Records up to 1,000 KiB. Refused on a Kinesis-sourced delivery stream.                                  |
| `PutRecordBatch`         | Up to 500 records and 4 MiB, and refused on a Kinesis-sourced one too. `FailedPutCount` is always zero. |

Anything else refuses on send with `SimSdkUnsupportedCommandError`, which covers
`UpdateDestination`, `StartDeliveryStreamEncryption`, `StopDeliveryStreamEncryption` and the tag
operations.

## Divergences and limitations

- **S3 is the only destination.** `RedshiftDestinationConfiguration`,
  `ElasticsearchDestinationConfiguration`, the two OpenSearch ones,
  `SplunkDestinationConfiguration`, `HttpEndpointDestinationConfiguration`,
  `IcebergDestinationConfiguration` and `SnowflakeDestinationConfiguration` are each refused by name
  at `CreateDeliveryStream`. A delivery stream created against one of them would take records and
  drop them, and a test asserting on an empty Bucket would blame the code under test.
  `S3DestinationConfiguration` and `ExtendedS3DestinationConfiguration` are both read, and a
  request carrying both is refused with `InvalidArgumentException`, the way real Firehose refuses a
  request naming more than one destination. Either way the delivery stream describes back through
  `ExtendedS3DestinationDescription`, which is the shape carrying every field read here.
  `S3DestinationDescription` is always absent.
- **`DirectPut` and `KinesisStreamAsSource` are the two sources.** Every other
  `DeliveryStreamType`, such as `MSKAsSource` and `DatabaseAsSource`, is refused by name. A source
  stream in another account or region is refused as well, since a simulated Firehose reads the
  simulated Kinesis of its own scope.
- **A source stream is read through `GetRecords`.** Enhanced fan-out is absent from simulated
  Kinesis as well. `RetryOptions` on the destination is read and stored, and nothing here fails a
  read in a way that would use it. A read that fails stops the delivery stream instead, and the
  failure goes to `getSourceFailures()`.
- **A source stream keeps the shards it was created with.** Simulated Kinesis does not reshard, so
  the shards a delivery stream opens when it is created are the ones it reads for its life.
- **A delivery stream a template cannot deploy is skipped.** A destination other than S3, a source
  outside the two simulated, and a source property such as `MSKSourceConfiguration` or
  `DatabaseSourceConfiguration`, each leave the Resource in `stack.skippedResources` while the rest
  of the stack deploys. See [deploying from CloudFormation](#deploying-from-cloudformation).
- **A delivery stream is `ACTIVE` as soon as it exists.** Real Firehose reports `CREATING` for a
  minute or so, and a status a test has to poll through earns its keep only where something is
  being brought up. `DELETING` is absent for the same reason.
- **Record transformation is absent.** `ProcessingConfiguration` invoking a Lambda over the buffer
  is a second delivery path, and it is ignored. A delivery stream declaring one delivers the records
  as they were put.
- **Dynamic partitioning is absent.** `DynamicPartitioningConfiguration` derives a partition key
  from record content through jq or a Lambda. A record's bytes are carried here and never read.
- **Every Object holds the bytes that were put.** GZIP, Snappy, ZIP, Parquet and ORC all change the
  bytes in the Object while leaving what a test is checking alone, so `CompressionFormat` and
  `DataFormatConversionConfiguration` are left out. Every destination reports `UNCOMPRESSED`.
- **The error output path is unused.** `ErrorOutputPrefix` is read and reported back by
  `DescribeDeliveryStream`. Writing under it takes a record that failed its own transformation or
  its own conversion, and both of those are absent.
- **Server-side encryption is absent.** `DeliveryStreamEncryptionConfigurationInput` is ignored, and
  `Encrypted` is false on every put.
- **A failed delivery is recorded once.** Real Firehose retries for `DurationInSeconds` and then
  writes the buffer under the error output prefix. `RetryOptions` is accepted and unused, and a
  buffer that failed goes straight to `getDeliveryFailures()`.
- **Throughput is unlimited.** Real Firehose takes a fixed number of records and bytes a second per
  delivery stream, and refuses past that with `ServiceUnavailableException`. Nothing here counts.
  `FailedPutCount` on `PutRecordBatch` is always zero for the same reason. Real Firehose fails one
  record of a batch for throughput limits and internal faults, and both are absent here. The
  per-record response shape is still what a consumer of the response reads.
- **Tags are accepted and never listed.** `TagDeliveryStream`, `ListTagsForDeliveryStream` and
  `UntagDeliveryStream` are absent. The `Tags` a template declares go the same way.
- **A delivery stream cannot be reconfigured.** `UpdateDestination` is absent. The version in an
  Object key stays at `1` for the life of the delivery stream.
