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
