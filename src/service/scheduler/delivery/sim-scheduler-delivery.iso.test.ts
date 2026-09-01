import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { PutFunctionEventInvokeConfigCommand } from "@aws-sdk/client-lambda";
import { CreateScheduleCommand } from "@aws-sdk/client-scheduler";
import { CreateTopicCommand, SubscribeCommand } from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/index.js";
import { simSnsQueuePolicy } from "../../../../test/sns/subscription-fixture.js";

const startedAt = "2026-07-26T09:00:00.000Z";

const functionArn = "arn:aws:lambda:us-east-1:888888888888:function:reconcile";

const roleArn = "arn:aws:iam::888888888888:role/SchedulerRole";

const queueArn = "arn:aws:sqs:us-east-1:888888888888:reports";

const topicArn = "arn:aws:sns:us-east-1:888888888888:reports";

/**
 * A simulation whose execution role trusts Scheduler and is allowed exactly
 * what one policy statement says.
 */
async function simulationWithRole(
  statement: object,
  trusts = "scheduler.amazonaws.com",
): Promise<SimAws> {
  const simAws = new SimAws({ clock: new SimFixedClock(new Date(startedAt)) });

  await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "SchedulerRole",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { Service: trusts },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "SchedulerRole",
      PolicyName: "Invoke",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: statement,
      }),
    }),
  );

  return simAws;
}

/**
 * A one-time schedule an hour out, so one advance fires it exactly once.
 */
async function scheduleFor(
  simAws: SimAws,
  target: { Arn: string; RoleArn: string; Input?: string },
): Promise<void> {
  await simAws.scheduler().createSchedule(
    new CreateScheduleCommand({
      Name: "nightly-report",
      ScheduleExpression: "at(2026-07-26T10:00:00)",
      FlexibleTimeWindow: { Mode: "OFF" },
      Target: target,
    }),
  );

  await simAws.clock().advanceBy({ hours: 2 });
}

