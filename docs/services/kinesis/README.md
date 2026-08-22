# Simulated Kinesis Data Streams

Yulin includes a simulated Kinesis Data Streams for tests and local development. It creates streams,
places records on shards the way real Kinesis does, and hands them back through shard iterators. A
test can put an event and assert that the consumer read it, without an AWS account and without
waiting on a real stream.

Kinesis specific types are imported from the `@kensio/yulin/kinesis` subpath.

## Putting a record and reading it back

`simAws.kinesis()` gives the service for the default account and region. Records go on with
`PutRecord`, and come off through a shard iterator, which is the walk every Kinesis consumer makes.

```typescript sim-kinesis-put-and-read
/**
 * Putting an order event on a stream and reading it back.
 */

import {
  CreateStreamCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  PutRecordCommand,
} from "@aws-sdk/client-kinesis";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const kinesis = simAws.kinesis();

await kinesis.createStream(
  new CreateStreamCommand({ StreamName: "orders", ShardCount: 1 }),
);

const orderEvent = new TextEncoder().encode(JSON.stringify({ id: "order-1" }));

await kinesis.putRecord(
  new PutRecordCommand({
    StreamName: "orders",
    PartitionKey: "customer-1",
    Data: orderEvent,
  }),
);

const { ShardIterator } = await kinesis.getShardIterator(
  new GetShardIteratorCommand({
    StreamName: "orders",
    ShardId: "shardId-000000000000",
    ShardIteratorType: "TRIM_HORIZON",
  }),
);

const { Records } = await kinesis.getRecords(
  new GetRecordsCommand({ ShardIterator }),
);

// {"id":"order-1"}
console.log(new TextDecoder().decode(Records[0]?.Data));
```

A record keeps the bytes it was given. Whatever the producer encoded is what the consumer decodes.

## Shards and partition keys

A stream is created with the shard count it asks for, and each shard owns a slice of a 128 bit hash
key space. A record goes to the shard whose slice covers the MD5 hash of its partition key, which is
the placement real Kinesis makes. Two records sharing a partition key therefore land on one shard,
in the order they were put, and that per-key ordering is what most Kinesis consumers depend on.

Records under different partition keys can land anywhere. A consumer that has to see every record
reads every shard.

```typescript sim-kinesis-shards
/**
 * Reading which shard a record landed on, and which slice each shard owns.
 */

import {
  CreateStreamCommand,
  DescribeStreamCommand,
  PutRecordCommand,
} from "@aws-sdk/client-kinesis";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const kinesis = simAws.kinesis();

await kinesis.createStream(
  new CreateStreamCommand({ StreamName: "orders", ShardCount: 2 }),
);

const first = await kinesis.putRecord(
  new PutRecordCommand({
    StreamName: "orders",
    PartitionKey: "customer-1",
    Data: new TextEncoder().encode("order-1"),
  }),
);

const second = await kinesis.putRecord(
  new PutRecordCommand({
    StreamName: "orders",
    PartitionKey: "customer-1",
    Data: new TextEncoder().encode("order-2"),
  }),
);

// true: one partition key means one shard.
console.log(first.ShardId === second.ShardId);

const { StreamDescription } = await kinesis.describeStream(
  new DescribeStreamCommand({ StreamName: "orders" }),
);

// shardId-000000000000 0
console.log(
  StreamDescription.Shards[0]?.ShardId,
  StreamDescription.Shards[0]?.HashKeyRange.StartingHashKey,
);
```

An `ExplicitHashKey` on a record overrides the partition key for placement, and the record still
carries the partition key the producer gave it. That is how a producer pins a record to a shard it
picked.

A stream created with `StreamModeDetails` of `ON_DEMAND` gets four shards, which is what real
Kinesis starts an on-demand stream with. Nothing here grows or shrinks that count.

## Where a read starts

Every shard iterator type resolves to a place on the shard.

