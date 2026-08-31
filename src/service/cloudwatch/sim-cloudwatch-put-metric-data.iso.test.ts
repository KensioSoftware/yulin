import {
  GetMetricStatisticsCommand,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  assertArrayEmpty,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../util/clock/sim-clock.js";
import { SimAws } from "../aws/sim-aws.js";
import {
  SimCloudWatchInvalidParameterCombinationException,
  SimCloudWatchInvalidParameterValueException,
  SimCloudWatchMissingRequiredParameterException,
} from "./error/sim-cloudwatch.error.js";
import type { SimCloudWatch } from "./sim-cloudwatch.js";

const publishedAt = new Date("2026-08-16T09:00:30.000Z");
const window = {
  StartTime: new Date("2026-08-16T09:00:00.000Z"),
  EndTime: new Date("2026-08-16T09:01:00.000Z"),
  Period: 60,
};

/**
 * A simulated CloudWatch whose clock is stopped inside one minute.
 */
function cloudWatch(): SimCloudWatch {
  return new SimAws({ clock: new SimFixedClock(publishedAt) }).cloudWatch();
}

describe("SimCloudWatch PutMetricData", () => {
  it("records a plain value and reads it back as statistics", async () => {
    // Given a simulated CloudWatch.
    const metrics = cloudWatch();

    // When a single value is published and the metric is read back.
    await metrics.putMetricData(
      new PutMetricDataCommand({
        Namespace: "Orders",
        MetricData: [{ MetricName: "Failed", Value: 3, Unit: "Count" }],
      }),
    );
    const read = await metrics.getMetricStatistics(
      new GetMetricStatisticsCommand({
        Namespace: "Orders",
        MetricName: "Failed",
        Statistics: ["SampleCount", "Sum", "Average", "Minimum", "Maximum"],
        ...window,
      }),
    );

    // Then every statistic is answered from that one observation.
    const datapoint = read.Datapoints?.at(0);

    assertNonNullable(datapoint);
    assertIdentical(datapoint.SampleCount, 1);
    assertIdentical(datapoint.Sum, 3);
    assertIdentical(datapoint.Average, 3);
    assertIdentical(datapoint.Minimum, 3);
    assertIdentical(datapoint.Maximum, 3);
    assertIdentical(datapoint.Unit, "Count");
    assertIdentical(read.Label, "Failed");
  });

  it("stamps a datum carrying no timestamp from the simulation's clock", async () => {
    // Given a simulated CloudWatch whose clock is stopped part-way through a
    // minute.
    const metrics = cloudWatch();

    // When a datum with no Timestamp is published.
    await metrics.putMetricData(
      new PutMetricDataCommand({
        Namespace: "Orders",
        MetricData: [{ MetricName: "Failed", Value: 1 }],
      }),
    );

    // Then it was stamped from the simulation's clock rather than the host's.
    const metric = metrics.allMetrics().at(0);

    assertNonNullable(metric);
    assertIdentical(metric.datapoints.at(0)?.timestamp, publishedAt.getTime());
  });

  it("summarises a statistic set and a set of values with counts", async () => {
    // Given a simulated CloudWatch.
    const metrics = cloudWatch();

    // When one metric is published as a summary and another as weighted
    // values.
    await metrics.putMetricData(
      new PutMetricDataCommand({
        Namespace: "Orders",
        MetricData: [
          {
            MetricName: "Latency",
            StatisticValues: {
              SampleCount: 4,
              Sum: 100,
              Minimum: 10,
              Maximum: 40,
            },
          },
          { MetricName: "Size", Values: [2, 5], Counts: [3, 1] },
        ],
      }),
    );

    const summarised = await metrics.getMetricStatistics(
      new GetMetricStatisticsCommand({
        Namespace: "Orders",
        MetricName: "Latency",
        Statistics: ["Average", "Minimum", "Maximum"],
        ...window,
      }),
    );
    const weighted = await metrics.getMetricStatistics(
      new GetMetricStatisticsCommand({
        Namespace: "Orders",
        MetricName: "Size",
        Statistics: ["SampleCount", "Sum"],
        ...window,
      }),
    );

    // Then both forms answer the statistics they describe.
    const latency = summarised.Datapoints?.at(0);
    const size = weighted.Datapoints?.at(0);

    assertNonNullable(latency);
    assertNonNullable(size);
    assertIdentical(latency.Average, 25);
    assertIdentical(latency.Minimum, 10);
    assertIdentical(latency.Maximum, 40);
    assertIdentical(size.SampleCount, 4);
    assertIdentical(size.Sum, 11);
  });

  it("refuses to publish into a namespace AWS reserves", async () => {
    // Given a simulated CloudWatch.
    const metrics = cloudWatch();

    // When a datum is published into an AWS namespace.
    const error = await assertThrowsErrorAsync(
      async () =>
        await metrics.putMetricData(
          new PutMetricDataCommand({
            Namespace: "AWS/Lambda",
            MetricData: [{ MetricName: "Invocations", Value: 1 }],
          }),
        ),
    );

    // Then it is refused, as real CloudWatch refuses it.
    assertInstanceOf(error, SimCloudWatchInvalidParameterValueException);
    assertIdentical(error.name, "InvalidParameterValueException");
    assertArrayEmpty(metrics.allMetrics());
  });

  it("refuses a datum stating its values in no way, or in two", async () => {
    // Given a simulated CloudWatch.
    const metrics = cloudWatch();

    // When a datum carries neither a value nor a summary, and another carries
    // both.
    const neither = await assertThrowsErrorAsync(
      async () =>
        await metrics.putMetricData(
          new PutMetricDataCommand({
            Namespace: "Orders",
            MetricData: [{ MetricName: "Failed" }],
          }),
        ),
    );
    const both = await assertThrowsErrorAsync(
      async () =>
        await metrics.putMetricData(
          new PutMetricDataCommand({
            Namespace: "Orders",
            MetricData: [{ MetricName: "Failed", Value: 1, Values: [1, 2] }],
          }),
        ),
    );

    // Then each is refused for the reason real CloudWatch gives.
    assertInstanceOf(neither, SimCloudWatchMissingRequiredParameterException);
    assertInstanceOf(both, SimCloudWatchInvalidParameterCombinationException);
  });

  it("refuses a high-resolution metric rather than storing it as standard", async () => {
    // Given a simulated CloudWatch.
    const metrics = cloudWatch();

    // When a datum asks for one second storage resolution.
    const error = await assertThrowsErrorAsync(
      async () =>
        await metrics.putMetricData(
          new PutMetricDataCommand({
            Namespace: "Orders",
            MetricData: [
              { MetricName: "Failed", Value: 1, StorageResolution: 1 },
            ],
          }),
        ),
    );

    // Then it says so rather than storing it at a resolution it does not have.
    assertInstanceOf(error, SimCloudWatchInvalidParameterValueException);
  });

  it("records nothing at all when one datum in a request is refused", async () => {
    // Given a simulated CloudWatch.
    const metrics = cloudWatch();

    // When a request carries a good datum and a bad one.
    await assertThrowsErrorAsync(
      async () =>
        await metrics.putMetricData(
          new PutMetricDataCommand({
            Namespace: "Orders",
            MetricData: [
              { MetricName: "Failed", Value: 1 },
              { MetricName: "Failed", Value: NaN },
            ],
          }),
        ),
    );

    // Then neither was stored, as real CloudWatch validates the whole request.
    assertArrayEmpty(metrics.allMetrics());
  });

  it("counts each value once when a datum lists values without counts", async () => {
    // Given values published with no Counts beside them.
    const metrics = cloudWatch();

    await metrics.putMetricData(
      new PutMetricDataCommand({
        Namespace: "Orders",
        MetricData: [{ MetricName: "Size", Values: [2, 5, 5] }],
      }),
    );

    // When the metric is read back.
    const read = await metrics.getMetricStatistics(
      new GetMetricStatisticsCommand({
        Namespace: "Orders",
        MetricName: "Size",
        Statistics: ["SampleCount", "Sum", "Maximum"],
        ...window,
      }),
    );

    // Then each value counted once, including the one listed twice.
    const datapoint = read.Datapoints?.at(0);

    assertNonNullable(datapoint);
    assertIdentical(datapoint.SampleCount, 3);
    assertIdentical(datapoint.Sum, 12);
    assertIdentical(datapoint.Maximum, 5);
  });
});
