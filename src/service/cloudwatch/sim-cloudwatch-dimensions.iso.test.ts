import {
  GetMetricStatisticsCommand,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { SimCloudWatchInvalidParameterValueException } from "./error/sim-cloudwatch.error.js";
import { simCloudWatchMaximumDimensions } from "./metric/sim-cloudwatch-dimension.js";
import type { SimCloudWatch } from "./sim-cloudwatch.js";

const window = {
  StartTime: new Date("2026-08-16T09:00:00.000Z"),
  EndTime: new Date("2026-08-16T09:15:00.000Z"),
  Period: 900,
};
const at = new Date("2026-08-16T09:00:10.000Z");

/**
 * Read the total of `Orders`/`Failed` under exactly the dimensions given.
 */
async function sumUnder(
  metrics: SimCloudWatch,
  Dimensions: readonly { Name: string; Value: string }[],
): Promise<number | undefined> {
  const read = await metrics.getMetricStatistics(
    new GetMetricStatisticsCommand({
      Namespace: "Orders",
      MetricName: "Failed",
      Dimensions: [...Dimensions],
      Statistics: ["Sum"],
      ...window,
    }),
  );

  return read.Datapoints?.at(0)?.Sum;
}

describe("SimCloudWatch metric dimensions", () => {
  it("treats a different dimension set as a different metric", async () => {
    // Given one metric name published under two channels and once with no
    // dimensions at all.
    const metrics = new SimAws().cloudWatch();

    await metrics.putMetricData(
      new PutMetricDataCommand({
        Namespace: "Orders",
        MetricData: [
          {
            MetricName: "Failed",
            Value: 1,
            Timestamp: at,
            Dimensions: [{ Name: "Channel", Value: "web" }],
          },
          {
            MetricName: "Failed",
            Value: 10,
            Timestamp: at,
            Dimensions: [{ Name: "Channel", Value: "app" }],
          },
          { MetricName: "Failed", Value: 100, Timestamp: at },
        ],
      }),
    );

    // When each dimension set is read back.
    // Then each answers for itself alone: real CloudWatch does not roll a
    // custom metric up across its dimensions, so the undimensioned read gets
    // the undimensioned value rather than the total of all three.
    assertArrayLength(metrics.allMetrics(), 3);
    assertIdentical(
      await sumUnder(metrics, [{ Name: "Channel", Value: "web" }]),
      1,
    );
    assertIdentical(
      await sumUnder(metrics, [{ Name: "Channel", Value: "app" }]),
      10,
    );
    assertIdentical(await sumUnder(metrics, []), 100);
  });

  it("does not mind the order dimensions were given in", async () => {
    // Given a metric published with two dimensions.
    const metrics = new SimAws().cloudWatch();

    await metrics.putMetricData(
      new PutMetricDataCommand({
        Namespace: "Orders",
        MetricData: [
          {
            MetricName: "Failed",
            Value: 7,
            Timestamp: at,
            Dimensions: [
              { Name: "Channel", Value: "web" },
              { Name: "Region", Value: "eu" },
            ],
          },
        ],
      }),
    );

    // When it is read back with those dimensions the other way round.
    const sum = await sumUnder(metrics, [
      { Name: "Region", Value: "eu" },
      { Name: "Channel", Value: "web" },
    ]);

    // Then it is the same metric, as it is on real CloudWatch.
    assertIdentical(sum, 7);
  });

  it("refuses more dimensions than one metric may carry", async () => {
    // Given a datum carrying one dimension more than CloudWatch allows.
    const metrics = new SimAws().cloudWatch();
    const tooMany = Array.from(
      { length: simCloudWatchMaximumDimensions + 1 },
      (_, index) => ({ Name: `Key${index}`, Value: "value" }),
    );

    // When it is published.
    const error = await assertThrowsErrorAsync(
      async () =>
        await metrics.putMetricData(
          new PutMetricDataCommand({
            Namespace: "Orders",
            MetricData: [
              { MetricName: "Failed", Value: 1, Dimensions: tooMany },
            ],
          }),
        ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimCloudWatchInvalidParameterValueException);
  });
});
