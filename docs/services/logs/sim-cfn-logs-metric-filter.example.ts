/**
 * Deploying a metric filter and an alarm over the metric it writes.
 */

import { DescribeAlarmsCommand } from "@aws-sdk/client-cloudwatch";
import {
  CreateLogStreamCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/30/[$LATEST]0f7c1a";

await simAws.clock().setTo(new Date("2026-08-30T09:00:00Z"));

await simAws.cloudFormation().deployTemplate({
  stackName: "orders",
  template: {
    Resources: {
      OrdersLogs: {
        Type: "AWS::Logs::LogGroup",
        Properties: { LogGroupName: logGroupName },
      },
      OrdersErrors: {
        Type: "AWS::Logs::MetricFilter",
        Properties: {
          LogGroupName: { Ref: "OrdersLogs" },
          FilterName: "handler-errors",
          FilterPattern: "ERROR",
          MetricTransformations: [
            {
              MetricNamespace: "Orders",
              MetricName: "HandlerErrors",
              MetricValue: "1",
              Dimensions: [{ Key: "service", Value: "orders" }],
            },
          ],
        },
      },
      OrdersFailing: {
        Type: "AWS::CloudWatch::Alarm",
        Properties: {
          AlarmName: "OrdersFailing",
          Namespace: "Orders",
          MetricName: "HandlerErrors",
          Dimensions: [{ Name: "service", Value: "orders" }],
          Statistic: "Sum",
          Period: 60,
          EvaluationPeriods: 3,
          DatapointsToAlarm: 1,
          Threshold: 0,
          ComparisonOperator: "GreaterThanThreshold",
          TreatMissingData: "notBreaching",
        },
      },
    },
  },
});

await simAws
  .logs()
  .createLogStream(new CreateLogStreamCommand({ logGroupName, logStreamName }));
await simAws.logs().putLogEvents(
  new PutLogEventsCommand({
    logGroupName,
    logStreamName,
    logEvents: [
      {
        timestamp: simAws.clock().now().getTime(),
        message: "ERROR order has no items",
      },
    ],
  }),
);

await simAws.backgroundTasksComplete();
await simAws.clock().advanceBy({ minutes: 2 });

const { MetricAlarms } = await simAws
  .cloudWatch()
  .describeAlarms(new DescribeAlarmsCommand({ AlarmNames: ["OrdersFailing"] }));

// ALARM. One log line drove it, with nothing publishing a metric by hand.
console.log(MetricAlarms?.[0]?.StateValue);
