# Simulated Kinesis Data Firehose implementation

This directory holds the simulated Kinesis Data Firehose service. S3 is the only destination.

A delivery stream is a source, a destination and a buffer. Records arrive from where the source says
they do, wait until the buffer passes one of its two bounds, and leave as one S3 Object. A
`DirectPut` delivery stream takes them from `PutRecord`. A `KinesisStreamAsSource` one reads them off
a simulated Kinesis stream.

## Entry points

- `sim-firehose.ts` is the in-memory service object for one Account and Region scope.
- `index.ts` exports the public API for `@kensio/yulin/firehose`.

A `SimFirehose` owns a `SimFirehoseDeliveryStreamStore` holding its delivery streams, and two
`SimFirehoseFailures` lists holding the buffers it could not write and the source streams it stopped
reading. The simulator is scoped to an Account and Region because real delivery streams are. A
delivery stream ARN names the Region, and a delivery stream name is unique within one Account and
Region.

This one is built with collaborators, unlike most of the self-contained services. It takes the
simulated S3 of its own scope as a `SimFirehoseObjectDestination`, and the simulated Kinesis of that
scope as a `SimFirehoseRecordSource`. Each interface names the operations one half of the delivery
stream needs, and `SimS3` and `SimKinesis` implement them structurally. A `SimFirehose` built with no
Kinesis falls back to `SimFirehoseNoRecordSource`, which refuses every read and says how to reach a
stream.

Both failure lists are the same `SimFirehoseFailures` under `failure/`, holding a
`SimFirehoseDeliveryFailure` or a `SimFirehoseSourceFailure`. A refusal is recorded quietly and
anything else is warned about once, which is the line `SimS3NotificationFailures` draws for the same
reason. Taking `s3:PutObject` or `kinesis:GetRecords` off a Role is what a test checking the refusal
does.

## Delivery stream model

Delivery stream state lives under `stream/`, and what it delivers to under `destination/`.

`SimFirehoseDeliveryStream` is the stored resource. It holds its name, its ARN, its source, its
destination and its buffer.

`SimFirehoseS3Destination` is a parsed `ExtendedS3DestinationConfiguration`. The Bucket is held by
name as well as by ARN, because a `PutObject` names a Bucket. An S3 Bucket ARN carries no Account
and no Region, and the name is all it has to give.

`SimFirehoseBufferingHints` holds the two bounds in the units the buffer and the scheduler work in,
which are bytes and milliseconds. The bounds Firehose allows are checked when a delivery stream is
created. A request asking for a buffer Firehose would refuse is refused here, at the same call.

`simFirehoseDestinationOf` picks the destination a request declared. A destination outside the
simulation is refused by name, with `SimFirehoseUnsimulatedDestination`. A request carrying both
S3 destinations is refused too, since Firehose takes one destination and the two are one
destination declared twice. A delivery stream created
against Redshift or OpenSearch would take records and drop them, and a test asserting on an empty
Bucket would blame the code under test.

## Source

Where a delivery stream's records come from lives under `source/`, and how it reads them under
`source/read/`.

`simFirehoseSourceOf` reads the source a request declared, the way `simFirehoseDestinationOf` reads
the destination. It answers with a `SimFirehoseDirectPutSource` or a `SimFirehoseKinesisSource`, and
the delivery stream reports its `DeliveryStreamType` from whichever it holds. Both answer
`requirePut`, so a put refuses on the one that reads a stream without a handler asking which kind it
has.

A source stream in another Account or Region is refused with `SimFirehoseUnsimulatedSource`. This
Firehose reads the simulated Kinesis of its own scope, and a foreign ARN reaches nothing.

`SimFirehoseSourceReading` holds one `SimFirehoseSourceReader` per delivery stream that reads. The
reader is started before CreateDeliveryStream answers, and it opens every shard at the end of the
stream through `SimFirehoseSourceShards`. The place has to be taken then. A `LATEST` iterator stands
after the newest record on the shard when the iterator was made, so opening the shards at the first
read would step over the record that woke the delivery stream up.

`SimFirehoseSourcePoll` decides when the reader reads. Simulated Kinesis says when a record has been
put, through the same `streamActivity` a Lambda event source mapping watches, and the reader
schedules a read on the clock for the instant the simulation currently reads. Advancing time then
moves records from the stream into the buffer, and the same advance can carry that buffer past its
interval. A read scheduled off the clock would happen after the advance instead, leaving a test to
advance twice for one record.

Compare `src/service/lambda/event-source/poll/kinesis/`, which reads the same streams the same way
for a function. What a mapping does with a batch is most of that code. A batch belongs to one shard,
the function answers for it, and a failure sends the mapping back to a record it named. A delivery
stream answers for nothing. It buffers what every shard gave it and delivers on a bound, so the
checkpoint, the retry backoff and the per-shard poller have no counterpart here.

A read that fails stops the delivery stream reading and goes on `SimFirehoseSourceFailures`. The Role
is refused every time it asks, and going round again would record the same refusal for as long as the
simulation ran.

## Delivery

The delivery path lives under `delivery/`, and it is the part with no counterpart elsewhere in the
simulation.