| `ShardIteratorType`     | Starts at                                                     |
| ----------------------- | ------------------------------------------------------------- |
| `TRIM_HORIZON`          | The oldest record the shard still holds.                      |
| `LATEST`                | After the newest record at the moment the iterator was taken. |
| `AT_SEQUENCE_NUMBER`    | The record with that sequence number.                         |
| `AFTER_SEQUENCE_NUMBER` | The record following that sequence number.                    |
| `AT_TIMESTAMP`          | The first record that arrived at or after the instant given.  |

`GetRecords` hands back a `NextShardIterator` pointing at where the read finished, which is what a
polling consumer passes to its next call. A read that has caught up comes back empty with an
iterator standing where it was.

`MillisBehindLatest` reports how far behind the tip the reader is. Zero means caught up. Otherwise
it is the age of the last record handed back, measured against simulated time.

## Retention

A stream keeps a record for 24 hours. Records older than that are gone from a read, and trimming is
applied at the instant of the read rather than on a timer, so moving simulated time forward is all a
test needs.

`IncreaseStreamRetentionPeriod` and `DecreaseStreamRetentionPeriod` move it, up to the 8760 hours
Kinesis keeps at most. Each refuses a request that goes the other way, including one asking for what
the stream already keeps, which is what real Kinesis does with a caller that has the wrong idea of
what the stream is set to. Shortening the window drops whatever it has already outlived from the
next read.

```typescript sim-kinesis-retention
/**
 * Ageing a record out of a stream's retention window.
 */

import {
  CreateStreamCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  PutRecordCommand,
} from "@aws-sdk/client-kinesis";

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-08-22T09:00:00.000Z")),
});
const kinesis = simAws.kinesis();

await kinesis.createStream(new CreateStreamCommand({ StreamName: "orders" }));

await kinesis.putRecord(
  new PutRecordCommand({
    StreamName: "orders",
    PartitionKey: "customer-1",
    Data: new TextEncoder().encode("order-1"),
  }),
);

await simAws.clock().advanceBy({ hours: 25 });

const { ShardIterator } = await kinesis.getShardIterator(
  new GetShardIteratorCommand({
    StreamName: "orders",
    ShardId: "shardId-000000000000",
    ShardIteratorType: "TRIM_HORIZON",
  }),
);

const { Records } = await kinesis.getRecords(
  new GetRecordsCommand({ ShardIterator }),
);

// 0: the record aged out of the 24 hour window.
console.log(Records.length);
```

## Triggering a Lambda function

