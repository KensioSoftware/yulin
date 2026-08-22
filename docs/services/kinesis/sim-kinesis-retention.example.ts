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
