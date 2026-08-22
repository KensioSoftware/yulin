import { PutRecordCommand } from "@aws-sdk/client-kinesis";
import { assertStringIncludes, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithKinesisEventSource } from "../../../../test/lambda/kinesis-event-source-fixture.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simKinesisStreamFactory } from "../../kinesis/stream/sim-kinesis-stream.factory.js";
import type { SimLambdaKinesisStreamEvent } from "./poll/kinesis/sim-lambda-kinesis-stream-event.types.js";

/**
 * A record carrying how many records the batch before it held.
 */
function totalRecord(
  streamName: string,
  event: SimLambdaKinesisStreamEvent,
): PutRecordCommand {
  return new PutRecordCommand({
    StreamName: streamName,
    PartitionKey: "totals",
    Data: new TextEncoder().encode(`total-${String(event.Records.length)}`),
  });
}

describe("sim Lambda Kinesis stream event source write cascades", () => {
  it("refuses a function that puts records back onto its own source stream", async () => {
    // Given a function whose handler puts an aggregate onto the stream that
    // invoked it, which is a loop rather than a projection.
    const simAws = new SimAws();
    await simAwsWithKinesisEventSource({
      simAws,
      handlerResult: (event: SimLambdaKinesisStreamEvent): Promise<unknown> =>
        simAws.kinesis().putRecord(totalRecord("orders", event)),
    });

    // When a record is put onto the stream.
    await simAws.kinesis().putRecord(
      new PutRecordCommand({
        StreamName: "orders",
        PartitionKey: "customer-1",
        Data: new TextEncoder().encode("order-1"),
      }),
    );

    // Then the simulation refuses rather than going round forever, naming the
    // function and the stream.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.backgroundTasksComplete();
    });

    assertStringIncludes(error.message, "order-projector");
    assertStringIncludes(error.message, "the stream orders");
    assertStringIncludes(error.message, "that same stream");
    assertStringIncludes(error.message, "Put the result onto a different");
  });

  it("allows a function that puts records onto a second stream", async () => {
    // Given a function whose handler puts its projection somewhere else.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({ streamName: "order-totals" }, simAws);
    await simAwsWithKinesisEventSource({
      simAws,
      handlerResult: (event: SimLambdaKinesisStreamEvent): Promise<unknown> =>
        simAws.kinesis().putRecord(totalRecord("order-totals", event)),
    });

    // When a record is put onto the source stream.
    await simAws.kinesis().putRecord(
      new PutRecordCommand({
        StreamName: "orders",
        PartitionKey: "customer-1",
        Data: new TextEncoder().encode("order-1"),
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the projection is on the second stream, and nothing refused it.
    const totals = simAws.kinesis().findStream("order-totals");
    const records = (totals?.shards ?? []).flatMap((shard) => [
      ...shard.records,
    ]);

    assertStringIncludes(
      records.map((record) => new TextDecoder().decode(record.data)).join(","),
      "total-1",
    );
  });
});
