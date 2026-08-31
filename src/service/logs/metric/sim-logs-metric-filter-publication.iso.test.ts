/* oxlint-disable no-console -- printing is what the bound handler is here to do. */
import {
  type Dimension,
  GetMetricStatisticsCommand,
  ListMetricsCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  type MetricTransformation,
  PutLogEventsCommand,
  PutMetricFilterCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";

const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/30/[$LATEST]abc";
const startedAt = new Date("2026-08-30T09:00:00.000Z");

/**
 * A simulation with a stopped clock, a log group with a stream in it, and one
 * metric filter counting `ERROR` lines into `Orders`/`HandlerErrors`.
 */
async function simAwsWithMetricFilter(
  transformation: Partial<MetricTransformation> = {},
): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.clock().setTo(startedAt);
  await simAws
    .logs()
    .createLogGroup(new CreateLogGroupCommand({ logGroupName }));
  await simAws
    .logs()
    .createLogStream(
      new CreateLogStreamCommand({ logGroupName, logStreamName }),
    );
  await simAws.logs().putMetricFilter(
    new PutMetricFilterCommand({
      logGroupName,
      filterName: "handler-errors",
      filterPattern: "ERROR",
      metricTransformations: [
        {
          metricNamespace: "Orders",
          metricName: "HandlerErrors",
          metricValue: "1",
          ...transformation,
        },
      ],
    }),
  );

  return simAws;
}

/** Write log lines to the stream and let the filters run. */
async function write(
  simAws: SimAws,
  ...messages: readonly string[]
): Promise<void> {
  await simAws.logs().putLogEvents(
    new PutLogEventsCommand({
      logGroupName,
      logStreamName,
      logEvents: messages.map((message) => ({
        message,
        timestamp: startedAt.getTime(),
      })),
    }),
  );
  await simAws.backgroundTasksComplete();
}

/** The `Sum` and `SampleCount` of `Orders`/`HandlerErrors` over the window. */
async function counted(
  simAws: SimAws,
  dimensions: Dimension[] = [],
): Promise<{ sum: number | undefined; samples: number | undefined }> {
  const endTime = new Date(startedAt.getTime() + 60_000);
  const command = new GetMetricStatisticsCommand({
    Namespace: "Orders",
    MetricName: "HandlerErrors",
    Dimensions: dimensions,
    StartTime: startedAt,
    EndTime: endTime,
    Period: 60,
    Statistics: ["Sum", "SampleCount"],
  });
  const { Datapoints } = await simAws.cloudWatch().getMetricStatistics(command);

  return {
    sum: Datapoints?.at(0)?.Sum,
    samples: Datapoints?.at(0)?.SampleCount,
  };
}

