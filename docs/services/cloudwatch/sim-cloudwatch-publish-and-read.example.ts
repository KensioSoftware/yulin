/**
 * Publishing a custom metric and reading it back as statistics.
 */

import {
  GetMetricStatisticsCommand,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const metrics = simAws.cloudWatch();

await metrics.putMetricData(
  new PutMetricDataCommand({
    Namespace: "Orders",
    MetricData: [
      {
        MetricName: "Failed",
        Value: 1,
        Unit: "Count",
        Timestamp: new Date("2026-08-16T09:00:10.000Z"),
        Dimensions: [{ Name: "Channel", Value: "web" }],
      },
    ],
  }),
);

const read = await metrics.getMetricStatistics(
  new GetMetricStatisticsCommand({
    Namespace: "Orders",
    MetricName: "Failed",
    Dimensions: [{ Name: "Channel", Value: "web" }],
    StartTime: new Date("2026-08-16T09:00:00.000Z"),
    EndTime: new Date("2026-08-16T09:05:00.000Z"),
    Period: 60,
    Statistics: ["Sum", "SampleCount"],
  }),
);

// One datapoint, stamped with the start of the minute the value fell in.
console.log(read.Datapoints?.at(0)?.Sum);
