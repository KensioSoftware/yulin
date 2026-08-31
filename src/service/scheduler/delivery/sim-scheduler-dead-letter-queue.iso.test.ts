import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateScheduleCommand } from "@aws-sdk/client-scheduler";
import { CreateQueueCommand, ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { SimAws } from "../../aws/sim-aws.js";

const functionArn =
  "arn:aws:lambda:us-east-1:888888888888:function:missing-target";
const roleArn = "arn:aws:iam::888888888888:role/SchedulerRole";
const deadLetterArn = "arn:aws:sqs:us-east-1:888888888888:failed-schedules";

/**
 * A simulation whose execution role has the supplied identity policy.
 */
async function simulationWithRole(statement: object): Promise<SimAws> {
  const simAws = new SimAws({
    clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
  });

  await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "SchedulerRole",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { Service: "scheduler.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );
  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "SchedulerRole",
      PolicyName: "Deliver",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: statement,
      }),
    }),
  );

  return simAws;
}

/**
 * Fire a schedule whose target is absent and whose dead-letter queue is named.
 */
async function fireFailingSchedule(simAws: SimAws): Promise<void> {
  await simAws.scheduler().createSchedule(
    new CreateScheduleCommand({
      Name: "nightly-report",
      ScheduleExpression: "at(2026-07-26T10:00:00)",
      FlexibleTimeWindow: { Mode: "OFF" },
      Target: {
        Arn: functionArn,
        RoleArn: roleArn,
        Input: '{"report":"nightly"}',
        DeadLetterConfig: { Arn: deadLetterArn },
        RetryPolicy: { MaximumRetryAttempts: 3 },
      },
    }),
  );

  await simAws.clock().advanceBy({ hours: 1 });
}

describe("Scheduler dead-letter queue", () => {
  it("sends a permanent failure with Scheduler message attributes", async () => {
    // Given an execution role allowed to invoke the target and send to the DLQ.
    const simAws = await simulationWithRole([
      {
        Effect: "Allow",
        Action: "lambda:InvokeFunction",
        Resource: functionArn,
      },
      { Effect: "Allow", Action: "sqs:SendMessage", Resource: deadLetterArn },
    ]);
    const queue = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "failed-schedules" }));

    // When Scheduler cannot find the target.
    await fireFailingSchedule(simAws);

    // Then the queue receives the original input and AWS-shaped diagnostics.
    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queue.QueueUrl,
        MessageAttributeNames: ["All"],
      }),
    );
    const [message] = received.Messages ?? [];

    assertNonNullable(message);
    const attributes = message.MessageAttributes ?? {};
    const errorCode = attributes["ERROR_CODE"]?.StringValue;
    const errorMessage = attributes["ERROR_MESSAGE"]?.StringValue;
    const retryAttempts = attributes["RETRY_ATTEMPTS"]?.StringValue;
    const scheduledTime = attributes["SCHEDULED_TIME"]?.StringValue;
    const targetArn = attributes["TARGET_ARN"]?.StringValue;
    const exhaustedCondition = attributes["EXHAUSTED_RETRY_CONDITION"];

    assertIdentical(message.Body, '{"report":"nightly"}');
    assertIdentical(errorCode, "TargetNotFound");
    assertStringIncludes(String(errorMessage), "missing-target");
    assertIdentical(retryAttempts, "0");
    assertIdentical(scheduledTime, "2026-07-26T10:00:00.000Z");
    assertIdentical(targetArn, functionArn);
    assertUndefined(exhaustedCondition);
    assertArrayEmpty(simAws.scheduler().deliveryFailures);
  });

  it("records a dead-letter delivery denied by the execution role", async () => {
    // Given a queue whose execution role cannot send to it.
    const simAws = await simulationWithRole({
      Effect: "Allow",
      Action: "lambda:InvokeFunction",
      Resource: functionArn,
    });
    const queue = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "failed-schedules" }));

    // When the target fails permanently.
    await fireFailingSchedule(simAws);

    // Then the queue stays empty and the Scheduler inspection explains why.
    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queue.QueueUrl }));

    assertArrayEmpty(received.Messages ?? []);
    assertArrayLength(simAws.scheduler().deliveryFailures, 1);
    assertStringIncludes(
      simAws.scheduler().deliveryFailures[0]?.message ?? "",
      "sqs:SendMessage",
    );
  });

  it("records a dead-letter queue that does not exist", async () => {
    // Given a role with permission to send to a queue that was never created.
    const simAws = await simulationWithRole([
      {
        Effect: "Allow",
        Action: "lambda:InvokeFunction",
        Resource: functionArn,
      },
      { Effect: "Allow", Action: "sqs:SendMessage", Resource: deadLetterArn },
    ]);

    // When the target fails permanently.
    await fireFailingSchedule(simAws);

    // Then the failed DLQ delivery remains available for inspection.
    assertArrayLength(simAws.scheduler().deliveryFailures, 1);
    assertStringIncludes(
      simAws.scheduler().deliveryFailures[0]?.message ?? "",
      "is not a simulated SQS queue",
    );
  });
});
