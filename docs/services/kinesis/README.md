# Simulated Kinesis Data Streams

Yulin simulates Kinesis streams, shards, records and shard iterators in memory. Use
`simAws.kinesis()` directly or intercept a `KinesisClient`.

Kinesis specific types are imported from the `@kensio/yulin/kinesis` subpath.

## Putting a record and reading it back

Create a stream, put a record, then read it through a shard iterator. This is the same sequence used
by an AWS SDK consumer.

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

Kinesis stores the bytes supplied by the producer. The consumer is responsible for decoding them.

## Shards and partition keys

A stream divides the 128-bit hash key space evenly across its shards. Kinesis uses the MD5 hash of
the partition key to select a shard. Records with the same partition key reach the same shard in
write order.

Different partition keys may select different shards. Read every shard to consume the whole stream.

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

`ExplicitHashKey` overrides the hash used for placement. The stored record still contains the
original partition key.

An `ON_DEMAND` stream starts with four shards. Its shard count remains fixed.

## Where a read starts

Every shard iterator type resolves to a place on the shard.

| `ShardIteratorType`     | Starts at                                                     |
| ----------------------- | ------------------------------------------------------------- |
| `TRIM_HORIZON`          | The oldest record the shard still holds.                      |
| `LATEST`                | After the newest record at the moment the iterator was taken. |
| `AT_SEQUENCE_NUMBER`    | The record with that sequence number.                         |
| `AFTER_SEQUENCE_NUMBER` | The record following that sequence number.                    |
| `AT_TIMESTAMP`          | The first record that arrived at or after the instant given.  |

Pass `NextShardIterator` to the next `GetRecords` call. A reader at the end of the shard receives an
empty record list and another iterator at the same position.

`MillisBehindLatest` is zero for a reader at the end of the shard. Otherwise it reports the age of
the last returned record, measured against simulated time.

## Retention

A stream retains records for 24 hours by default. Retention is applied when records are read. Move
simulated time forward to test expiration.

Use `IncreaseStreamRetentionPeriod` or `DecreaseStreamRetentionPeriod` to change the period. Values
must stay between 24 and 8,760 hours. Each command rejects a value pointing in the wrong direction.
Shortening the period affects the next read.

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

A [Lambda event source mapping](https://yulinsim.dev/services/lambda/#triggering-a-function-from-a-kinesis-stream "Simulated Lambda Kinesis event source docs")
polls each shard and invokes the function with batches of records. Reads use the function's
execution role.

## Feeding a Firehose delivery stream

A [Firehose delivery stream](https://yulinsim.dev/services/firehose/#reading-from-a-kinesis-stream "Simulated Firehose Kinesis source docs")
can read every shard and buffer the records into S3. It starts at the end of the stream and reads as
its source `RoleARN`.

## Deploying a stream

Simulated CloudFormation deploys `AWS::Kinesis::Stream` through `CreateStream`. A CDK `Stream`
synthesizes this resource type.

`Ref` returns the stream name. `Fn::GetAtt Arn` returns its ARN.

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

Yulin reads `Name`, `ShardCount`, `RetentionPeriodHours`, `StreamModeDetails` and `Tags`. It generates
a name when `Name` is absent. See [generated resource names](https://yulinsim.dev/services/cloudformation/#names-cloudformation-generates "Names CloudFormation generates").

`RetentionPeriodHours` is applied after creation. A new stream already has the minimum 24-hour
period, so a template may keep it or increase it.

`StreamEncryption` and `DesiredShardLevelMetrics` are recorded as ignored properties. The stream is
still created. Deleting the stack deletes it.

`AWS::Kinesis::StreamConsumer` and `AWS::Kinesis::ResourcePolicy` are skipped. Enhanced fan-out and
resource policies are absent.

## Permissions

Every operation uses simulated IAM. Stream operations authorize the corresponding `kinesis:` action
against the stream ARN. `ListStreams` authorizes against `*`.

`GetRecords` authorizes against the stream stored in the iterator.

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

Intercept a `KinesisClient` when application code creates and uses the client itself.

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

Any other command raises `SimSdkUnsupportedCommandError`.

## Divergences and limitations

- Streams become `ACTIVE` immediately. `CREATING`, `DELETING` and `UPDATING` states are absent.
- Resharding is absent. `UpdateShardCount`, `SplitShard` and `MergeShards` are unsupported. Shards
  have no ending sequence number or child shards.
- Enhanced fan-out is absent. Consumers read through `GetRecords`.
- **A shard iterator never expires.** Real Kinesis expires one after five minutes. An iterator this
  simulation never issued is still refused, with the `ExpiredIteratorException` real Kinesis uses.
- Throughput is unlimited. Yulin never raises `ProvisionedThroughputExceededException`, and
  `PutRecords` reports zero failed records.
- **Sequence numbers are 56 digit counters.** They are unique within a stream and increase within a
  shard, as real Kinesis promises. Yulin also increments them across shards. AWS promises ordering
  within a shard only.
- Server-side encryption is absent. Responses contain no `EncryptionType`.
- Stream tags are stored and available through `findStream`. Tagging commands are unsupported.
- Kinesis Video Streams is absent.
- The DynamoDB `KinesisStreamSpecification` integration is absent.
