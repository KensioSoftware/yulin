import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { PutRecordCommand } from "@aws-sdk/client-kinesis";
import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
  InvokeCommand,
} from "@aws-sdk/client-lambda";
import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";

import { makeKinesisPollingRole } from "../../../../test/lambda/kinesis-event-source-fixture.js";
import {
  makeSourceStream,
  makeStreamPollingRole,
  simAwsWithStreamEventSource,
} from "../../../../test/lambda/stream-event-source-fixture.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simKinesisStreamFactory } from "../../kinesis/stream/sim-kinesis-stream.factory.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../function/sim-lambda-handler.type.js";

const startedAt = new Date("2026-08-30T09:00:00.000Z");
const projectorName = "projector";

/** The `Maximum` IteratorAge the function reported over the hour from the start. */
async function iteratorAge(
  simAws: SimAws,
  functionName: string,
): Promise<number | undefined> {
  const statistics = new GetMetricStatisticsCommand({
    Namespace: "AWS/Lambda",
    MetricName: "IteratorAge",
    Dimensions: [{ Name: "FunctionName", Value: functionName }],
    StartTime: startedAt,
    EndTime: new Date(startedAt.getTime() + 3_600_000),
    Period: 3600,
    Statistics: ["Maximum"],
  });
  const { Datapoints } = await simAws
    .cloudWatch()
    .getMetricStatistics(statistics);

  return Datapoints?.at(0)?.Maximum;
}

/** Bind a function the mappings below deliver to. */
async function makeProjector(
  simAws: SimAws,
  roleArn: string,
  handler: SimLambdaHandler = () => "done",
): Promise<void> {
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: projectorName,
      Role: roleArn,
      Code: { ZipFile: makeLambdaZipFileInput(handler) },
    }),
  );
}

/** Map a source onto the projector, reading from the start of the stream. */
async function mapToProjector(
  simAws: SimAws,
  eventSourceArn: string,
): Promise<void> {
  await simAws.lambda().createEventSourceMapping(
    new CreateEventSourceMappingCommand({
      EventSourceArn: eventSourceArn,
      FunctionName: projectorName,
      StartingPosition: "TRIM_HORIZON",
    }),
  );
  await simAws.backgroundTasksComplete();
}

describe("AWS/Lambda IteratorAge a stream event source publishes", () => {
  it("counts nothing spent for a consumer that is caught up", async () => {
    // Given a table's stream mapped to a function, with the clock stopped.
    const { simAws, tableName, functionName } =
      await simAwsWithStreamEventSource();

    await simAws.clock().setTo(startedAt);

    // When an item is written and delivered without time moving.
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-1" } },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the batch finished at the instant its record was written.
    assertIdentical(await iteratorAge(simAws, functionName), 0);
  });

  it("counts how far behind the stream a batch left the function", async () => {
    // Given a record written to a table's stream ten minutes before anything
    // was mapped to read it.
    const simAws = new SimAws();

    await simAws.clock().setTo(startedAt);

    const { tableName, streamArn } = await makeSourceStream(simAws);

    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-1" } },
      }),
    );
    await simAws.backgroundTasksComplete();
    await simAws.clock().advanceBy({ minutes: 10 });

    // When a mapping starts reading from the beginning of the stream.
    await makeProjector(simAws, await makeStreamPollingRole(simAws, streamArn));
    await mapToProjector(simAws, streamArn);

    // Then the age is the ten minutes the record spent waiting, measured on
    // the simulation's clock.
    assertIdentical(await iteratorAge(simAws, projectorName), 600_000);
  });

  it("counts a Kinesis batch the same way", async () => {
    // Given a record put onto a Kinesis stream ten minutes before anything was
    // mapped to read it.
    const simAws = new SimAws();

    await simAws.clock().setTo(startedAt);

    const stream = await simKinesisStreamFactory.make(
      { streamName: "orders" },
      simAws,
    );

    await simAws.kinesis().putRecord(
      new PutRecordCommand({
        StreamName: "orders",
        Data: new TextEncoder().encode("order-1"),
        PartitionKey: "order-1",
      }),
    );
    await simAws.backgroundTasksComplete();
    await simAws.clock().advanceBy({ minutes: 10 });

    // When a mapping starts reading from the beginning of the stream.
    await makeProjector(
      simAws,
      await makeKinesisPollingRole(simAws, stream.arn),
    );
    await mapToProjector(simAws, stream.arn);

    // Then the same ten minutes are reported, because the metric belongs to
    // the mapping rather than to the source behind it.
    assertIdentical(await iteratorAge(simAws, projectorName), 600_000);
  });

  it("counts a batch whose handler threw", async () => {
    // Given a projector that fails on everything it is given.
    const { simAws, tableName, functionName } =
      await simAwsWithStreamEventSource({
        handlerResult: () => {
          throw new Error("no projection for this order");
        },
      });

    await simAws.clock().setTo(startedAt);

    // When an item is written and the batch fails.
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-1" } },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the age was still counted, because a failed batch is retried and
    // leaves the function further behind rather than caught up.
    assertIdentical(await iteratorAge(simAws, functionName), 0);
  });

  it("counts nothing for an invocation that read no stream", async () => {
    // Given a function invoked directly rather than by a mapping.
    const simAws = new SimAws();

    await simAws.clock().setTo(startedAt);
    await makeProjector(
      simAws,
      `arn:aws:iam::${simAws.defaultAccountId}:role/ProjectorRole`,
    );
    await simAws.backgroundTasksComplete();

    // When the function is invoked.
    await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: projectorName }));
    await simAws.backgroundTasksComplete();

    // Then there is no age to report, because IteratorAge belongs to a stream
    // batch and this invocation read no stream.
    assertUndefined(await iteratorAge(simAws, projectorName));
  });
});
