/**
 * Reading a Powertools style metric out of what a handler printed.
 */

import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const logGroupName = "/aws/lambda/user";
const logStreamName = "2026/08/30/[$LATEST]0f7c1a";
const startedAt = new Date("2026-08-30T09:00:00Z");

await simAws.clock().setTo(startedAt);
await simAws.logs().createLogGroup(new CreateLogGroupCommand({ logGroupName }));
await simAws
  .logs()
  .createLogStream(new CreateLogStreamCommand({ logGroupName, logStreamName }));

// The document Powertools writes to stdout. The metadata names the namespace,
// the dimension set and the metric, and the body carries the values.
const document = JSON.stringify({
  _aws: {
    Timestamp: startedAt.getTime(),
    CloudWatchMetrics: [
      {
        Namespace: "ChineseBoost",
        Dimensions: [["service"]],
        Metrics: [{ Name: "UserRequestFailed", Unit: "Count" }],
      },
    ],
  },
  service: "user",
  UserRequestFailed: 1,
});

await simAws.logs().putLogEvents(
  new PutLogEventsCommand({
    logGroupName,
    logStreamName,
    logEvents: [{ timestamp: startedAt.getTime(), message: document }],
  }),
);

await simAws.backgroundTasksComplete();

const statistics = new GetMetricStatisticsCommand({
  Namespace: "ChineseBoost",
  MetricName: "UserRequestFailed",
  Dimensions: [{ Name: "service", Value: "user" }],
  StartTime: startedAt,
  EndTime: new Date(startedAt.getTime() + 300_000),
  Period: 300,
  Statistics: ["Sum"],
});
const counted = await simAws.cloudWatch().getMetricStatistics(statistics);

// 1. The metric came out of the log line, with nothing calling PutMetricData.
console.log(counted.Datapoints?.[0]?.Sum);