describe("sim CloudWatch Logs metric filter publication", () => {
  it("publishes a datapoint for each matching log event", async () => {
    // Given a log group whose metric filter counts ERROR lines.
    const simAws = await simAwsWithMetricFilter();

    // When two matching lines and one that does not match are written.
    await write(
      simAws,
      "ERROR order failed",
      "INFO order handled",
      "ERROR order failed again",
    );

    // Then the metric counts the two that matched, and nothing for the third.
    const { sum, samples } = await counted(simAws);

    assertIdentical(sum, 2);
    assertIdentical(samples, 2);
  });

  it("publishes nothing at all where no event matches", async () => {
    // Given the same filter.
    const simAws = await simAwsWithMetricFilter();

    // When only lines it does not match are written.
    await write(simAws, "INFO order handled");

    // Then the metric was never made, rather than made and left at zero.
    const { Metrics } = await simAws
      .cloudWatch()
      .listMetrics(new ListMetricsCommand({ Namespace: "Orders" }));

    assertArrayEmpty(Metrics ?? []);
  });

  it("publishes a default value once for a period that matched nothing", async () => {
    // Given a filter whose transformation carries a default value.
    const simAws = await simAwsWithMetricFilter({ defaultValue: 0 });

    // When two lines it does not match are written in the same minute.
    await write(simAws, "INFO order handled", "INFO order handled again");

    // Then the period reports the default once, rather than once per line.
    // Real CloudWatch Logs reports the default for a minute that took records
    // and matched none, which is what keeps a metric reporting through a quiet
    // stretch without inflating its sample count.
    const { sum, samples } = await counted(simAws);

    assertIdentical(sum, 0);
    assertIdentical(samples, 1);
  });

  it("publishes no default for a period a match landed in", async () => {
    // Given the same filter.
    const simAws = await simAwsWithMetricFilter({ defaultValue: 0 });

    // When one matching line and two that do not match share a minute.
    await write(
      simAws,
      "ERROR order failed",
      "INFO order handled",
      "INFO order handled again",
    );

    // Then the minute counts the one match alone. Publishing a default beside
    // it would inflate the sample count and change what an alarm decides.
    const { sum, samples } = await counted(simAws);

    assertIdentical(sum, 1);
    assertIdentical(samples, 1);
  });

  it("publishes no default over a write that follows a match in its minute", async () => {
    // Given the same filter, with a match already written this minute.
    const simAws = await simAwsWithMetricFilter({ defaultValue: 0 });

    await write(simAws, "ERROR order failed");

    // When a second write in the same minute matches nothing.
    await write(simAws, "INFO order handled");

    // Then the minute still counts the one match, as it does in an account.
    const { sum, samples } = await counted(simAws);

    assertIdentical(sum, 1);
    assertIdentical(samples, 1);
  });

  it("publishes under the transformation's dimensions and unit", async () => {
    // Given a filter publishing under a dimension, in a named unit.
    const simAws = await simAwsWithMetricFilter({
      dimensions: { service: "orders" },
      unit: "Count",
    });

    // When a matching line is written.
    await write(simAws, "ERROR order failed");

    // Then the datapoint is under that dimension set, and nothing landed on
    // the undimensioned metric.
    const dimensioned = await counted(simAws, [
      { Name: "service", Value: "orders" },
    ]);
    const undimensioned = await counted(simAws);

    assertIdentical(dimensioned.sum, 1);
    assertUndefined(undimensioned.sum);

    const { Metrics } = await simAws
      .cloudWatch()
      .listMetrics(new ListMetricsCommand({ Namespace: "Orders" }));

    assertArrayEquals(
      (Metrics ?? []).flatMap((metric) =>
        metric.Dimensions.map(
          (dimension) => `${dimension.Name}=${dimension.Value}`,
        ),
      ),
      ["service=orders"],
    );
  });

  it("stamps the datapoint with the instant the line was written", async () => {
    // Given the filter, with the clock stopped.
    const simAws = await simAwsWithMetricFilter();

    // When a matching line is written and the clock then moves on.
    await write(simAws, "ERROR order failed");
    await simAws.clock().advanceBy({ minutes: 10 });

    // Then the datapoint sits in the minute the line was written, rather than
    // the minute the assertion reads it in.
    const { sum } = await counted(simAws);

    assertIdentical(sum, 1);
  });

  it("keeps the write's minute when the clock moves before publication", async () => {
    // Given the filter, and a matching line written but not yet published.
    const simAws = await simAwsWithMetricFilter();

    await simAws.logs().putLogEvents(
      new PutLogEventsCommand({
        logGroupName,
        logStreamName,
        logEvents: [
          { message: "ERROR order failed", timestamp: startedAt.getTime() },
        ],
      }),
    );

    // When the clock advances past the period before the publication runs.
    await simAws.clock().advanceBy({ minutes: 10 });
    await simAws.backgroundTasksComplete();

    // Then the datapoint is still in the minute of the write. Publication
    // happens on the background scheduler, and stamping it when it runs would
    // file a log line under a period it never happened in.
    const { sum } = await counted(simAws);

    assertIdentical(sum, 1);
  });

  it("counts a bound Lambda handler's own error lines", async () => {
    // Given a function bound to an in-process handler that prints an error,
    // and a metric filter over the log group that handler writes to.
    const simAws = new SimAws();
    const functionName = "orders";
    const handlerLogGroupName = `/aws/lambda/${functionName}`;

    await simAws.clock().setTo(startedAt);
    await simAws.lambda().createFunction({
      input: {
        FunctionName: functionName,
        Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
        Code: {
          ZipFile: makeLambdaZipFileInput(() => {
            console.error("ERROR order failed");

            return "done";
          }),
        },
      },
    });
    await simAws.backgroundTasksComplete();
    await simAws
      .logs()
      .createLogGroup(
        new CreateLogGroupCommand({ logGroupName: handlerLogGroupName }),
      );
    await simAws.logs().putMetricFilter(
      new PutMetricFilterCommand({
        logGroupName: handlerLogGroupName,
        filterName: "handler-errors",
        filterPattern: "ERROR",
        metricTransformations: [
          {
            metricNamespace: "Orders",
            metricName: "HandlerErrors",
            metricValue: "1",
          },
        ],
      }),
    );

    // When the handler runs.
    await simAws.lambda().invoke({ input: { FunctionName: functionName } });
    await simAws.backgroundTasksComplete();

    // Then the metric counted the line it printed. That output reaches the log
    // group through the simulation's own writer rather than through
    // PutLogEvents, so the filter has to run on both paths.
    const { sum } = await counted(simAws);

    assertNonNullable(sum);
    assertIdentical(sum, 1);
  });
});
