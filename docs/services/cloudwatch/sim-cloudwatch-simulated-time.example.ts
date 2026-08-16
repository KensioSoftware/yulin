/**
 * Publishing metrics across simulated minutes, and reading a value per minute.
 */

import {
  GetMetricDataCommand,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const metrics = simAws.cloudWatch();
const startedAt = new Date("2026-08-16T09:00:00.000Z");

await simAws.clock().setTo(startedAt);

// Three failures, one a minute, without waiting three real minutes.
for (let minute = 0; minute < 3; minute++) {
  await metrics.putMetricData(
    new PutMetricDataCommand({
      Namespace: "Orders",
      MetricData: [{ MetricName: "Failed", Value: 1 }],
    }),
  );
  await simAws.clock().advanceBy({ minutes: 1 });
}

const read = await metrics.getMetricData(
  new GetMetricDataCommand({
    MetricDataQueries: [
      {
        Id: "failed",
        MetricStat: {
          Metric: { Namespace: "Orders", MetricName: "Failed" },
          Period: 60,
          Stat: "Sum",
        },
      },
    ],
    StartTime: startedAt,
    EndTime: new Date("2026-08-16T09:03:00.000Z"),
    ScanBy: "TimestampAscending",
  }),
);

// [1, 1, 1]: one failure in each of the three simulated minutes.
console.log(read.MetricDataResults?.at(0)?.Values);