describe("Scheduler target invocation", () => {
  it("sends a schedule's input to a queue target", async () => {
    // Given a role allowed to send to a queue.
    const simAws = await simulationWithRole({
      Effect: "Allow",
      Action: "sqs:SendMessage",
      Resource: queueArn,
    });

    await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "reports" }));

    // When a schedule targeting it fires.
    await scheduleFor(simAws, {
      Arn: queueArn,
      RoleArn: roleArn,
      Input: JSON.stringify({ report: "nightly" }),
    });

    // Then the queue has the input, with no envelope around it. No queue
    // policy was involved: the role's own policy was the whole decision.
    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: `https://sqs.us-east-1.amazonaws.com/888888888888/reports`,
      }),
    );

    assertArrayLength(received.Messages ?? [], 1);
    assertIdentical(received.Messages?.[0]?.Body, '{"report":"nightly"}');
  });

  it("publishes a schedule's input to a topic target", async () => {
    // Given a role allowed to publish, and a topic with a queue subscribed.
    const simAws = await simulationWithRole({
      Effect: "Allow",
      Action: "sns:Publish",
      Resource: topicArn,
    });

    await simAws.sns().createTopic(new CreateTopicCommand({ Name: "reports" }));
    const queue = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "subscriber" }));

    // The subscribed queue's own policy admits the topic, which is SNS fan-out
    // rather than anything Scheduler does.
    await simAws.sqs().setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: queue.QueueUrl,
        Attributes: {
          Policy: simSnsQueuePolicy(
            "arn:aws:sqs:us-east-1:888888888888:subscriber",
            topicArn,
          ),
        },
      }),
    );

    await simAws.sns().subscribe(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: "arn:aws:sqs:us-east-1:888888888888:subscriber",
      }),
    );

    // When a schedule targeting the topic fires.
    await scheduleFor(simAws, {
      Arn: topicArn,
      RoleArn: roleArn,
      Input: JSON.stringify({ report: "nightly" }),
    });

    // Then it fanned out to the subscription as an ordinary publish would.
    // No extra draining: advanceBy settles the invocation and the fan-out it
    // caused before it returns.
    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queue.QueueUrl }));

    assertArrayLength(received.Messages ?? [], 1);
  });

  it("leaves a failing handler to Lambda's asynchronous invocation", async () => {
    // Given a failing function whose Lambda config sends the exhausted event
    // and its failure record to separate queues.
    const simAws = await simulationWithRole({
      Effect: "Allow",
      Action: "lambda:InvokeFunction",
      Resource: functionArn,
    });
    const failures = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "lambda-failures" }));
    const deadLetters = await simAws
      .sqs()
      .createQueue(
        new CreateQueueCommand({ QueueName: "lambda-dead-letters" }),
      );

    await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "ReconcileRole",
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
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ReconcileRole",
        PolicyName: "SendFailures",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "sqs:SendMessage",
            Resource: [
              "arn:aws:sqs:us-east-1:888888888888:lambda-failures",
              "arn:aws:sqs:us-east-1:888888888888:lambda-dead-letters",
            ],
          },
        }),
      }),
    );

    await simAws.lambda().createFunction({
      input: {
        FunctionName: "reconcile",
        Role: "arn:aws:iam::888888888888:role/ReconcileRole",
        DeadLetterConfig: {
          TargetArn: "arn:aws:sqs:us-east-1:888888888888:lambda-dead-letters",
        },
        Code: {
          ZipFile: makeLambdaZipFileInput(() => {
            throw new Error("reconciliation failed");
          }),
        },
      },
    });
    await simAws.lambda().putFunctionEventInvokeConfig(
      new PutFunctionEventInvokeConfigCommand({
        FunctionName: "reconcile",
        MaximumRetryAttempts: 0,
        DestinationConfig: {
          OnFailure: {
            Destination: "arn:aws:sqs:us-east-1:888888888888:lambda-failures",
          },
        },
      }),
    );

    // When a schedule invokes it with an event.
    await scheduleFor(simAws, {
      Arn: functionArn,
      RoleArn: roleArn,
      Input: JSON.stringify({ report: "nightly" }),
    });

    // Then Scheduler records a successful delivery. Lambda sends its own
    // failure record and dead-letter event after the handler throws.
    assertArrayEmpty(simAws.scheduler().deliveryFailures);

    const failureMessages = await simAws
      .sqs()
      .receiveMessage(
        new ReceiveMessageCommand({ QueueUrl: failures.QueueUrl }),
      );
    const [failureMessage] = failureMessages.Messages ?? [];
    assertNonNullable(failureMessage?.Body, "a Lambda failure record arrived");
    const failureRecord = JSON.parse(failureMessage.Body) as {
      readonly requestContext: {
        readonly approximateInvokeCount: number;
        readonly condition: string;
      };
      readonly requestPayload: object;
    };
    assertIdentical(failureRecord.requestContext.approximateInvokeCount, 1);
    assertIdentical(failureRecord.requestContext.condition, "RetriesExhausted");
    assertObjectEquals(failureRecord.requestPayload, { report: "nightly" });

    const deadLetterMessages = await simAws
      .sqs()
      .receiveMessage(
        new ReceiveMessageCommand({ QueueUrl: deadLetters.QueueUrl }),
      );
    assertArrayLength(deadLetterMessages.Messages ?? [], 1);
    assertIdentical(
      deadLetterMessages.Messages?.[0]?.Body,
      '{"report":"nightly"}',
    );
  });

  it("does not invoke when the role may not, and says why", async () => {
    // Given a role that trusts Scheduler but is allowed nothing on the target.
    const invocations: unknown[] = [];
    const simAws = await simulationWithRole({
      Effect: "Allow",
      Action: "lambda:InvokeFunction",
      Resource: "arn:aws:lambda:us-east-1:888888888888:function:something-else",
    });

    await simAws.lambda().createFunction({
      input: {
        FunctionName: "reconcile",
        Role: "arn:aws:iam::888888888888:role/ReconcileRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(() => {
            invocations.push(1);
            return { ok: true };
          }),
        },
      },
    });

    // When the schedule fires.
    await scheduleFor(simAws, { Arn: functionArn, RoleArn: roleArn });

    // Then nothing was invoked, and the failure explains which role and which
    // action, since that is where it is fixed.
    assertArrayEmpty(invocations);

    const [failure] = simAws.scheduler().deliveryFailures;

    assertNonNullable(failure);
    assertIdentical(failure.roleArn, roleArn);
    assertStringIncludes(failure.message, "lambda:InvokeFunction");
    assertIdentical(failure.at.toISOString(), "2026-07-26T10:00:00.000Z");
  });

  it("does not invoke when the role does not trust Scheduler", async () => {
    // Given a role trusting EventBridge rules rather than Scheduler, which is
    // an easy thing to get wrong when moving from one to the other.
    const simAws = await simulationWithRole(
      { Effect: "Allow", Action: "lambda:InvokeFunction", Resource: "*" },
      "events.amazonaws.com",
    );

    await simAws.lambda().createFunction({
      input: {
        FunctionName: "reconcile",
        Role: "arn:aws:iam::888888888888:role/ReconcileRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => ({ ok: true })) },
      },
    });

    await scheduleFor(simAws, { Arn: functionArn, RoleArn: roleArn });

    // Then the failure points at the trust policy rather than the permission,
    // because that is the one to change.
    const [failure] = simAws.scheduler().deliveryFailures;

    assertNonNullable(failure);
    assertStringIncludes(failure.message, "trust policy");
    assertStringIncludes(failure.message, "AssumeRolePolicyDocument");
  });

  it("reports a role that is not there rather than failing silently", async () => {
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date(startedAt)),
    });

    await scheduleFor(simAws, { Arn: functionArn, RoleArn: roleArn });

    const [failure] = simAws.scheduler().deliveryFailures;

    assertNonNullable(failure);
    assertStringIncludes(failure.message, "is not a simulated IAM role");
  });

  it("reports a target that is not a simulated resource", async () => {
    const simAws = await simulationWithRole({
      Effect: "Allow",
      Action: "lambda:InvokeFunction",
      Resource: "*",
    });

    await scheduleFor(simAws, { Arn: functionArn, RoleArn: roleArn });

    const [failure] = simAws.scheduler().deliveryFailures;

    assertNonNullable(failure);
    assertStringIncludes(failure.message, "is not a simulated Lambda function");
  });
});
