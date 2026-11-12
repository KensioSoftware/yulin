import { PutRecordCommand } from "@aws-sdk/client-kinesis";
import {
  GetEventSourceMappingCommand,
  UpdateEventSourceMappingCommand,
} from "@aws-sdk/client-lambda";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithSqsEventSource } from "../../../../../test/lambda/event-source-fixture.js";
import { simAwsWithKinesisEventSource } from "../../../../../test/lambda/kinesis-event-source-fixture.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  SimLambdaInvalidParameterValueException,
  SimLambdaResourceInUseException,
  SimLambdaResourceNotFoundException,
  SimLambdaValidationException,
} from "../../error/sim-lambda.error.js";

async function send(
  simAws: SimAws,
  queueUrl: string,
  bodies: readonly string[],
): Promise<void> {
  for (const body of bodies) {
    // oxlint-disable-next-line no-await-in-loop -- sent in order
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body }),
      );
  }
}

describe("Lambda UpdateEventSourceMappingCommand", () => {
  it("stops a disabled mapping delivering, and delivers what waited once it is enabled again", async () => {
    // Given a queue mapping that has been disabled.
    const { simAws, queueUrl, uuid, events } = await simAwsWithSqsEventSource();
    await simAws.backgroundTasksComplete();

    const disabling = await simAws
      .lambda()
      .updateEventSourceMapping(
        new UpdateEventSourceMappingCommand({ UUID: uuid, Enabled: false }),
      );
    await simAws.backgroundTasksComplete();

    // When a message is sent while it is disabled.
    await send(simAws, queueUrl, ["order-1"]);
    await simAws.backgroundTasksComplete();
    const deliveredWhileDisabled = events.length;

    // And the mapping is enabled again.
    await simAws
      .lambda()
      .updateEventSourceMapping(
        new UpdateEventSourceMappingCommand({ UUID: uuid, Enabled: true }),
      );
    await simAws.backgroundTasksComplete();

    // Then nothing reached the function until it was enabled, and the waiting
    // message did afterwards.
    assertIdentical(disabling.State, "Disabling");
    assertIdentical(deliveredWhileDisabled, 0);
    assertArrayLength(events, 1);
    assertIdentical(events[0].Records[0]?.body, "order-1");
  });

  it("settles into the state the update asked for", async () => {
    const { simAws, uuid } = await simAwsWithSqsEventSource();
    await simAws.backgroundTasksComplete();

    await simAws
      .lambda()
      .updateEventSourceMapping(
        new UpdateEventSourceMappingCommand({ UUID: uuid, Enabled: false }),
      );
    await simAws.backgroundTasksComplete();
    const read = await simAws
      .lambda()
      .getEventSourceMapping(new GetEventSourceMappingCommand({ UUID: uuid }));

    assertIdentical(read.State, "Disabled");
  });

  it("refuses an update while the mapping is still being created", async () => {
    // Given a mapping the simulation has not finished creating.
    const { simAws, uuid } = await simAwsWithSqsEventSource();

    // When it is updated straight away.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .updateEventSourceMapping(
          new UpdateEventSourceMappingCommand({ UUID: uuid, BatchSize: 1 }),
        ),
    );

    // Then real Lambda's in-use refusal is reported.
    assertInstanceOf(error, SimLambdaResourceInUseException);
    await simAws.backgroundTasksComplete();
  });

  it("delivers the next batch at a changed batch size", async () => {
    // Given a disabled queue mapping delivering ten at a time, with three
    // messages waiting.
    const { simAws, queueUrl, uuid, events } = await simAwsWithSqsEventSource();
    await simAws.backgroundTasksComplete();
    await simAws
      .lambda()
      .updateEventSourceMapping(
        new UpdateEventSourceMappingCommand({ UUID: uuid, Enabled: false }),
      );
    await simAws.backgroundTasksComplete();
    await send(simAws, queueUrl, ["order-1", "order-2", "order-3"]);

    // When it is enabled again delivering one at a time.
    const updated = await simAws.lambda().updateEventSourceMapping(
      new UpdateEventSourceMappingCommand({
        UUID: uuid,
        Enabled: true,
        BatchSize: 1,
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then each message arrives in a batch of its own.
    assertIdentical(updated.BatchSize, 1);
    assertArrayEquals(
      events.map((event) => event.Records.length),
      [1, 1, 1],
    );
  });

  it("applies filters added by an update, and drops them for empty criteria", async () => {
    // Given a queue mapping given a filter after it was created.
    const { simAws, queueUrl, uuid, events } = await simAwsWithSqsEventSource();
    await simAws.backgroundTasksComplete();
    const filtered = await simAws.lambda().updateEventSourceMapping(
      new UpdateEventSourceMappingCommand({
        UUID: uuid,
        FilterCriteria: {
          Filters: [{ Pattern: JSON.stringify({ body: ["wanted"] }) }],
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When one message matching and one not are sent, and the filters are
    // then dropped before another unmatched one is sent.
    await send(simAws, queueUrl, ["wanted", "unwanted"]);
    await simAws.backgroundTasksComplete();
    const unfiltered = await simAws
      .lambda()
      .updateEventSourceMapping(
        new UpdateEventSourceMappingCommand({ UUID: uuid, FilterCriteria: {} }),
      );
    await simAws.backgroundTasksComplete();
    await send(simAws, queueUrl, ["anything"]);
    await simAws.backgroundTasksComplete();

    // Then only the match reached the function while the filter stood.
    assertIdentical(filtered.FilterCriteria?.Filters?.length, 1);
    assertUndefined(unfiltered.FilterCriteria);
    assertArrayEquals(
      events.flatMap((event) => event.Records.map((record) => record.body)),
      ["wanted", "anything"],
    );
  });

  it("refuses a member it keeps as the mapping was created, changing nothing", async () => {
    const { simAws, uuid } = await simAwsWithSqsEventSource();

    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().updateEventSourceMapping(
        new UpdateEventSourceMappingCommand({
          UUID: uuid,
          BatchSize: 5,
          FunctionResponseTypes: ["ReportBatchItemFailures"],
        }),
      ),
    );
    const read = await simAws
      .lambda()
      .getEventSourceMapping(new GetEventSourceMappingCommand({ UUID: uuid }));

    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertIdentical(read.BatchSize, 10);
    await simAws.backgroundTasksComplete();
  });

  it("refuses a batch size the event source would never fill", async () => {
    const { simAws, uuid } = await simAwsWithSqsEventSource();

    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .updateEventSourceMapping(
          new UpdateEventSourceMappingCommand({ UUID: uuid, BatchSize: 11 }),
        ),
    );

    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    await simAws.backgroundTasksComplete();
  });

  it("refuses an Enabled that is not a boolean", async () => {
    // Given a settled mapping, and an Enabled that arrived as a JSON string.
    const { simAws, uuid } = await simAwsWithSqsEventSource();
    await simAws.backgroundTasksComplete();
    const enabled = "false" as unknown as boolean;

    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .updateEventSourceMapping(
          new UpdateEventSourceMappingCommand({ UUID: uuid, Enabled: enabled }),
        ),
    );

    assertInstanceOf(error, SimLambdaValidationException);
  });

  it("throws for a mapping that does not exist", async () => {
    const { simAws } = await simAwsWithSqsEventSource();

    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().updateEventSourceMapping(
        new UpdateEventSourceMappingCommand({
          UUID: "missing",
          Enabled: false,
        }),
      ),
    );

    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    await simAws.backgroundTasksComplete();
  });

  it("authorizes lambda:UpdateEventSourceMapping on the function", async () => {
    const { simAws, uuid } = await simAwsWithSqsEventSource();

    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .updateEventSourceMapping(
          new UpdateEventSourceMappingCommand({ UUID: uuid, Enabled: false }),
          { caller: { kind: "anonymous" } },
        ),
    );

    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:UpdateEventSourceMapping");
    await simAws.backgroundTasksComplete();
  });

  it("pauses and resumes a Kinesis stream mapping", async () => {
    // Given a Kinesis mapping that has been disabled.
    const { simAws, streamName, uuid, events } =
      await simAwsWithKinesisEventSource();
    await simAws.backgroundTasksComplete();
    await simAws
      .lambda()
      .updateEventSourceMapping(
        new UpdateEventSourceMappingCommand({ UUID: uuid, Enabled: false }),
      );
    await simAws.backgroundTasksComplete();

    // When a record is put while it is disabled.
    await simAws.kinesis().putRecord(
      new PutRecordCommand({
        StreamName: streamName,
        PartitionKey: "customer-1",
        Data: new TextEncoder().encode("order-1"),
      }),
    );
    await simAws.backgroundTasksComplete();
    const whileDisabled = [...events];

    // And the mapping is enabled again.
    await simAws
      .lambda()
      .updateEventSourceMapping(
        new UpdateEventSourceMappingCommand({ UUID: uuid, Enabled: true }),
      );
    await simAws.backgroundTasksComplete();

    // Then the record waited on the shard until the mapping was enabled.
    assertArrayEmpty(whileDisabled);
    assertArrayLength(events, 1);
  });
});
