import {
  DescribeAlarmsCommand,
  PutMetricAlarmCommand,
} from "@aws-sdk/client-cloudwatch";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { CreateTopicCommand, SubscribeCommand } from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";

const functionName = "orders";
const alarmName = "OrdersFailing";
const startedAt = new Date("2026-08-30T09:00:00.000Z");

describe("an alarm over the AWS/Lambda Errors a function publishes", () => {
  it("fires on a failing invocation and notifies its topic", async () => {
    // Given a failing function, an alarm on its errors, and a queue standing
    // in for whoever the alarm's topic tells.
    const simAws = new SimAws();

    await simAws.clock().setTo(startedAt);
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
        Code: {
          ZipFile: makeLambdaZipFileInput(() => {
            throw new Error("order has no items");
          }),
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    const topic = await simAws
      .sns()
      .createTopic(new CreateTopicCommand({ Name: "orders-alerts" }));
    const queue = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "alerts" }));

    assertNonNullable(topic.TopicArn);
    assertNonNullable(queue.QueueUrl);

    // The queue's own policy has to admit SNS, exactly as in an account.
    await simAws.sqs().setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: queue.QueueUrl,
        Attributes: {
          Policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "sns.amazonaws.com" },
                Action: "sqs:SendMessage",
                Resource: "*",
              },
            ],
          }),
        },
      }),
    );
    await simAws.sns().subscribe(
      new SubscribeCommand({
        TopicArn: topic.TopicArn,
        Protocol: "sqs",
        Endpoint: `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:alerts`,
      }),
    );
    await simAws.cloudWatch().putMetricAlarm(
      new PutMetricAlarmCommand({
        AlarmName: alarmName,
        Namespace: "AWS/Lambda",
        MetricName: "Errors",
        Dimensions: [{ Name: "FunctionName", Value: functionName }],
        Statistic: "Sum",
        Period: 300,
        EvaluationPeriods: 3,
        DatapointsToAlarm: 1,
        Threshold: 0,
        ComparisonOperator: "GreaterThanThreshold",
        TreatMissingData: "notBreaching",
        AlarmActions: [topic.TopicArn],
      }),
    );

    // When the handler fails and the clock passes the period.
    await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: functionName }));
    await simAws.backgroundTasksComplete();
    await simAws.clock().advanceBy({ minutes: 6 });

    // Then the alarm fired on a metric nothing published by hand, and the
    // notification reached the queue behind the topic.
    const { MetricAlarms } = await simAws
      .cloudWatch()
      .describeAlarms(new DescribeAlarmsCommand({ AlarmNames: [alarmName] }));

    assertIdentical(MetricAlarms?.at(0)?.StateValue, "ALARM");
    assertArrayLength(simAws.cloudWatch().alarmActionFailures, 0);

    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queue.QueueUrl }));

    assertArrayLength(received.Messages ?? [], 1);
    assertStringIncludes(received.Messages?.at(0)?.Body ?? "", alarmName);
  });
});
