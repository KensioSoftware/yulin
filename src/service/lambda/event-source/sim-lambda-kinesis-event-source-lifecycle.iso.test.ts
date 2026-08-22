import { PutRecordCommand } from "@aws-sdk/client-kinesis";
import { DeleteEventSourceMappingCommand } from "@aws-sdk/client-lambda";
import { assertArrayLength } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithKinesisEventSource } from "../../../../test/lambda/kinesis-event-source-fixture.js";
import type { SimAws } from "../../aws/sim-aws.js";

/**
 * Put one order onto the stream and let the simulation settle.
 */
async function putOrder(simAws: SimAws, id: string): Promise<void> {
  await simAws.kinesis().putRecord(
    new PutRecordCommand({
      StreamName: "orders",
      PartitionKey: id,
      Data: new TextEncoder().encode(id),
    }),
  );
  await simAws.backgroundTasksComplete();
}

describe("the life of a sim Lambda Kinesis stream event source mapping", () => {
  it("stops delivering once the mapping is deleted", async () => {
    // Given a mapping that has delivered a record.
    const { simAws, uuid, events } = await simAwsWithKinesisEventSource();
    await putOrder(simAws, "order-1");
    assertArrayLength(events, 1);

    // When the mapping is deleted and another record is put.
    await simAws
      .lambda()
      .deleteEventSourceMapping(
        new DeleteEventSourceMappingCommand({ UUID: uuid }),
      );
    await putOrder(simAws, "order-2");

    // Then nothing more reached the function.
    assertArrayLength(events, 1);
  });

  it("delivers nothing while a handler keeps throwing, then carries on", async () => {
    // Given a mapping whose handler always throws.
    const { simAws, events } = await simAwsWithKinesisEventSource({
      handlerResult: (): unknown => {
        throw new Error("the projector is broken");
      },
    });

    // When a record is put and the mapping is given every attempt it gets.
    await putOrder(simAws, "order-1");

    for (const seconds of [1, 2, 4, 8, 16]) {
      // oxlint-disable-next-line no-await-in-loop
      await simAws.clock().advanceBy({ seconds });
    }

    // Then the batch was handed over once and then retried the five times the
    // mapping allows, and the mapping gave up on it rather than blocking the
    // shard forever.
    assertArrayLength(events, 6);

    // And a record put afterwards is delivered, since the shard moved past the
    // batch it discarded.
    await putOrder(simAws, "order-2");
    assertArrayLength(events, 7);
  });

  it("delivers nothing from a mapping deleted before it ever polled", async () => {
    // Given a mapping that has delivered nothing yet.
    const { simAws, uuid, events } = await simAwsWithKinesisEventSource();

    // When it is deleted before the simulation has settled, and a record is
    // put afterwards.
    await simAws
      .lambda()
      .deleteEventSourceMapping(
        new DeleteEventSourceMappingCommand({ UUID: uuid }),
      );
    await putOrder(simAws, "order-1");

    // Then nothing reached the function.
    assertArrayLength(events, 0);
  });
});
