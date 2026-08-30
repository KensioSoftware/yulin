import {
  DescribeAlarmsCommand,
  PutMetricAlarmCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  PutMetricFilterCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { CreateTopicCommand } from "@aws-sdk/client-sns";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/30/[$LATEST]abc";
const alarmName = "OrdersHandlerErrors";
const startedAt = new Date("2026-08-30T09:00:00.000Z");

/**
 * The state one alarm is reporting.
 */
async function alarmState(simAws: SimAws): Promise<string | undefined> {
  const { MetricAlarms } = await simAws
    .cloudWatch()
    .describeAlarms(new DescribeAlarmsCommand({ AlarmNames: [alarmName] }));

  return MetricAlarms?.at(0)?.StateValue;
}

/**
 * Write one line to the log group and let the filters and the clock catch up.
 */
async function log(simAws: SimAws, message: string): Promise<void> {
  await simAws.logs().putLogEvents(
    new PutLogEventsCommand({
      logGroupName,
      logStreamName,
      logEvents: [{ message, timestamp: simAws.clock().now().getTime() }],
    }),
  );
  await simAws.backgroundTasksComplete();
}

describe("an alarm over a metric a CloudWatch Logs metric filter writes", () => {
  it("fires when the log lines it counts arrive", async () => {
    // Given a log group whose metric filter counts ERROR lines into
    // Orders/HandlerErrors, and an alarm watching that metric.
    const simAws = new SimAws();

    await simAws.clock().setTo(startedAt);

    const topic = await simAws
      .sns()
      .createTopic(new CreateTopicCommand({ Name: "orders-alerts" }));

    assertNonNullable(topic.TopicArn);

    await simAws
      .logs()
      .createLogGroup(new CreateLogGroupCommand({ logGroupName }));
    await simAws
      .logs()
      .createLogStream(
        new CreateLogStreamCommand({ logGroupName, logStreamName }),
      );
    await simAws.logs().putMetricFilter(
      new PutMetricFilterCommand({
        logGroupName,
        filterName: "handler-errors",
        filterPattern: "ERROR",
        metricTransformations: [
          {
            metricNamespace: "Orders",
            metricName: "HandlerErrors",
            metricValue: "1",
          },
        ],
      }),
    );
    await simAws.cloudWatch().putMetricAlarm(
      new PutMetricAlarmCommand({
        AlarmName: alarmName,
        Namespace: "Orders",
        MetricName: "HandlerErrors",
        Statistic: "Sum",
        Period: 60,
        EvaluationPeriods: 3,
        DatapointsToAlarm: 1,
        Threshold: 0,
        ComparisonOperator: "GreaterThanThreshold",
        TreatMissingData: "notBreaching",
        AlarmActions: [topic.TopicArn],
      }),
    );

    // Then it starts out with nothing to read.
    assertIdentical(await alarmState(simAws), "INSUFFICIENT_DATA");

    // And log lines it does not match leave it healthy, because a filter that
    // matched nothing publishes nothing and the alarm treats that as fine.
    await log(simAws, "INFO order handled");
    await simAws.clock().advanceBy({ minutes: 4 });

    assertIdentical(await alarmState(simAws), "OK");

    // When a line it does match is written, and the clock passes the period.
    await log(simAws, "ERROR order failed");
    await simAws.clock().advanceBy({ minutes: 2 });

    // Then the alarm fired on a datapoint nothing published by hand, and it
    // reached its topic.
    assertIdentical(await alarmState(simAws), "ALARM");
    assertArrayLength(simAws.cloudWatch().alarmActionFailures, 0);
    assertArrayLength(simAws.logs().metricFilterFailures, 0);
  });
});
