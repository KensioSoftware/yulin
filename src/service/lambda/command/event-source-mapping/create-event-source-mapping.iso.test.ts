import { CreateEventSourceMappingCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  makeConsumerFunction,
  makePollingRole,
  makeSourceQueue,
  recordingHandler,
  simAwsWithSqsEventSource,
} from "../../../../../test/lambda/event-source-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";

/**
 * A simulated AWS with a queue and a function, and no mapping between them.
 */
async function simAwsReadyToMap(
  roleActions?: readonly string[],
): Promise<{ simAws: SimAws; queueArn: string; functionName: string }> {
  const simAws = new SimAws();
  const { queueArn } = await makeSourceQueue(simAws);
  const roleArn = await makePollingRole(simAws, queueArn, roleActions);
  const functionName = await makeConsumerFunction(
    simAws,
    roleArn,
    recordingHandler().handler,
  );

  return { simAws, queueArn, functionName };
}

describe("sim Lambda CreateEventSourceMapping", () => {
  it("reports the created mapping", async () => {
    // Given a queue and a function.
    const { simAws, queueArn, functionName } = await simAwsReadyToMap();

    // When a mapping is created between them.
    const created = await simAws.lambda().createEventSourceMapping(
      new CreateEventSourceMappingCommand({
        EventSourceArn: queueArn,
        FunctionName: functionName,
        BatchSize: 5,
      }),
    );

    // Then it is reported the way real Lambda reports one.
    assertIdentical(created.EventSourceArn, queueArn);
    assertIdentical(created.BatchSize, 5);
    assertIdentical(created.State, "Creating");
    assertIdentical(created.MaximumBatchingWindowInSeconds, 0);
    assertStringIncludes(created.EventSourceMappingArn, "event-source-mapping");
  });

  it("becomes Enabled once the simulation has caught up", async () => {
    // Given a newly created mapping.
    const { simAws, uuid } = await simAwsWithSqsEventSource();

    // When the simulation settles.
    await simAws.backgroundTasksComplete();

    // Then the mapping is enabled, as it is on real Lambda.
    const mapping = await simAws
      .lambda()
      .getEventSourceMapping({ input: { UUID: uuid } });

    assertIdentical(mapping.State, "Enabled");
  });

  it("refuses an event source ARN naming a queue that does not exist", async () => {
    // Given a function whose role may poll a queue that was never created.
    const simAws = new SimAws();
    const missingQueueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:missing`;
    const roleArn = await makePollingRole(simAws, missingQueueArn);
    const functionName = await makeConsumerFunction(
      simAws,
      roleArn,
      recordingHandler().handler,
    );

    // When a mapping is created for it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.lambda().createEventSourceMapping(
        new CreateEventSourceMappingCommand({
          EventSourceArn: missingQueueArn,
          FunctionName: functionName,
        }),
      );
    });

    // Then the mapping is refused rather than made and never delivered from.
    assertIdentical(error.name, "InvalidParameterValueException");
    assertStringIncludes(error.message, "does not exist");
  });

  it("refuses an execution role that may not receive from the queue", async () => {
    // Given a function whose role may delete but not receive.
    const { simAws, queueArn, functionName } = await simAwsReadyToMap([
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
    ]);

    // When a mapping is created for it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.lambda().createEventSourceMapping(
        new CreateEventSourceMappingCommand({
          EventSourceArn: queueArn,
          FunctionName: functionName,
        }),
      );
    });

    // Then it is refused the way real Lambda refuses one.
    assertIdentical(error.name, "InvalidParameterValueException");
    assertStringIncludes(
      error.message,
      "The provided execution role does not have permissions to call " +
        "ReceiveMessage on SQS",
    );
  });

  it("refuses an execution role that may not delete from the queue", async () => {
    // Given a function whose role may receive but not delete.
    const { simAws, queueArn, functionName } = await simAwsReadyToMap([
      "sqs:ReceiveMessage",
      "sqs:GetQueueAttributes",
    ]);

    // When a mapping is created for it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.lambda().createEventSourceMapping(
        new CreateEventSourceMappingCommand({
          EventSourceArn: queueArn,
          FunctionName: functionName,
        }),
      );
    });

    // Then it is refused, because it could only ever deliver twice.
    assertStringIncludes(
      error.message,
      "does not have permissions to call DeleteMessage on SQS",
    );
  });

  it("refuses an execution role that may not read the queue's attributes", async () => {
    // Given a function whose role may receive and delete only.
    const { simAws, queueArn, functionName } = await simAwsReadyToMap([
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
    ]);

    // When a mapping is created for it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.lambda().createEventSourceMapping(
        new CreateEventSourceMappingCommand({
          EventSourceArn: queueArn,
          FunctionName: functionName,
        }),
      );
    });

    // Then it is refused, as real Lambda refuses one.
    assertStringIncludes(
      error.message,
      "does not have permissions to call GetQueueAttributes on SQS",
    );
  });

  it("refuses a mapping for a function that does not exist", async () => {
    // Given a queue and no function of that name.
    const simAws = new SimAws();
    const { queueArn } = await makeSourceQueue(simAws);

    // When a mapping names one anyway.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.lambda().createEventSourceMapping(
        new CreateEventSourceMappingCommand({
          EventSourceArn: queueArn,
          FunctionName: "no-such-function",
        }),
      );
    });

    // Then it is refused as a missing function.
    assertIdentical(error.name, "ResourceNotFoundException");
  });
});
