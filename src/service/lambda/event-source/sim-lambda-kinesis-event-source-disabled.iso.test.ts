import { PutRecordCommand } from "@aws-sdk/client-kinesis";
import {
  CreateEventSourceMappingCommand,
  DeleteFunctionCommand,
} from "@aws-sdk/client-lambda";
import { assertArrayEmpty, assertArrayLength } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  makeKinesisPollingRole,
  simAwsWithKinesisEventSource,
} from "../../../../test/lambda/kinesis-event-source-fixture.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simKinesisStreamFactory } from "../../kinesis/stream/sim-kinesis-stream.factory.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";
import type { SimLambdaKinesisStreamEvent } from "./poll/kinesis/sim-lambda-kinesis-stream-event.types.js";

describe("a sim Lambda Kinesis mapping with nothing to deliver to", () => {
  it("delivers nothing while the mapping is disabled", async () => {
    // Given a stream, a role that may read it, and a function.
    const simAws = new SimAws();
    const stream = await simKinesisStreamFactory.make({}, simAws);
    const roleArn = await makeKinesisPollingRole(simAws, stream.arn);
    const events: SimLambdaKinesisStreamEvent[] = [];

    await simAws.lambda().createFunction({
      input: {
        FunctionName: "order-projector",
        Role: roleArn,
        Code: {
          ZipFile: makeLambdaZipFileInput(
            (event: SimLambdaKinesisStreamEvent): undefined => {
              events.push(event);

              return undefined;
            },
          ),
        },
      },
    });

    // When a mapping is created disabled, and a record is put.
    await simAws.lambda().createEventSourceMapping(
      new CreateEventSourceMappingCommand({
        EventSourceArn: stream.arn,
        FunctionName: "order-projector",
        StartingPosition: "TRIM_HORIZON",
        Enabled: false,
      }),
    );
    await simAws.kinesis().putRecord(
      new PutRecordCommand({
        StreamName: "orders",
        PartitionKey: "customer-1",
        Data: new TextEncoder().encode("order-1"),
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then nothing was delivered, since a disabled mapping does not poll.
    assertArrayEmpty(events);
  });

  it("delivers nothing once the function it maps to has gone", async () => {
    // Given a mapping that has delivered a record.
    const { simAws, events } = await simAwsWithKinesisEventSource();
    await simAws.kinesis().putRecord(
      new PutRecordCommand({
        StreamName: "orders",
        PartitionKey: "customer-1",
        Data: new TextEncoder().encode("order-1"),
      }),
    );
    await simAws.backgroundTasksComplete();
    assertArrayLength(events, 1);

    // When the function is deleted and another record is put.
    await simAws
      .lambda()
      .deleteFunction(
        new DeleteFunctionCommand({ FunctionName: "order-projector" }),
      );
    await simAws.kinesis().putRecord(
      new PutRecordCommand({
        StreamName: "orders",
        PartitionKey: "customer-2",
        Data: new TextEncoder().encode("order-2"),
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the poll found nothing to deliver to and did nothing, rather than
    // raising at whoever was waiting for the simulation to settle.
    assertArrayLength(events, 1);
  });
});
