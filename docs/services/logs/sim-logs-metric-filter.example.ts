/**
 * Counting matching log lines into a CloudWatch metric.
 */

import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  PutMetricFilterCommand,
} from "@aws-sdk/client-cloudwatch-logs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/30/[$LATEST]0f7c1a";
const startedAt = new Date("2026-08-30T09:00:00Z");

await simAws.clock().setTo(startedAt);
await simAws.logs().createLogGroup(new CreateLogGroupCommand({ logGroupName }));
await simAws
  .logs()
  .createLogStream(new CreateLogStreamCommand({ logGroupName, logStreamName }));

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
        unit: "Count",
      },
    ],
  }),
);

await simAws.logs().putLogEvents(
  new PutLogEventsCommand({
    logGroupName,
    logStreamName,
    logEvents: [
      { timestamp: startedAt.getTime(), message: "INFO starting" },
      { timestamp: startedAt.getTime(), message: "ERROR order has no items" },
    ],
  }),
);

// Publication happens after the write is answered, as it does in an account.
await simAws.backgroundTasksComplete();

const statistics = new GetMetricStatisticsCommand({
  Namespace: "Orders",
  MetricName: "HandlerErrors",
  StartTime: startedAt,
  EndTime: new Date(startedAt.getTime() + 60_000),
  Period: 60,
  Statistics: ["Sum"],
});
const counted = await simAws.cloudWatch().getMetricStatistics(statistics);

// 1. The ERROR line counted and the INFO line did not.
console.log(counted.Datapoints?.[0]?.Sum);