A [Lambda event source mapping](../lambda/#triggering-a-function-from-a-kinesis-stream "Simulated Lambda Kinesis event source docs")
polls a stream and invokes a function with the records it reads. Every shard is read by a processor
of its own, as real Lambda reads one, and the function's execution role is what the polling is done
as.

## Feeding a Firehose delivery stream

A [Firehose delivery stream](../firehose/#reading-from-a-kinesis-stream "Simulated Firehose Kinesis source docs")
can read a stream and buffer what it reads into an S3 Bucket. It reads every shard as its source
`RoleARN`, starting at the end of the stream when the delivery stream is created.

## Deploying a stream

`AWS::Kinesis::Stream` creates a simulated stream, which is what a CDK `Stream` synthesizes. The
stream goes through the ordinary `CreateStream` command, so a stream a template deployed is the same
thing an SDK caller would have got, and a template asking for something Kinesis will not take is
refused in the words `CreateStream` refuses it in.

`Ref` gives the stream name and `Fn::GetAtt` on `Arn` gives the stream ARN, which is the way round
real CloudFormation publishes them. Every Kinesis API and every grant names the ARN, so a template
wiring a stream into a Lambda event source mapping or an IAM policy reads the attribute.

```typescript sim-kinesis-cloudformation
/**
 * Deploying a Kinesis stream and putting a record onto it.
 */

import { PutRecordCommand } from "@aws-sdk/client-kinesis";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrdersStream: {
        Type: "AWS::Kinesis::Stream",
        Properties: {
          Name: "orders",
          ShardCount: 2,
          RetentionPeriodHours: 168,
        },
      },
    },
    Outputs: {
      StreamArn: { Value: { "Fn::GetAtt": ["OrdersStream", "Arn"] } },
    },
  },
});

await stack.waitForDeployComplete();

// arn:aws:kinesis:us-east-1:<account>:stream/orders
console.log(stack.outputs.get("StreamArn")?.value);

await simAws.kinesis().putRecord(
  new PutRecordCommand({
    StreamName: "orders",
    PartitionKey: "customer-1",
    Data: new TextEncoder().encode("order-1"),
  }),
);
```

`Name`, `ShardCount`, `RetentionPeriodHours`, `StreamModeDetails` and `Tags` are read. A stream the
template does not name is named after the stack and the logical ID, as real CloudFormation names
one.

`RetentionPeriodHours` is applied after the stream is created, because `CreateStream` takes no
retention on real Kinesis either. It only ever goes up: a new stream keeps records for 24 hours,
which is also the least Kinesis accepts, so a template can ask for more or for the same and never
for less.

`StreamEncryption` and `DesiredShardLevelMetrics` are recorded against the resource as unsimulated
and the stream is created anyway, so a template that encrypts its streams still deploys and the
omission is somewhere a test can find it. Deleting the stack deletes the stream.

`AWS::Kinesis::StreamConsumer` and `AWS::Kinesis::ResourcePolicy` are reported as unsupported and
skipped. One registers an enhanced fan-out consumer and the other admits a caller from another
account, and neither has anything to act on here.

## Permissions

Every operation goes through simulated IAM. The action is the `kinesis:` name of the operation, and
the resource is the stream ARN, `arn:aws:kinesis:<region>:<account>:stream/<name>`. `ListStreams`
names no stream and authorizes against `*`.

`GetRecords` authorizes against the stream the iterator was made on, which the iterator carries. A
caller cannot reach a stream it lacks permission for by holding someone else's iterator.

```typescript sim-kinesis-permissions
/**
 * Refusing a producer that has no permission on the stream.
 */

import { PutRecordCommand } from "@aws-sdk/client-kinesis";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// A Role allowed to read the stream and nothing else.
const { Role } = await simAws.iam().createRole({
  input: {
    RoleName: "OrderReader",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
          Action: "sts:AssumeRole",
        },
      ],
    }),
  },
});

await simAws.iam().putRolePolicy({
  input: {
    RoleName: "OrderReader",
    PolicyName: "ReadOrders",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        { Effect: "Allow", Action: "kinesis:GetRecords", Resource: "*" },
      ],
    }),
  },
});

await simAws.kinesis().createStream({ input: { StreamName: "orders" } });

try {
  await simAws.kinesis().putRecord(
    new PutRecordCommand({
      StreamName: "orders",
      PartitionKey: "customer-1",
      Data: new TextEncoder().encode("order-1"),
    }),
    { caller: { kind: "arn", arn: Role.Arn } },
  );
} catch (error) {
  // User: arn:aws:iam::...:role/OrderReader is not authorized to perform:
  // kinesis:PutRecord on resource: arn:aws:kinesis:...:stream/orders
  console.log((error as Error).message);
}
```

## SDK interception

A `KinesisClient` handed to `SimSdk` reaches the simulated service, so application code that builds
its own client needs no change.

```typescript sim-kinesis-sdk-interception
/**
 * Running unchanged Kinesis application code against the simulator.
 */

import {
  CreateStreamCommand,
  KinesisClient,
  PutRecordCommand,
} from "@aws-sdk/client-kinesis";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();
simSdk.intercept(KinesisClient);

// Ordinary application code, with nothing about it that knows it is simulated.
const kinesis = new KinesisClient({ region: "eu-west-2" });

await kinesis.send(
  new CreateStreamCommand({ StreamName: "orders", ShardCount: 1 }),
);

const put = await kinesis.send(
  new PutRecordCommand({
    StreamName: "orders",
    PartitionKey: "customer-1",
    Data: new TextEncoder().encode("order-1"),
  }),
);

// shardId-000000000000
console.log(put.ShardId);
```

## Supported commands

| Command                         | Notes                                                                  |
| ------------------------------- | ---------------------------------------------------------------------- |
| `CreateStream`                  | A name already in use raises `ResourceInUseException`.                 |
| `DeleteStream`                  | The name is free again at once. `EnforceConsumerDeletion` is accepted. |
| `ListStreams`                   | Sorted by name, paged with `Limit` and `NextToken`.                    |
| `DescribeStream`                | Shards paged with `Limit` and `ExclusiveStartShardId`.                 |
| `DescribeStreamSummary`         | Reports the open shard count instead of the shards.                    |
| `IncreaseStreamRetentionPeriod` | Refused unless it asks for more than the stream keeps now.             |
| `DecreaseStreamRetentionPeriod` | Refused unless it asks for less than the stream keeps now.             |
| `PutRecord`                     | `SequenceNumberForOrdering` is accepted and already guaranteed.        |
| `PutRecords`                    | Up to 500 records and 5 MB. `FailedRecordCount` is always zero.        |
| `GetShardIterator`              | Every iterator type resolves.                                          |
| `GetRecords`                    | `Limit` up to 10,000. Reports `MillisBehindLatest`.                    |

Every operation takes `StreamName` or `StreamARN`, and reads the ARN when a request carries both.

Anything else refuses on send with `SimSdkUnsupportedCommandError`.

## Divergences and limitations

- **A stream is `ACTIVE` as soon as it exists.** Real Kinesis reports `CREATING` while it brings the
  shards up, and a status a test has to poll through earns nothing when there are no shards to bring
  up. `DELETING` and `UPDATING` are absent for the same reason.
- **Nothing reshards.** `UpdateShardCount`, `SplitShard` and `MergeShards` move the shard map
  underneath consumers holding iterators, and they are left out. A shard is opened when the stream
  is created and never closes, so no shard reports an ending sequence number and no read reports a
  child shard.
- **Enhanced fan-out is absent.** `RegisterStreamConsumer`, `DeregisterStreamConsumer`,
  `ListStreamConsumers`, `DescribeStreamConsumer` and `SubscribeToShard` need an HTTP/2 event stream
  that nothing here delivers. Every consumer reads through `GetRecords`.
- **A shard iterator never expires.** Real Kinesis expires one after five minutes. An iterator this
  simulation never issued is still refused, with the `ExpiredIteratorException` real Kinesis uses.
- **Throughput is unlimited.** Real Kinesis takes 1 MB or 1,000 records a second per shard for
  writes and 2 MB a second for reads, and refuses past that with
  `ProvisionedThroughputExceededException`. Nothing here counts. That is why `FailedRecordCount` on
  `PutRecords` is always zero: the reasons real Kinesis fails one record of a batch are throughput
  limits and internal faults, and neither is simulated. The per-record result shape is still what a
  consumer of the response reads.
- **Sequence numbers are 56 digit counters.** They are unique within a stream and increase within a
  shard, as real Kinesis promises. They also increase across shards here, which real Kinesis does
  not promise, so a consumer ordering two records from different shards would be relying on
  something AWS does not offer.
- **Server-side encryption is absent.** `StartStreamEncryption` and `StopStreamEncryption` are left
  out, and no response carries an `EncryptionType`.
- **Tags are kept and never listed.** A stream created with `Tags` holds them, readable through
  `findStream`. `AddTagsToStream`, `ListTagsForStream` and `RemoveTagsFromStream` are absent.
- **Kinesis Data Firehose is a separate service.** It has a simulation of its own under
  `simAws.firehose()`, and a delivery stream there can read a stream here. Kinesis Video Streams is
  absent.
- **`AWS::DynamoDB::Table` `KinesisStreamSpecification` stays unsimulated.** A table does not publish
  its changes into a stream here.
