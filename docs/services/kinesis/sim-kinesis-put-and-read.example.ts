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
