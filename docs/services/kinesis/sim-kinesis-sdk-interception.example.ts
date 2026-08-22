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
