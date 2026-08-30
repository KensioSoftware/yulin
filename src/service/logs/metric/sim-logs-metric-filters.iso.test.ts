import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  DeleteMetricFilterCommand,
  DescribeLogGroupsCommand,
  DescribeMetricFiltersCommand,
  type MetricTransformation,
  PutLogEventsCommand,
  PutMetricFilterCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimLogsResourceNotFoundException } from "../error/sim-logs.error.js";

const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/30/[$LATEST]abc";

/** A simulation holding one empty log group. */
async function simAwsWithLogGroup(): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws
    .logs()
    .createLogGroup(new CreateLogGroupCommand({ logGroupName }));

  return simAws;
}

/** One transformation counting a match into `Orders`/`HandlerErrors`. */
function countErrors(
  overrides: Partial<MetricTransformation> = {},
): MetricTransformation {
  return {
    metricNamespace: "Orders",
    metricName: "HandlerErrors",
    metricValue: "1",
    ...overrides,
  };
}

describe("sim CloudWatch Logs metric filters", () => {
  it("puts a filter, describes it and deletes it", async () => {
    // Given a log group.
    const simAws = await simAwsWithLogGroup();

    // When a metric filter is put on it.
    await simAws.logs().putMetricFilter(
      new PutMetricFilterCommand({
        logGroupName,
        filterName: "handler-errors",
        filterPattern: "ERROR",
        metricTransformations: [countErrors()],
      }),
    );

    // Then it comes back with what it was put with.
    const { metricFilters } = await simAws
      .logs()
      .describeMetricFilters(
        new DescribeMetricFiltersCommand({ logGroupName }),
      );
    const filter = metricFilters?.at(0);

    assertNonNullable(filter);
    assertIdentical(filter.filterName, "handler-errors");
    assertIdentical(filter.logGroupName, logGroupName);
    assertIdentical(filter.filterPattern, "ERROR");
    assertIdentical(
      filter.metricTransformations.at(0)?.metricName,
      "HandlerErrors",
    );

    // And deleting it takes it off the group.
    await simAws.logs().deleteMetricFilter(
      new DeleteMetricFilterCommand({
        logGroupName,
        filterName: "handler-errors",
      }),
    );

    const { metricFilters: remaining } = await simAws
      .logs()
      .describeMetricFilters(
        new DescribeMetricFiltersCommand({ logGroupName }),
      );

    assertArrayLength(remaining ?? [], 0);
  });

  it("reports how many filters a log group has", async () => {
    // Given a log group with no metric filter on it.
    const simAws = await simAwsWithLogGroup();
    const described = async (): Promise<number | undefined> => {
      const { logGroups } = await simAws
        .logs()
        .describeLogGroups(new DescribeLogGroupsCommand({}));

      return logGroups?.at(0)?.metricFilterCount;
    };

    // Then DescribeLogGroups counts none.
    assertIdentical(await described(), 0);

    // And when a filter is put, it counts that one.
    await simAws.logs().putMetricFilter(
      new PutMetricFilterCommand({
        logGroupName,
        filterName: "handler-errors",
        filterPattern: "ERROR",
        metricTransformations: [countErrors()],
      }),
    );

    assertIdentical(await described(), 1);
  });

  it("replaces a filter of the same name rather than adding a second", async () => {
    // Given a log group carrying a metric filter.
    const simAws = await simAwsWithLogGroup();

    for (const filterPattern of ["ERROR", "FATAL"]) {
      // oxlint-disable-next-line no-await-in-loop -- the second put replaces the first
      await simAws.logs().putMetricFilter(
        new PutMetricFilterCommand({
          logGroupName,
          filterName: "handler-errors",
          filterPattern,
          metricTransformations: [countErrors()],
        }),
      );
    }

    // When the group is described.
    const { metricFilters } = await simAws
      .logs()
      .describeMetricFilters(
        new DescribeMetricFiltersCommand({ logGroupName }),
      );

    // Then one filter is there, carrying the second pattern.
    assertArrayLength(metricFilters ?? [], 1);
    assertIdentical(metricFilters?.at(0)?.filterPattern, "FATAL");
  });

  it("finds filters across every log group by the metric they write", async () => {
    // Given two log groups, each with a filter, writing different metrics.
    const simAws = await simAwsWithLogGroup();

    await simAws
      .logs()
      .createLogGroup(new CreateLogGroupCommand({ logGroupName: "/site" }));
    await simAws.logs().putMetricFilter(
      new PutMetricFilterCommand({
        logGroupName,
        filterName: "handler-errors",
        filterPattern: "ERROR",
        metricTransformations: [countErrors()],
      }),
    );
    await simAws.logs().putMetricFilter(
      new PutMetricFilterCommand({
        logGroupName: "/site",
        filterName: "site-404s",
        filterPattern: "404",
        metricTransformations: [countErrors({ metricName: "NotFound" })],
      }),
    );

    // When one metric is asked about with no log group named.
    const { metricFilters } = await simAws.logs().describeMetricFilters(
      new DescribeMetricFiltersCommand({
        metricNamespace: "Orders",
        metricName: "NotFound",
      }),
    );

    // Then only the filter writing it comes back.
    assertArrayEquals(
      (metricFilters ?? []).map((filter) => filter.filterName),
      ["site-404s"],
    );
  });

  it("refuses deleting a filter that was never there", async () => {
    // Given a log group with no metric filter on it.
    const simAws = await simAwsWithLogGroup();

    // When a filter nothing put is deleted.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.logs().deleteMetricFilter(
          new DeleteMetricFilterCommand({
            logGroupName,
            filterName: "handler-errors",
          }),
        ),
    );

    // Then it is refused rather than passing quietly.
    assertInstanceOf(error, SimLogsResourceNotFoundException);
  });

  it("records a publication a reserved namespace turned away", async () => {
    // Given a filter writing into a namespace PutMetricData will not take,
    // which CloudWatch Logs itself accepts at PutMetricFilter.
    const simAws = await simAwsWithLogGroup();

    await simAws.logs().putMetricFilter(
      new PutMetricFilterCommand({
        logGroupName,
        filterName: "handler-errors",
        filterPattern: "ERROR",
        metricTransformations: [countErrors({ metricNamespace: "AWS/Lambda" })],
      }),
    );
    await simAws
      .logs()
      .createLogStream(
        new CreateLogStreamCommand({ logGroupName, logStreamName }),
      );

    // When a matching line is written.
    await simAws.logs().putLogEvents(
      new PutLogEventsCommand({
        logGroupName,
        logStreamName,
        logEvents: [{ message: "ERROR order failed", timestamp: Date.now() }],
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the write succeeded and the publication it could not make is on the
    // ledger, rather than being lost the way it is in an account.
    const failures = simAws.logs().metricFilterFailures;

    assertArrayLength(failures, 1);
    assertIdentical(failures.at(0)?.filterName, "handler-errors");
    assertIdentical(failures.at(0)?.metricNamespace, "AWS/Lambda");
    assertStringIncludes(failures.at(0)?.reason ?? "", "reserved");
  });
});
