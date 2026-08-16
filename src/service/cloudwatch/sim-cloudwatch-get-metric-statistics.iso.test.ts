import {
  GetMetricStatisticsCommand,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import {
  SimCloudWatchInvalidParameterCombinationException,
  SimCloudWatchInvalidParameterValueException,
} from "./error/sim-cloudwatch.error.js";
import type { SimCloudWatch } from "./sim-cloudwatch.js";

const namespace = "Orders";
const metricName = "Failed";

/**
 * A simulated CloudWatch holding one value of `Orders`/`Failed` at each of the
 * instants given.
 */
async function withValuesAt(
  ...instants: readonly string[]
): Promise<SimCloudWatch> {
  const metrics = new SimAws().cloudWatch();

  await metrics.putMetricData(
    new PutMetricDataCommand({
      Namespace: namespace,
      MetricData: instants.map((instant, index) => ({
        MetricName: metricName,
        Value: index + 1,
        Timestamp: new Date(instant),
      })),
    }),
  );

  return metrics;
}

/**
 * A minute-by-minute read of `Orders`/`Failed` across one quarter of an hour.
 */
async function perMinuteSums(
  metrics: SimCloudWatch,
): Promise<ReturnType<SimCloudWatch["getMetricStatistics"]>> {
  return await metrics.getMetricStatistics(
    new GetMetricStatisticsCommand({
      Namespace: namespace,
      MetricName: metricName,
      Statistics: ["Sum"],
      StartTime: new Date("2026-08-16T09:00:00.000Z"),
      EndTime: new Date("2026-08-16T09:15:00.000Z"),
      Period: 60,
    }),
  );
}

describe("SimCloudWatch GetMetricStatistics", () => {
  it("gathers observations into the period each of them falls in", async () => {
    // Given three observations, two of them inside the same minute.
    const metrics = await withValuesAt(
      "2026-08-16T09:00:10.000Z",
      "2026-08-16T09:00:50.000Z",
      "2026-08-16T09:01:30.000Z",
    );

    // When they are read a minute at a time.
    const read = await perMinuteSums(metrics);

    // Then there is one datapoint per minute holding observations, stamped
    // with the start of that minute rather than with any observation's time.
    const datapoints = read.Datapoints ?? [];

    assertArrayEquals(
      datapoints.map((datapoint) => datapoint.Timestamp.toISOString()),
      ["2026-08-16T09:00:00.000Z", "2026-08-16T09:01:00.000Z"],
    );
    assertArrayEquals(
      datapoints.map((datapoint) => datapoint.Sum),
      [3, 3],
    );
  });

  it("reports only the statistics the request asked for", async () => {
    // Given one observation.
    const metrics = await withValuesAt("2026-08-16T09:00:10.000Z");

    // When only the sum is asked for.
    const read = await perMinuteSums(metrics);

    // Then nothing else is reported beside it.
    const datapoint = read.Datapoints?.at(0);

    assertNonNullable(datapoint);
    assertIdentical(datapoint.Sum, 1);
    assertUndefined(datapoint.Average);
    assertUndefined(datapoint.SampleCount);
  });

  it("leaves out a period nothing was written into", async () => {
    // Given observations either side of an idle minute.
    const metrics = await withValuesAt(
      "2026-08-16T09:00:10.000Z",
      "2026-08-16T09:02:10.000Z",
    );

    // When the three minutes are read.
    const read = await perMinuteSums(metrics);

    // Then the idle minute has no datapoint rather than a zeroed one.
    assertArrayLength(read.Datapoints ?? [], 2);
  });

  it("includes the start of the window and excludes its end", async () => {
    // Given observations on each boundary of a window.
    const metrics = await withValuesAt(
      "2026-08-16T09:00:00.000Z",
      "2026-08-16T09:15:00.000Z",
    );

    // When the window is read.
    const read = await perMinuteSums(metrics);

    // Then only the one at the start is in it, as real CloudWatch reads an end
    // time exclusively.
    assertArrayEquals(
      read.Datapoints?.map((datapoint) => datapoint.Timestamp.toISOString()),
      ["2026-08-16T09:00:00.000Z"],
    );
  });

  it("answers for a metric nothing has been written to", async () => {
    // Given a simulated CloudWatch with no metrics at all.
    const metrics = new SimAws().cloudWatch();

    // When a metric is read.
    const read = await perMinuteSums(metrics);

    // Then it answers with no datapoints rather than failing, since a metric
    // only exists on real CloudWatch once something publishes to it.
    assertArrayLength(read.Datapoints ?? [], 0);
  });

  it("refuses a period, a statistic and a range real CloudWatch would refuse", async () => {
    // Given one observation.
    const metrics = await withValuesAt("2026-08-16T09:00:10.000Z");
    const request = {
      Namespace: namespace,
      MetricName: metricName,
      StartTime: new Date("2026-08-16T09:00:00.000Z"),
      EndTime: new Date("2026-08-16T09:15:00.000Z"),
    };

    // When a sub-minute period, a percentile and a range covering more
    // datapoints than one response holds are asked for.
    const period = await assertThrowsErrorAsync(
      async () =>
        await metrics.getMetricStatistics(
          new GetMetricStatisticsCommand({
            ...request,
            Statistics: ["Sum"],
            Period: 30,
          }),
        ),
    );
    const percentile = await assertThrowsErrorAsync(
      async () =>
        await metrics.getMetricStatistics(
          new GetMetricStatisticsCommand({
            ...request,
            ExtendedStatistics: ["p99"],
            Period: 60,
          }),
        ),
    );
    const tooMany = await assertThrowsErrorAsync(
      async () =>
        await metrics.getMetricStatistics(
          new GetMetricStatisticsCommand({
            ...request,
            EndTime: new Date("2026-08-18T09:00:00.000Z"),
            Statistics: ["Sum"],
            Period: 60,
          }),
        ),
    );

    // Then each is refused, and the range for the reason real CloudWatch gives.
    assertInstanceOf(period, SimCloudWatchInvalidParameterValueException);
    assertInstanceOf(percentile, SimCloudWatchInvalidParameterValueException);
    assertInstanceOf(
      tooMany,
      SimCloudWatchInvalidParameterCombinationException,
    );
  });

  it("reads only the values recorded in the unit asked for", async () => {
    // Given the same metric published in two units, which real CloudWatch
    // keeps apart within one metric.
    const metrics = new SimAws().cloudWatch();

    await metrics.putMetricData(
      new PutMetricDataCommand({
        Namespace: namespace,
        MetricData: [
          {
            MetricName: metricName,
            Value: 3,
            Unit: "Count",
            Timestamp: new Date("2026-08-16T09:00:10.000Z"),
          },
          {
            MetricName: metricName,
            Value: 500,
            Unit: "Milliseconds",
            Timestamp: new Date("2026-08-16T09:00:20.000Z"),
          },
        ],
      }),
    );

    // When one unit is named, and then neither.
    const counted = await metrics.getMetricStatistics(
      new GetMetricStatisticsCommand({
        Namespace: namespace,
        MetricName: metricName,
        Statistics: ["Sum"],
        Unit: "Count",
        StartTime: new Date("2026-08-16T09:00:00.000Z"),
        EndTime: new Date("2026-08-16T09:15:00.000Z"),
        Period: 900,
      }),
    );
    const both = await perMinuteSums(metrics);

    // Then the filtered read sees only its own unit, and the unfiltered read
    // sees everything written to the metric.
    assertIdentical(counted.Datapoints?.at(0)?.Sum, 3);
    assertIdentical(both.Datapoints?.at(0)?.Sum, 503);
  });
});
