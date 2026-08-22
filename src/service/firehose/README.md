# Simulated Kinesis Data Firehose implementation

This directory holds the simulated Kinesis Data Firehose service. S3 is the only destination and
`DirectPut` the only source.

A delivery stream is a destination and a buffer. Records go on through `PutRecord`, wait until the
buffer passes one of its two bounds, and leave as one S3 Object.

## Entry points

- `sim-firehose.ts` is the in-memory service object for one Account and Region scope.
- `index.ts` exports the public API for `@kensio/yulin/firehose`.

A `SimFirehose` owns a `SimFirehoseDeliveryStreamStore` holding its delivery streams, and a
`SimFirehoseDeliveryFailures` holding the buffers it could not write. The simulator is scoped to an
Account and Region because real delivery streams are. A delivery stream ARN names the Region, and a
delivery stream name is unique within one Account and Region.

This one is built with a collaborator, unlike most of the self-contained services. It takes the
simulated S3 of its own scope as a `SimFirehoseObjectDestination`. That interface names the one
operation delivery needs, and `SimS3` implements it structurally.

## Delivery stream model

Delivery stream state lives under `stream/`, and what it delivers to under `destination/`.

`SimFirehoseDeliveryStream` is the stored resource. It holds its name, its ARN, its destination and
its buffer.

`SimFirehoseS3Destination` is a parsed `ExtendedS3DestinationConfiguration`. The Bucket is held by
name as well as by ARN, because a `PutObject` names a Bucket. An S3 Bucket ARN carries no Account
and no Region, and the name is all it has to give.

`SimFirehoseBufferingHints` holds the two bounds in the units the buffer and the scheduler work in,
which are bytes and milliseconds. The bounds Firehose allows are checked when a delivery stream is
created. A request asking for a buffer Firehose would refuse is refused here, at the same call.

`simFirehoseDestinationOf` picks the destination a request declared. A destination outside the
simulation is refused by name, with `SimFirehoseUnsimulatedDestination`. A delivery stream created
against Redshift or OpenSearch would take records and drop them, and a test asserting on an empty
Bucket would blame the code under test.

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

`SimFirehoseDeliveryStreamAccess` is how every operation but `ListDeliveryStreams` and
`CreateDeliveryStream` reaches its delivery stream. It authorizes the action against the delivery
stream's ARN and then looks the delivery stream up, in that order, because that is the order real
IAM works in. A caller with no permission is refused for a delivery stream that was never created,
and hears the same refusal either way.

Every Firehose operation names its delivery stream by name, and nothing here reads an ARN back.
Compare `simKinesisRefLookupName`. It exists because a Kinesis request can name its stream either
way.

## What is left out

`sdk/sim-firehose-sdk-command-router.ts` names the six commands this service handles. Anything else
an intercepted client sends is refused with `SimSdkUnsupportedCommandError`, which covers
`UpdateDestination`, encryption and the tag operations.

There is no `cfn/` here. `AWS::KinesisFirehose::DeliveryStream` is skipped on deploy, and issue 933
is where it is added.

`DeliveryStreamType` of `KinesisStreamAsSource` is refused with `SimFirehoseUnsimulatedSource`.
Issue 932 is where a delivery stream reading a simulated Kinesis stream is added. It wants a poller
of its own, because the one under `src/service/lambda/event-source/poll/kinesis/` is bound to a
function and a mapping.

`docs/services/firehose/README.md` is the user-facing page, and its **Divergences and limitations**
section is the full list.
