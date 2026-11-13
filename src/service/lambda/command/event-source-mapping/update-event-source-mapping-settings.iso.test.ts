import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { CreateRoleCommand } from "@aws-sdk/client-iam";
import {
  CreateFunctionCommand,
  GetEventSourceMappingCommand,
  UpdateEventSourceMappingCommand,
} from "@aws-sdk/client-lambda";
import { CreateQueueCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  recordingHandler,
  simAwsWithSqsEventSource,
} from "../../../../../test/lambda/event-source-fixture.js";
import { simAwsWithStreamEventSource } from "../../../../../test/lambda/stream-event-source-fixture.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../../function/sim-lambda-handler.type.js";

function throwing(): never {
  throw new Error("Projector could not handle the batch");
}

async function update(
  simAws: SimAws,
  input: UpdateEventSourceMappingCommand["input"],
): Promise<void> {
  await simAws
    .lambda()
    .updateEventSourceMapping(new UpdateEventSourceMappingCommand(input));
  await simAws.backgroundTasksComplete();
}

async function sendOrder(
  simAws: SimAws,
  queueUrl: string,
  body: string,
): Promise<void> {
  await simAws
    .sqs()
    .sendMessage(
      new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body }),
    );
  await simAws.backgroundTasksComplete();
}

async function makeFunction(
  simAws: SimAws,
  functionName: string,
  roleArn: string,
  handler: SimLambdaHandler,
): Promise<void> {
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: roleArn,
      Code: { ZipFile: makeLambdaZipFileInput(handler) },
    }),
  );
}

describe("Lambda UpdateEventSourceMappingCommand settings", () => {
  it("applies a changed retry limit to the next failed batch", async () => {
    // Given a stream mapping on the default retries, whose handler always
    // throws.
    const { simAws, tableName, uuid, events } =
      await simAwsWithStreamEventSource({ handlerResult: throwing });
    await simAws.backgroundTasksComplete();

    // When it is told to allow no retries, and a change is written.
    await update(simAws, { UUID: uuid, MaximumRetryAttempts: 0 });
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-1" } },
      }),
    );
    await simAws.backgroundTasksComplete();
    await simAws.clock().advanceBy({ hours: 1 });

    // Then the batch was delivered once and discarded, and the mapping reports
    // the new limit beside the ones the update left alone.
    assertArrayLength(events, 1);
    const read = await simAws
      .lambda()
      .getEventSourceMapping(new GetEventSourceMappingCommand({ UUID: uuid }));
    assertObjectMatches(read, {
      MaximumRetryAttempts: 0,
      MaximumRecordAgeInSeconds: -1,
      BisectBatchOnFunctionError: false,
    });
  });

  it("reads a batch item failure report once the response type is added", async () => {
    // Given a queue mapping whose function reports one failed message, which
    // the mapping was not created to expect.
    const { simAws, queueUrl, uuid, events } = await simAwsWithSqsEventSource({
      handlerResult: (event) => ({
        batchItemFailures: event.Records.filter(
          (record) => record.body === "order-2",
        ).map((record) => ({ itemIdentifier: record.messageId })),
      }),
    });
    await simAws.backgroundTasksComplete();

    // When the response type is added and a batch of two arrives.
    await update(simAws, {
      UUID: uuid,
      FunctionResponseTypes: ["ReportBatchItemFailures"],
    });
    await simAws.sqs().sendMessageBatch({
      input: {
        QueueUrl: queueUrl,
        Entries: [
          { Id: "1", MessageBody: "order-1" },
          { Id: "2", MessageBody: "order-2" },
        ],
      },
    });
    await simAws.backgroundTasksComplete();
    await simAws.clock().advanceBy({ seconds: 31 });

    // Then only the reported message came back.
    assertArrayLength(events, 2);
    assertArrayEquals(
      events[1].Records.map((record) => record.body),
      ["order-2"],
    );
  });

  it("reports a failure destination added by an update", async () => {
    // Given a stream mapping with no failure destination, and a queue.
    const { simAws, uuid } = await simAwsWithStreamEventSource();
    const queue = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "failed-orders" }));
    const queueArn = simAws.sqs().findQueue("failed-orders")?.arn.value;
    assertNonNullable(queue.QueueUrl);
    assertNonNullable(queueArn);
    await simAws.backgroundTasksComplete();

    // When the queue is made its failure destination.
    await update(simAws, {
      UUID: uuid,
      DestinationConfig: { OnFailure: { Destination: queueArn } },
    });

    // Then the mapping reports it.
    const read = await simAws
      .lambda()
      .getEventSourceMapping(new GetEventSourceMappingCommand({ UUID: uuid }));
    assertObjectMatches(read, {
      DestinationConfig: { OnFailure: { Destination: queueArn } },
    });
  });

  it("delivers to the function an update moves the mapping onto", async () => {
    // Given a queue mapping, and a second function sharing the first one's
    // role.
    const { simAws, queueUrl, uuid, roleArn, events } =
      await simAwsWithSqsEventSource();
    const auditor = recordingHandler();
    await makeFunction(simAws, "order-auditor", roleArn, auditor.handler);
    await simAws.backgroundTasksComplete();

    // When the mapping is moved onto the second function and a message sent.
    await update(simAws, { UUID: uuid, FunctionName: "order-auditor" });
    await sendOrder(simAws, queueUrl, "order-1");

    // Then the second function received it, and the mapping reports it.
    assertArrayEmpty(events);
    assertArrayLength(auditor.events, 1);
    const read = await simAws
      .lambda()
      .getEventSourceMapping(new GetEventSourceMappingCommand({ UUID: uuid }));
    assertStringIncludes(read.FunctionArn, ":function:order-auditor");
  });

  it("refuses a function whose role cannot poll the queue, changing nothing", async () => {
    // Given a queue mapping, and a function whose role has no policy.
    const { simAws, queueUrl, uuid, events } = await simAwsWithSqsEventSource();
    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "NoPollingRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { Service: "lambda.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    assertNonNullable(role.Role.Arn);
    await makeFunction(simAws, "order-auditor", role.Role.Arn, () => "done");
    await simAws.backgroundTasksComplete();

    // When the mapping is moved onto it.
    const error = await assertThrowsErrorAsync(async () =>
      update(simAws, { UUID: uuid, FunctionName: "order-auditor" }),
    );

    // Then the move is refused as creating the mapping would have been, and
    // the first function keeps receiving.
    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(error.message, "execution role");
    await sendOrder(simAws, queueUrl, "order-1");
    assertArrayLength(events, 1);
  });

  it("refuses a retry limit for a queue mapping, changing nothing", async () => {
    const { simAws, uuid } = await simAwsWithSqsEventSource();

    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().updateEventSourceMapping(
        new UpdateEventSourceMappingCommand({
          UUID: uuid,
          BatchSize: 5,
          MaximumRetryAttempts: 2,
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
});
