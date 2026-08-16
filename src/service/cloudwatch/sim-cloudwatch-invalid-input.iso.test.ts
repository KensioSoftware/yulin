import {
  assertArrayLength,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import type {
  SimCloudWatchMetricDatumInput,
  SimGetMetricStatisticsCommandInput,
} from "./command/sim-cloudwatch-command.types.js";
import {
  SimCloudWatchInvalidParameterCombinationException,
  SimCloudWatchInvalidParameterValueException,
  SimCloudWatchMissingRequiredParameterException,
} from "./error/sim-cloudwatch.error.js";
import { simCloudWatchMaximumNameLength } from "./metric/sim-cloudwatch-name.js";

/**
 * These requests are built as plain command shapes rather than through the SDK
 * command classes, because the SDK's own types refuse most of them outright: a
 * MetricDatum without a MetricName does not compile. That makes these the
 * requests reaching the simulator from JavaScript, or from a client that types
 * its input more loosely than the SDK does.
 */
const window = {
  StartTime: new Date("2026-08-16T09:00:00.000Z"),
  EndTime: new Date("2026-08-16T09:15:00.000Z"),
};

/**
 * Publish one batch of data, whatever shape the test wants to give it.
 */
async function publishing(
  MetricData: readonly SimCloudWatchMetricDatumInput[],
  Namespace = "Orders",
): Promise<Error> {
  return await assertThrowsErrorAsync(
    async () =>
      await new SimAws()
        .cloudWatch()
        .putMetricData({ input: { Namespace, MetricData } }),
  );
}

/**
 * Read a metric back, whatever shape the test wants to give the request.
 */
async function reading(
  input: SimGetMetricStatisticsCommandInput,
): Promise<Error> {
  return await assertThrowsErrorAsync(
    async () => await new SimAws().cloudWatch().getMetricStatistics({ input }),
  );
}

describe("SimCloudWatch invalid PutMetricData", () => {
  it("refuses a namespace or metric name real CloudWatch would refuse", async () => {
    // Given names outside what real CloudWatch accepts.
    // When each is published.
    const leadingColon = await publishing(
      [{ MetricName: "Failed", Value: 1 }],
      ":Orders",
    );
    const tooLong = await publishing([
      { MetricName: "a".repeat(simCloudWatchMaximumNameLength + 1), Value: 1 },
    ]);
    const controlCharacter = await publishing([
      { MetricName: "Failed\u{7}", Value: 1 },
    ]);
    const allWhitespace = await publishing([{ MetricName: "  ", Value: 1 }]);
    const missing = await publishing([{ Value: 1 }]);

    // Then each is refused for what is wrong with it.
    assertInstanceOf(leadingColon, SimCloudWatchInvalidParameterValueException);
    assertInstanceOf(tooLong, SimCloudWatchInvalidParameterValueException);
    assertInstanceOf(
      controlCharacter,
      SimCloudWatchInvalidParameterValueException,
    );
    assertInstanceOf(
      allWhitespace,
      SimCloudWatchInvalidParameterValueException,
    );
    assertInstanceOf(missing, SimCloudWatchMissingRequiredParameterException);
  });

  it("accepts the punctuation real CloudWatch accepts in a name", async () => {
    // Given names holding punctuation outside the small set a stricter reader
    // might allow, which real CloudWatch takes because it takes any printable
    // ASCII.
    const metrics = new SimAws().cloudWatch();

    // When they are published.
    await metrics.putMetricData({
      input: {
        Namespace: "Orders (web)",
        MetricData: [
          {
            MetricName: "Failed+Retried",
            Value: 1,
            Dimensions: [{ Name: "Channel", Value: "orders@web" }],
          },
        ],
      },
    });

    // Then the metric was recorded rather than refused.
    assertArrayLength(metrics.allMetrics(), 1);
  });

  it("refuses a dimension name that starts with a colon", async () => {
    // Given a dimension name real CloudWatch refuses, and a value with the
    // same leading colon, which it allows.
    const name = await publishing([
      {
        MetricName: "Failed",
        Value: 1,
        Dimensions: [{ Name: ":Channel", Value: "web" }],
      },
    ]);
    const metrics = new SimAws().cloudWatch();

    await metrics.putMetricData({
      input: {
        Namespace: "Orders",
        MetricData: [
          {
            MetricName: "Failed",
            Value: 1,
            Dimensions: [{ Name: "Channel", Value: ":web" }],
          },
        ],
      },
    });

    // Then the name is refused and the value is not: the colon rule is the
    // name's alone.
    assertInstanceOf(name, SimCloudWatchInvalidParameterValueException);
    assertArrayLength(metrics.allMetrics(), 1);
  });

  it("refuses a value outside the range CloudWatch stores", async () => {
    // Given values real CloudWatch will not hold.
    // When each is published.
    const tooLarge = await publishing([
      { MetricName: "Failed", Value: 2 ** 361 },
    ]);
    const notANumber = await publishing([{ MetricName: "Failed", Value: NaN }]);
    const summed = await publishing([
      {
        MetricName: "Failed",
        StatisticValues: {
          SampleCount: 1,
          Sum: Number.MAX_VALUE,
          Minimum: 0,
          Maximum: Number.MAX_VALUE,
        },
      },
    ]);

    // Then each is refused, which is also what keeps a stored total finite: an
    // out-of-range value can never be summed into one.
    assertInstanceOf(tooLarge, SimCloudWatchInvalidParameterValueException);
    assertInstanceOf(notANumber, SimCloudWatchInvalidParameterValueException);
    assertInstanceOf(summed, SimCloudWatchInvalidParameterValueException);
  });

  it("refuses a unit CloudWatch does not have", async () => {
    // Given a unit outside the set real CloudWatch offers.
    // When it is published.
    const error = await publishing([
      { MetricName: "Failed", Value: 1, Unit: "Furlongs" },
    ]);

    // Then it is refused rather than stored as a unit nothing could query.
    assertInstanceOf(error, SimCloudWatchInvalidParameterValueException);
  });

  it("refuses a request carrying no metric data at all", async () => {
    // Given a request with an empty batch.
    // When it is published.
    const empty = await publishing([]);

    // Then it is refused rather than treated as nothing to do.
    assertInstanceOf(empty, SimCloudWatchMissingRequiredParameterException);
  });

  it("refuses a statistic set that could not have been measured", async () => {
    // Given summaries that do not describe a real set of observations.
    // When each is published.
    const noSamples = await publishing([
      {
        MetricName: "Latency",
        StatisticValues: { SampleCount: 0, Sum: 0, Minimum: 0, Maximum: 0 },
      },
    ]);
    const inverted = await publishing([
      {
        MetricName: "Latency",
        StatisticValues: { SampleCount: 2, Sum: 30, Minimum: 40, Maximum: 10 },
      },
    ]);
    const incomplete = await publishing([
      { MetricName: "Latency", StatisticValues: { SampleCount: 2, Sum: 30 } },
    ]);

    // Then each is refused: a summary of no observations, one whose extremes
    // are the wrong way round, and one missing a half of itself.
    assertInstanceOf(noSamples, SimCloudWatchInvalidParameterValueException);
    assertInstanceOf(inverted, SimCloudWatchInvalidParameterValueException);
    assertInstanceOf(
      incomplete,
      SimCloudWatchMissingRequiredParameterException,
    );
  });

  it("refuses values that do not line up with their counts", async () => {
    // Given weighted values that do not describe a real set of observations.
    // When each is published.
    const empty = await publishing([{ MetricName: "Size", Values: [] }]);
    const countsAlone = await publishing([
      { MetricName: "Size", Counts: [1, 2] },
    ]);
    const tooManyValues = await publishing([
      {
        MetricName: "Size",
        Values: Array.from({ length: 151 }, (_, index) => index + 1),
      },
    ]);
    const mismatched = await publishing([
      { MetricName: "Size", Values: [1, 2], Counts: [1] },
    ]);
    const zeroCount = await publishing([
      { MetricName: "Size", Values: [1, 2], Counts: [1, 0] },
    ]);

    // Then each is refused, including counts given with nothing to count,
    // which describe nothing on their own.
    assertInstanceOf(empty, SimCloudWatchInvalidParameterValueException);
    assertInstanceOf(
      countsAlone,
      SimCloudWatchInvalidParameterCombinationException,
    );
    assertInstanceOf(
      tooManyValues,
      SimCloudWatchInvalidParameterValueException,
    );
    assertInstanceOf(
      mismatched,
      SimCloudWatchInvalidParameterCombinationException,
    );
    assertInstanceOf(zeroCount, SimCloudWatchInvalidParameterValueException);
  });

  it("refuses a batch larger than one request may carry", async () => {
    // Given one datum more than real CloudWatch takes in a request.
    const tooMany = Array.from({ length: 1001 }, (_, index) => ({
      MetricName: "Failed",
      Value: 1,
      Dimensions: [{ Name: "Shard", Value: String(index) }],
    }));

    // When it is published.
    const error = await publishing(tooMany);

    // Then the whole batch is refused.
    assertInstanceOf(error, SimCloudWatchInvalidParameterValueException);
  });
});

describe("SimCloudWatch invalid GetMetricStatistics", () => {
  const metric = { Namespace: "Orders", MetricName: "Failed" };

  it("refuses a window that is not a window", async () => {
    // Given times that do not describe one.
    // When each is read.
    const noStart = await reading({
      ...metric,
      Statistics: ["Sum"],
      Period: 60,
      EndTime: window.EndTime,
    });
    const backwards = await reading({
      ...metric,
      Statistics: ["Sum"],
      Period: 60,
      StartTime: window.EndTime,
      EndTime: window.StartTime,
    });
    const notADate = await reading({
      ...metric,
      Statistics: ["Sum"],
      Period: 60,
      StartTime: window.StartTime,
      EndTime: new Date("not a date"),
    });

    // Then each is refused.
    assertInstanceOf(noStart, SimCloudWatchMissingRequiredParameterException);
    assertInstanceOf(backwards, SimCloudWatchInvalidParameterValueException);
    assertInstanceOf(notADate, SimCloudWatchInvalidParameterValueException);
  });

  it("refuses a period and a statistic it cannot answer", async () => {
    // Given a period that is not whole minutes, a missing period, no
    // statistics at all, and a statistic CloudWatch does not offer.
    // When each is read.
    const partMinute = await reading({
      ...metric,
      ...window,
      Statistics: ["Sum"],
      Period: 90,
    });
    const noPeriod = await reading({
      ...metric,
      ...window,
      Statistics: ["Sum"],
    });
    const noStatistics = await reading({ ...metric, ...window, Period: 60 });
    const unknown = await reading({
      ...metric,
      ...window,
      Statistics: ["Median"],
      Period: 60,
    });

    // Then each is refused.
    assertInstanceOf(partMinute, SimCloudWatchInvalidParameterValueException);
    assertInstanceOf(noPeriod, SimCloudWatchMissingRequiredParameterException);
    assertInstanceOf(
      noStatistics,
      SimCloudWatchMissingRequiredParameterException,
    );
    assertInstanceOf(unknown, SimCloudWatchInvalidParameterValueException);
  });

  it("refuses a unit CloudWatch does not have before looking the metric up", async () => {
    // Given a simulated CloudWatch holding no metrics at all, so a lookup
    // would answer with nothing whatever unit was asked for.
    // When one outside the set real CloudWatch offers is asked for.
    const error = await reading({
      ...metric,
      ...window,
      Statistics: ["Sum"],
      Period: 60,
      Unit: "Furlongs",
    });

    // Then it is refused rather than answered with an empty success, which is
    // what an account would do.
    assertInstanceOf(error, SimCloudWatchInvalidParameterValueException);
  });
});
