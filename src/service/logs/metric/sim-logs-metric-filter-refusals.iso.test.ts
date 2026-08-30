import {
  CreateLogGroupCommand,
  type MetricTransformation,
  PutMetricFilterCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimLogs } from "../sim-logs.js";
import {
  SimLogsInvalidParameterException,
  SimLogsUnsupportedOperationException,
} from "../error/sim-logs.error.js";

const logGroupName = "/aws/lambda/orders";

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

describe("sim CloudWatch Logs metric filter refusals", () => {
  it("refuses a metricValue naming a field of the log event", async () => {
    // Given a log group.
    const simAws = await simAwsWithLogGroup();

    // When a filter would read its value out of the matched event.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.logs().putMetricFilter(
          new PutMetricFilterCommand({
            logGroupName,
            filterName: "bytes",
            filterPattern: "transfer",
            metricTransformations: [countErrors({ metricValue: "$.bytes" })],
          }),
        ),
    );

    // Then it is refused, because reading one needs a structured pattern and
    // neither structured syntax is simulated.
    assertInstanceOf(error, SimLogsUnsupportedOperationException);
    assertStringIncludes(error.message, "$.bytes");
  });

  it("refuses a dimension naming a field of the log event", async () => {
    // Given a log group.
    const simAws = await simAwsWithLogGroup();

    // When a filter would take a dimension value out of the matched event.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.logs().putMetricFilter(
          new PutMetricFilterCommand({
            logGroupName,
            filterName: "by-route",
            filterPattern: "ERROR",
            metricTransformations: [
              countErrors({ dimensions: { route: "$.route" } }),
            ],
          }),
        ),
    );

    // Then it is refused rather than publishing under a dimension set no alarm
    // is watching.
    assertInstanceOf(error, SimLogsUnsupportedOperationException);
    assertStringIncludes(error.message, "route");
  });

  it("refuses a metricValue that is no kind of number", async () => {
    // Given a log group.
    const simAws = await simAwsWithLogGroup();

    // When a filter would publish something that is not a value.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.logs().putMetricFilter(
          new PutMetricFilterCommand({
            logGroupName,
            filterName: "handler-errors",
            filterPattern: "ERROR",
            metricTransformations: [countErrors({ metricValue: "lots" })],
          }),
        ),
    );

    // Then it is refused when it is put.
    assertInstanceOf(error, SimLogsInvalidParameterException);
    assertStringIncludes(error.message, "lots");
  });

  it("refuses more dimensions than a transformation may carry", async () => {
    // Given a log group.
    const simAws = await simAwsWithLogGroup();

    // When a filter names four dimensions, one more than AWS allows.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.logs().putMetricFilter(
          new PutMetricFilterCommand({
            logGroupName,
            filterName: "handler-errors",
            filterPattern: "ERROR",
            metricTransformations: [
              countErrors({
                dimensions: { a: "1", b: "2", c: "3", d: "4" },
              }),
            ],
          }),
        ),
    );

    // Then it is refused, as an account refuses it.
    assertInstanceOf(error, SimLogsInvalidParameterException);
    assertStringIncludes(error.message, "at most 3 dimensions");
  });

  it("refuses a filter with no transformation, and one with two", async () => {
    // Given a log group.
    const simAws = await simAwsWithLogGroup();
    const put = async (
      metricTransformations: MetricTransformation[],
    ): Promise<Error> =>
      await assertThrowsErrorAsync(
        async () =>
          await simAws.logs().putMetricFilter(
            new PutMetricFilterCommand({
              logGroupName,
              filterName: "handler-errors",
              filterPattern: "ERROR",
              metricTransformations,
            }),
          ),
      );

    // Then both are refused, as an account refuses them.
    assertInstanceOf(await put([]), SimLogsInvalidParameterException);
    assertInstanceOf(
      await put([countErrors(), countErrors({ metricName: "Second" })]),
      SimLogsInvalidParameterException,
    );
  });

  it("refuses a filter on a CloudWatch Logs with nowhere to publish", async () => {
    // Given a simulated CloudWatch Logs built on its own, which has no
    // simulated CloudWatch to write a datapoint into.
    const simLogs = new SimLogs();

    await simLogs.createLogGroup(new CreateLogGroupCommand({ logGroupName }));

    // When a metric filter is put on it.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simLogs.putMetricFilter(
          new PutMetricFilterCommand({
            logGroupName,
            filterName: "handler-errors",
            filterPattern: "ERROR",
            metricTransformations: [countErrors()],
          }),
        ),
    );

    // Then it is refused when it is put, rather than held and publishing
    // nowhere for the rest of the test.
    assertInstanceOf(error, SimLogsUnsupportedOperationException);
    assertStringIncludes(error.message, "SimAws Account Region scope");
  });

  it("refuses a default value on a transformation that has dimensions", async () => {
    // Given a log group.
    const simAws = await simAwsWithLogGroup();

    // When a filter would carry both.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.logs().putMetricFilter(
          new PutMetricFilterCommand({
            logGroupName,
            filterName: "handler-errors",
            filterPattern: "ERROR",
            metricTransformations: [
              countErrors({
                defaultValue: 0,
                dimensions: { service: "orders" },
              }),
            ],
          }),
        ),
    );

    // Then it is refused. CloudWatch Logs allows one or the other, because a
    // default would have to be reported against every dimension value the
    // filter has ever seen.
    assertInstanceOf(error, SimLogsInvalidParameterException);
    assertStringIncludes(error.message, "defaultValue");
  });
});
