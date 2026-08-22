# Simulated Kinesis Data Streams implementation

This directory holds the simulated Kinesis Data Streams service. Shared throughput only, with no
enhanced fan-out and no resharding.

A stream is a shard map and the records on it. Records go on through `PutRecord` and come off
through the iterator walk every Kinesis consumer makes, which is `DescribeStream`,
`GetShardIterator`, then `GetRecords` repeatedly.

## Entry points

- `sim-kinesis.ts` is the in-memory service object for one Account and Region scope.
- `index.ts` exports the public API for `@kensio/yulin/kinesis`.

A `SimKinesis` owns a `SimKinesisStreamStore` holding its streams. The simulator is scoped to an
Account and Region because real streams are. A stream ARN names the Region, and a stream name is
unique within one Account and Region rather than globally.

## Stream model

Stream state lives under `stream/`.

`SimKinesisStream` is the stored resource. It holds its name, its ARN, its mode, its shard map and
one counter handing out sequence numbers.

`SimKinesisShardMap` divides the 128 bit hash key space between the shards, in equal adjacent slices
covering the whole of it. `simKinesisPartitionKeyHash` is the MD5 hash real Kinesis places a record
by, read as a big-endian unsigned integer. Using anything else would put a record on a different
shard from the one AWS would have put it on, so the hash is a placement function rather than a
security one and MD5 being broken is beside the point.

`SimKinesisShard` holds the records whose hash keys fall in its slice. Nothing splits or merges one,
so a record's shard is decided by its hash key alone and stays decidable for the life of the stream.
That is also why no shard ever reports an ending sequence number.

`SimKinesisSequenceNumbers` is one counter per stream rather than one per shard. Real Kinesis
promises a sequence number is unique within a stream and increases within a shard, and a single
counter gives both.

`SimKinesisStreamPosition` is where a reader stands, in the four kinds the five iterator types come
down to. `LATEST` has no kind of its own: it is resolved where the iterator is made, which is what
pins it to that instant.

`simKinesisShardIteratorToken` writes a position into an opaque base64url token and
`readSimKinesisShardIteratorToken` reads one back. The place travels inside the token rather than in
a table of handed-out iterators, which is what lets an iterator be used without the stream having to
remember it, and why the five minute expiry is absent here rather than approximated.

Retention is applied when a stream is read rather than on a timer. Whatever a read finds is what the
window holds at the instant of that read, so nothing has to have run in between for that to be true.
Compare `simDynamoDbStreamTrimPoint`, which is the same shape for the same reason. Unlike DynamoDB
Streams, a position the window has outlived is not refused: real Kinesis moves the reader on to the
trim horizon and reports how far behind it is.

## Commands

Command handlers live under `command/`, grouped by what they act on: `stream/` creates, lists,
describes and deletes, `record/` puts, and `read/` hands out iterators and reads through them.

`SimKinesisStreamAccess` is how every operation but `ListStreams` and `CreateStream` reaches its
stream. It authorizes the action against the stream's ARN and then looks the stream up, in that
order, because that is the order real IAM works in: a caller with no permission is refused for a
stream that does not exist rather than told the stream is missing.

`simKinesisRefLookupName` decides which stream a request meant. An ARN naming another Account or
Region becomes its own lookup key, so nothing is found. Reading its name out and looking that up
locally would let a test pass while the real call crossed a boundary it has no permission for.

`GetRecords` names no stream. It authorizes against the stream its iterator carries, so a caller
cannot reach a stream it lacks permission for by holding an iterator someone else made.

## What is left out

`sdk/sim-kinesis-sdk-command-router.ts` names the nine commands this service handles. Anything else
an intercepted client sends is refused with `SimSdkUnsupportedCommandError`, which covers enhanced
fan-out, resharding, encryption and the tag operations.

A Lambda event source mapping reads a stream through those same commands, as the function's
execution role. The adapter is `SimKinesisEventSourceStreams` under
`src/service/lambda/event-source/stream/kinesis/`, and `streamActivity()` is what tells a poller
there is something to read.

`docs/services/kinesis/README.md` is the user-facing page, and its **Divergences and limitations**
section is the full list.