`SimFirehoseBuffer` accumulates the records a delivery stream has taken. `take()` empties it into
the bytes one Object holds, concatenated with no separator between them. That is what real Firehose
writes. Taking and emptying happen together so that a record put while a delivery is under way joins
the next buffer.

`SimFirehoseDelivery` decides when a buffer is written. The size bound is checked as each record
arrives. The interval bound is a task on `background.scheduleAt`, so advancing simulated time past
the interval is what dispatches it. The task is scheduled when a record lands on an empty buffer.
The interval then runs from the first record of a buffer, as real Firehose measures it. A buffer
that fills first cancels that task and delivers on the background scheduler, since real Firehose
answers the producer before it writes anything.

Two size deliveries can be scheduled before either runs. `SimFirehoseObjectWriter` checks for an
empty buffer because of that, since the second finds what the first already took.

`SimFirehoseObjectWriter` makes the `PutObject`, as the delivery stream's `RoleARN`. Simulated IAM
then applies to the write exactly as `s3:PutObject` authorization applies on real AWS, and the
caller who put the record needs no S3 permission at all. A write that failed is recorded on
`SimFirehoseDeliveryFailures` and swallowed. Real Firehose answered the `PutRecord` minutes earlier,
and there is no caller left to raise at.

`simFirehoseObjectKey` builds the key, from the prefix, the UTC date path, the delivery stream name,
its version, the delivery instant and a random string. The instant comes from the scheduler's clock.
A test that sets the clock therefore knows the prefix its Objects are under.

## Commands

Command handlers live under `command/`, grouped by what they act on: `stream/` creates, lists,
describes and deletes, and `record/` puts.

`SimFirehosePutCommands` asks the delivery stream's source to take the put before it takes it. Real
Firehose refuses `PutRecord` and `PutRecordBatch` on a delivery stream with a Kinesis source, since
the records it delivers are the ones on its stream.

`SimFirehoseDeliveryStreamAccess` is how every operation but `ListDeliveryStreams` and
`CreateDeliveryStream` reaches its delivery stream. It authorizes the action against the delivery
stream's ARN and then looks the delivery stream up, in that order, because that is the order real
IAM works in. A caller with no permission is refused for a delivery stream that was never created,
and hears the same refusal either way.

`CreateDeliveryStream` asks a second question through the shared `SimIamPassRoleAuthorizer`, whether
the caller may hand Firehose the destination `RoleARN` and, for a Kinesis-sourced delivery stream,
the source `RoleARN`. Both are read before the question is asked, so a configuration this simulation
cannot deliver to is refused on its own terms rather than on a Role.

Every Firehose operation names its delivery stream by name, and nothing here reads an ARN back.
Compare `simKinesisRefLookupName`. It exists because a Kinesis request can name its stream either
way.

## CloudFormation

`cfn/` creates a delivery stream from an `AWS::KinesisFirehose::DeliveryStream` Resource, and
deletes it when the Stack comes down. `SimFirehoseCfnResourceFactory` dispatches on the Resource
type name, and `SimCfnFirehoseDeliveryStreamCreator` goes through `CreateDeliveryStream` itself. A
delivery stream a template deployed is therefore the same thing an SDK caller would have got.

`SimCfnFirehoseDeliveryStreamProperties` reads the shape of the template and nothing else. Whether
a name, a Bucket ARN or a set of buffering hints is allowed is decided by simulated Firehose, at the
command that reads it.

The CloudFormation layer reads the destinations a template declared and hands them all over
without choosing between them. Which destinations a delivery stream may have is decided by
`simFirehoseDestinationOf`, so the template door and the SDK door answer the same request the same
way.

`simCfnFirehoseSource` classifies the source before the command sees it. A `*SourceConfiguration`
property other than the Kinesis one and the DirectPut throughput hint skips the Resource.
`DeliveryStreamType` is no help there, since a template that leaves it out gets `DirectPut` by
default and the source property is what says where the records come from.

`simCfnFirehoseResourceCreation` decides what a refusal does to the Stack.
`SimFirehoseUnsimulatedDestination` and `SimFirehoseUnsimulatedSource` become an
`Unsupported sim Firehose CloudFormation Resource` error, which sim CloudFormation records as a skip
and steps over. Every other `SimFirehoseError` fails the Resource, naming it, because a delivery
stream the template got wrong is a template to fix.

The `Ref` and `Fn::GetAtt` values live under
`src/service/cloudformation/resource/cfn/firehose/`, as every service's do.

`sim-cfn-firehose-delivery-stream-template.factory.ts` builds the Bucket, the delivery Role and the
delivery stream a test deploys. Its default is what CDK synthesizes for a `DeliveryStream` with an
`S3Bucket` destination.

## What is left out

`sdk/sim-firehose-sdk-command-router.ts` names the six commands this service handles. Anything else
an intercepted client sends is refused with `SimSdkUnsupportedCommandError`, which covers
`UpdateDestination`, encryption and the tag operations.

Enhanced fan-out is left out on the source side. A delivery stream reads through `GetRecords`, which
is the shared throughput path every stream has, and simulated Kinesis has nothing else. Resharding is
left out with it.

`docs/services/firehose/README.md` is the user-facing page, and its **Divergences and limitations**
section is the full list.
