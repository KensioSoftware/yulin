/**
 * The Embedded Metric Format documents the EMF tests write to a log group.
 *
 * A document has to be self consistent to publish anything: the metadata names
 * a namespace, a set of dimension keys and a set of metric names, and the body
 * of the same document carries a value under each of those names. Building one
 * by hand in every case would put that agreement in a dozen places.
 */

import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

import { SimAws } from "../../src/service/aws/sim-aws.js";

/** The log group these tests write to, as a Lambda function's own. */
export const emfLogGroupName = "/aws/lambda/user";

/** The stream inside it, in the shape a Lambda execution environment opens. */
export const emfLogStreamName = "2026/08/30/[$LATEST]0f7c1a";

/** The instant the clock is stopped at. */
export const emfStartedAt = new Date("2026-08-30T09:00:00.000Z");

/**
 * One EMF document in the shape Powertools writes, as a log line.
 *
 * `overrides` replaces top-level properties of the document body, and
 * `metadata` replaces parts of the `_aws` envelope.
 */
export function embeddedMetricDocument(
  overrides: Record<string, unknown> = {},
  metadata: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    _aws: {
      Timestamp: emfStartedAt.getTime(),
      CloudWatchMetrics: [
        {
          Namespace: "ChineseBoost",
          Dimensions: [["service"]],
          Metrics: [{ Name: "UserRequestFailed", Unit: "Count" }],
        },
      ],
      ...metadata,
    },
    service: "user",
    UserRequestFailed: 1,
    ...overrides,
  });
}

/** A simulation with a stopped clock and a log group with a stream in it. */
export async function simAwsWithEmfLogStream(): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.clock().setTo(emfStartedAt);
  await simAws
    .logs()
    .createLogGroup(
      new CreateLogGroupCommand({ logGroupName: emfLogGroupName }),
    );
  await simAws.logs().createLogStream(
    new CreateLogStreamCommand({
      logGroupName: emfLogGroupName,
      logStreamName: emfLogStreamName,
    }),
  );

  return simAws;
}

/** Write log lines to the stream and let the reading run. */
export async function writeEmfLines(
  simAws: SimAws,
  ...messages: readonly string[]
): Promise<void> {
  await simAws.logs().putLogEvents(
    new PutLogEventsCommand({
      logGroupName: emfLogGroupName,
      logStreamName: emfLogStreamName,
      logEvents: messages.map((message) => ({
        message,
        timestamp: emfStartedAt.getTime(),
      })),
    }),
  );
  await simAws.backgroundTasksComplete();
}

/** The `Sum` of the handler's failure metric over the window. */
export async function countedFailures(
  simAws: SimAws,
  dimensions: { Name: string; Value: string }[] = [
    { Name: "service", Value: "user" },
  ],
): Promise<number | undefined> {
  const statistics = new GetMetricStatisticsCommand({
    Namespace: "ChineseBoost",
    MetricName: "UserRequestFailed",
    Dimensions: dimensions,
    StartTime: emfStartedAt,
    EndTime: new Date(emfStartedAt.getTime() + 300_000),
    Period: 300,
    Statistics: ["Sum"],
  });
  const { Datapoints } = await simAws
    .cloudWatch()
    .getMetricStatistics(statistics);

  return Datapoints?.at(0)?.Sum;
}
