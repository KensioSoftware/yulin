import {
  GetMetricDataCommand,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import {
  SimCloudWatchInvalidParameterValueException,
  SimCloudWatchMissingRequiredParameterException,
} from "./error/sim-cloudwatch.error.js";
import type { SimCloudWatch } from "./sim-cloudwatch.js";

const window = {
  StartTime: new Date("2026-08-16T09:00:00.000Z"),
  EndTime: new Date("2026-08-16T09:03:00.000Z"),
};

/**
 * A simulated CloudWatch holding one failure in each of three minutes, and one
 * retry in the first of them.
 */
async function withThreeMinutes(): Promise<SimCloudWatch> {
  const metrics = new SimAws().cloudWatch();

  await metrics.putMetricData(
    new PutMetricDataCommand({
      Namespace: "Orders",
      MetricData: [
        {
          MetricName: "Failed",
          Value: 1,
          Timestamp: new Date("2026-08-16T09:00:10.000Z"),
        },
        {
          MetricName: "Failed",
          Value: 2,
          Timestamp: new Date("2026-08-16T09:01:10.000Z"),
        },
        {
          MetricName: "Failed",
          Value: 3,
          Timestamp: new Date("2026-08-16T09:02:10.000Z"),
        },
        {
          MetricName: "Retried",
          Value: 9,
          Timestamp: new Date("2026-08-16T09:00:20.000Z"),
        },
      ],
    }),
  );

  return metrics;
}

const failuresPerMinute = {
  Id: "failed",
  MetricStat: {
    Metric: { Namespace: "Orders", MetricName: "Failed" },
    Period: 60,
    Stat: "Sum",
  },
};

describe("SimCloudWatch GetMetricData", () => {
  it("answers a MetricStat query newest first", async () => {
    // Given three minutes of failures.
    const metrics = await withThreeMinutes();

    // When they are read back.
    const read = await metrics.getMetricData(
      new GetMetricDataCommand({
        MetricDataQueries: [failuresPerMinute],
        ...window,
      }),
    );

    // Then the values come back newest first, as real CloudWatch scans by
    // default, with the timestamps beside them.
    const result = read.MetricDataResults?.at(0);

    assertNonNullable(result);
    assertIdentical(result.Id, "failed");
    assertIdentical(result.Label, "Failed");
    assertIdentical(result.StatusCode, "Complete");
    assertArrayEquals(result.Values, [3, 2, 1]);
    assertArrayEquals(
      result.Timestamps.map((timestamp) => timestamp.toISOString()),
      [
        "2026-08-16T09:02:00.000Z",
        "2026-08-16T09:01:00.000Z",
        "2026-08-16T09:00:00.000Z",
      ],
    );
  });

  it("scans oldest first when asked to", async () => {
    // Given three minutes of failures.
    const metrics = await withThreeMinutes();

    // When they are read back the other way round.
    const read = await metrics.getMetricData(
      new GetMetricDataCommand({
        MetricDataQueries: [failuresPerMinute],
        ScanBy: "TimestampAscending",
        ...window,
      }),
    );

    // Then the values come back oldest first.
    assertArrayEquals(read.MetricDataResults?.at(0)?.Values, [1, 2, 3]);
  });

  it("answers several metrics in one request, and leaves out what a query does not return", async () => {
    // Given two metrics, one of which the request says it does not want back.
    const metrics = await withThreeMinutes();

    // When both are asked for in one request.
    const read = await metrics.getMetricData(
      new GetMetricDataCommand({
        MetricDataQueries: [
          failuresPerMinute,
          {
            Id: "retried",
            Label: "Retries in the window",
            MetricStat: {
              Metric: { Namespace: "Orders", MetricName: "Retried" },
              Period: 300,
              Stat: "Maximum",
            },
          },
          { ...failuresPerMinute, Id: "hidden", ReturnData: false },
        ],
        ...window,
      }),
    );

    // Then each returning query gets a result with the label it asked for, and
    // the one that returns no data gets none.
    const retried = read.MetricDataResults?.at(1);

    assertNonNullable(retried);
    assertArrayEquals(
      read.MetricDataResults?.map((result) => result.Id),
      ["failed", "retried"],
    );
    assertIdentical(retried.Label, "Retries in the window");
    assertArrayEquals(retried.Values, [9]);
  });

  it("answers a metric nothing has been written to with no values", async () => {
    // Given a simulated CloudWatch with no metrics at all.
    const metrics = new SimAws().cloudWatch();

    // When one is asked for.
    const read = await metrics.getMetricData(
      new GetMetricDataCommand({
        MetricDataQueries: [failuresPerMinute],
        ...window,
      }),
    );

    // Then there is a result for the query, holding nothing.
    assertArrayLength(read.MetricDataResults ?? [], 1);
    assertArrayEmpty(read.MetricDataResults?.at(0)?.Values ?? []);
  });

  it("refuses metric math rather than answering from one of its metrics", async () => {
    // Given three minutes of failures.
    const metrics = await withThreeMinutes();

    // When an expression, a repeated id and a query with no MetricStat are
    // asked for.
    const expression = await assertThrowsErrorAsync(
      async () =>
        await metrics.getMetricData(
          new GetMetricDataCommand({
            MetricDataQueries: [
              failuresPerMinute,
              { Id: "rate", Expression: "failed / 60" },
            ],
            ...window,
          }),
        ),
    );
    const repeated = await assertThrowsErrorAsync(
      async () =>
        await metrics.getMetricData(
          new GetMetricDataCommand({
            MetricDataQueries: [failuresPerMinute, failuresPerMinute],
            ...window,
          }),
        ),
    );
    const bare = await assertThrowsErrorAsync(
      async () =>
        await metrics.getMetricData(
          new GetMetricDataCommand({
            MetricDataQueries: [{ Id: "failed" }],
            ...window,
          }),
        ),
    );

    // Then each is refused rather than answered with a number the request did
    // not ask for.
    assertInstanceOf(expression, SimCloudWatchInvalidParameterValueException);
    assertInstanceOf(repeated, SimCloudWatchInvalidParameterValueException);
    assertInstanceOf(bare, SimCloudWatchMissingRequiredParameterException);
  });

  it("refuses a MaxDatapoints it would not honour", async () => {
    // Given three minutes of failures.
    const metrics = await withThreeMinutes();

    // When a maximum number of datapoints is asked for.
    const error = await assertThrowsErrorAsync(
      async () =>
        await metrics.getMetricData(
          new GetMetricDataCommand({
            MetricDataQueries: [failuresPerMinute],
            MaxDatapoints: 2,
            ...window,
          }),
        ),
    );

    // Then it says so, rather than returning the period the query asked for as
    // though it had widened it.
    assertInstanceOf(error, SimCloudWatchInvalidParameterValueException);
  });

  it("refuses a query id and a scan order real CloudWatch would refuse", async () => {
    // Given three minutes of failures.
    const metrics = await withThreeMinutes();

    // When a query with no id, one whose id does not start with a lower-case
    // letter, one with no Stat, and an unknown scan order are asked for.
    const noId = await assertThrowsErrorAsync(
      async () =>
        await metrics.getMetricData({
          input: { MetricDataQueries: [{ MetricStat: {} }], ...window },
        }),
    );
    const badId = await assertThrowsErrorAsync(
      async () =>
        await metrics.getMetricData(
          new GetMetricDataCommand({
            MetricDataQueries: [{ ...failuresPerMinute, Id: "Failed" }],
            ...window,
          }),
        ),
    );
    const noStat = await assertThrowsErrorAsync(
      async () =>
        await metrics.getMetricData({
          input: {
            MetricDataQueries: [
              {
                Id: "failed",
                MetricStat: {
                  Metric: { Namespace: "Orders", MetricName: "Failed" },
                  Period: 60,
                },
              },
            ],
            ...window,
          },
        }),
    );
    const scanBy = await assertThrowsErrorAsync(
      async () =>
        await metrics.getMetricData({
          input: {
            MetricDataQueries: [failuresPerMinute],
            ScanBy: "Alphabetical",
            ...window,
          },
        }),
    );

    // Then each is refused.
    assertInstanceOf(noId, SimCloudWatchMissingRequiredParameterException);
    assertInstanceOf(badId, SimCloudWatchInvalidParameterValueException);
    assertInstanceOf(noStat, SimCloudWatchMissingRequiredParameterException);
    assertInstanceOf(scanBy, SimCloudWatchInvalidParameterValueException);
  });

  it("refuses a request carrying no queries, and a token it never issued", async () => {
    // Given three minutes of failures.
    const metrics = await withThreeMinutes();

    // When a request carries no queries, and another carries a next token.
    const none = await assertThrowsErrorAsync(
      async () =>
        await metrics.getMetricData(
          new GetMetricDataCommand({ MetricDataQueries: [], ...window }),
        ),
    );
    const token = await assertThrowsErrorAsync(
      async () =>
        await metrics.getMetricData(
          new GetMetricDataCommand({
            MetricDataQueries: [failuresPerMinute],
            NextToken: "10",
            ...window,
          }),
        ),
    );

    // Then each is refused: every query here is answered in full, so no token
    // is ever issued to come back with.
    assertInstanceOf(none, SimCloudWatchMissingRequiredParameterException);
    assertInstanceOf(token, SimCloudWatchInvalidParameterValueException);
  });
});
