import {
  GetMetricStatisticsCommand,
  ListMetricsCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimLogs } from "../../sim-logs.js";

const logGroupName = "/aws/lambda/user";
const logStreamName = "2026/08/30/[$LATEST]0f7c1a";
const startedAt = new Date("2026-08-30T09:00:00.000Z");

/**
 * One EMF document in the shape Powertools writes, as a log line.
 *
 * The metadata names the namespace, the dimension set and the metric, and the
 * body of the same document carries the values both refer to by name.
 */
function embeddedDocument(
  overrides: Record<string, unknown> = {},
  metadata: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    _aws: {
      Timestamp: startedAt.getTime(),
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
async function simAwsWithLogStream(): Promise<SimAws> {
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

  return simAws;
}

/** Write log lines and let the reading run. */
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

/** The `Sum` of the handler's failure metric over the window. */
async function counted(
  simAws: SimAws,
  dimensions: { Name: string; Value: string }[] = [
    { Name: "service", Value: "user" },
  ],
): Promise<number | undefined> {
  const statistics = new GetMetricStatisticsCommand({
    Namespace: "ChineseBoost",
    MetricName: "UserRequestFailed",
    Dimensions: dimensions,
    StartTime: startedAt,
    EndTime: new Date(startedAt.getTime() + 300_000),
    Period: 300,
    Statistics: ["Sum"],
  });
  const { Datapoints } = await simAws
    .cloudWatch()
    .getMetricStatistics(statistics);

  return Datapoints?.at(0)?.Sum;
}

describe("Embedded Metric Format in simulated CloudWatch Logs", () => {
  it("publishes the metrics a log event carries", async () => {
    // Given a log group with a stream in it.
    const simAws = await simAwsWithLogStream();

    // When a handler writes an EMF document to it, as Powertools does.
    await write(simAws, embeddedDocument());

    // Then the metric exists, under the dimension set the document named.
    assertIdentical(await counted(simAws), 1);
  });

  it("reads the unit the document declared", async () => {
    // Given a log group that took an EMF document naming a unit.
    const simAws = await simAwsWithLogStream();

    await write(simAws, embeddedDocument());

    // When the metric is read back filtered by that unit.
    const statistics = new GetMetricStatisticsCommand({
      Namespace: "ChineseBoost",
      MetricName: "UserRequestFailed",
      Dimensions: [{ Name: "service", Value: "user" }],
      StartTime: startedAt,
      EndTime: new Date(startedAt.getTime() + 300_000),
      Period: 300,
      Statistics: ["Sum"],
      Unit: "Count",
    });
    const { Datapoints } = await simAws
      .cloudWatch()
      .getMetricStatistics(statistics);

    // Then it is there, so the unit reached the datapoint.
    assertIdentical(Datapoints?.at(0)?.Sum, 1);
  });

  it("takes the timestamp from the document rather than the clock", async () => {
    // Given a log group, and a document stamped five minutes before the write.
    const stampedAt = new Date(startedAt.getTime() - 300_000);
    const simAws = await simAwsWithLogStream();

    await write(
      simAws,
      embeddedDocument({}, { Timestamp: stampedAt.getTime() }),
    );

    // Then the datapoint sits in the document's own window. Powertools stamps
    // its document when it publishes, and the log line can reach CloudWatch
    // Logs later.
    const statistics = new GetMetricStatisticsCommand({
      Namespace: "ChineseBoost",
      MetricName: "UserRequestFailed",
      Dimensions: [{ Name: "service", Value: "user" }],
      StartTime: stampedAt,
      EndTime: startedAt,
      Period: 300,
      Statistics: ["Sum"],
    });
    const { Datapoints } = await simAws
      .cloudWatch()
      .getMetricStatistics(statistics);

    assertIdentical(Datapoints?.at(0)?.Sum, 1);
    assertUndefined(await counted(simAws));
  });

  it("publishes one datapoint per dimension set", async () => {
    // Given a document declaring two dimension sets over one metric.
    const simAws = await simAwsWithLogStream();

    await write(
      simAws,
      embeddedDocument(
        { environment: "production" },
        {
          CloudWatchMetrics: [
            {
              Namespace: "ChineseBoost",
              Dimensions: [["service"], ["environment"]],
              Metrics: [{ Name: "UserRequestFailed" }],
            },
          ],
        },
      ),
    );

    // Then each set got its own metric, which is what makes them separate
    // identities in CloudWatch.
    const { Metrics } = await simAws
      .cloudWatch()
      .listMetrics(new ListMetricsCommand({ Namespace: "ChineseBoost" }));

    assertArrayEquals(
      (Metrics ?? []).flatMap((metric) =>
        metric.Dimensions.map(
          (dimension) => `${dimension.Name}=${dimension.Value}`,
        ),
      ),
      ["service=user", "environment=production"],
    );
  });

  it("publishes one datapoint per value where a metric carries a list", async () => {
    // Given a document whose metric value is a list, as Powertools writes one
    // when a handler counts the same metric more than once.
    const simAws = await simAwsWithLogStream();

    await write(simAws, embeddedDocument({ UserRequestFailed: [1, 2, 3] }));

    // Then every value counted.
    assertIdentical(await counted(simAws), 6);
  });

  it("leaves an ordinary log line alone", async () => {
    // Given a log group with a stream in it.
    const simAws = await simAwsWithLogStream();

    // When lines that are not EMF documents are written.
    await write(
      simAws,
      "INFO handling a request",
      JSON.stringify({ level: "INFO", message: "handling a request" }),
      "{ not json at all",
      JSON.stringify({ _aws: "a property that happens to be named that" }),
    );

    // Then nothing was published and nothing was recorded as a failure. A log
    // group is full of lines that were never metrics.
    const { Metrics } = await simAws
      .cloudWatch()
      .listMetrics(new ListMetricsCommand({}));

    assertArrayLength(Metrics ?? [], 0);
    assertArrayLength(simAws.logs().metricPublicationFailures, 0);
  });

  it("records a metric the document declared and carries no value for", async () => {
    // Given a document naming a metric its body has no number under.
    const simAws = await simAwsWithLogStream();

    await write(simAws, embeddedDocument({ UserRequestFailed: "one" }));

    // Then it published nothing, and said so rather than passing quietly.
    const failures = simAws.logs().metricPublicationFailures;

    assertArrayLength(failures, 1);
    assertIdentical(failures.at(0)?.metricName, "UserRequestFailed");
    assertIdentical(failures.at(0)?.source, "embedded metric format");
    assertStringIncludes(failures.at(0)?.reason ?? "", "no value to publish");
  });

  it("records a high resolution metric it cannot hold", async () => {
    // Given a document asking for a one second metric.
    const simAws = await simAwsWithLogStream();

    await write(
      simAws,
      embeddedDocument(
        {},
        {
          CloudWatchMetrics: [
            {
              Namespace: "ChineseBoost",
              Dimensions: [["service"]],
              Metrics: [{ Name: "UserRequestFailed", StorageResolution: 1 }],
            },
          ],
        },
      ),
    );

    // Then it is on the ledger rather than published at the wrong resolution.
    // Every period in this simulated CloudWatch is a whole number of minutes.
    const failures = simAws.logs().metricPublicationFailures;

    assertArrayLength(failures, 1);
    assertStringIncludes(failures.at(0)?.reason ?? "", "StorageResolution 1");
  });

  it("drops a dimension set naming a property the document lacks", async () => {
    // Given a document whose dimension set names a key its body has not got.
    const simAws = await simAwsWithLogStream();

    await write(
      simAws,
      embeddedDocument(
        {},
        {
          CloudWatchMetrics: [
            {
              Namespace: "ChineseBoost",
              Dimensions: [["service"], ["missing"]],
              Metrics: [{ Name: "UserRequestFailed" }],
            },
          ],
        },
      ),
    );

    // Then the set it could fill in published and the other did not. Dropping
    // one key and keeping the rest would put the datapoint under an identity
    // no alarm is watching.
    const { Metrics } = await simAws
      .cloudWatch()
      .listMetrics(new ListMetricsCommand({ Namespace: "ChineseBoost" }));

    assertArrayLength(Metrics ?? [], 1);
    assertIdentical(await counted(simAws), 1);
  });

  it("reads no embedded metrics on a CloudWatch Logs built on its own", async () => {
    // Given a simulated CloudWatch Logs with no CloudWatch to publish into.
    const simLogs = new SimLogs();

    await simLogs.createLogGroup(new CreateLogGroupCommand({ logGroupName }));
    await simLogs.createLogStream(
      new CreateLogStreamCommand({ logGroupName, logStreamName }),
    );

    // When a Powertools log line is written to it.
    await simLogs.putLogEvents(
      new PutLogEventsCommand({
        logGroupName,
        logStreamName,
        logEvents: [
          { message: embeddedDocument(), timestamp: startedAt.getTime() },
        ],
      }),
    );

    // Then the write took it and nothing was recorded. A log line here is a
    // log line, and a user who wanted metrics would have reached CloudWatch
    // Logs through a SimAws scope.
    assertArrayLength(simLogs.metricPublicationFailures, 0);
  });

  it("stamps from the write where the document carries no timestamp", async () => {
    // Given a document with no _aws.Timestamp of its own.
    const simAws = await simAwsWithLogStream();

    await write(simAws, embeddedDocument({}, { Timestamp: undefined }));

    // Then the instant CloudWatch Logs took the event is what stamps it.
    assertIdentical(await counted(simAws), 1);
  });

  it("reads past metadata it cannot make sense of", async () => {
    // Given documents whose metadata is the right shape in name only.
    const simAws = await simAwsWithLogStream();

    await write(
      simAws,
      // Not JSON at all, but carrying the key that makes this worth parsing.
      '{"_aws": broken',
      // Metadata that is not a list of directives.
      JSON.stringify({ _aws: { CloudWatchMetrics: "one of them" } }),
      // A directive with no namespace to publish into.
      JSON.stringify({
        _aws: { CloudWatchMetrics: [{ Metrics: [{ Name: "Failed" }] }] },
        Failed: 1,
      }),
      // A metric with no name to publish under, in a directive that has one.
      JSON.stringify({
        _aws: {
          CloudWatchMetrics: [{ Namespace: "ChineseBoost", Metrics: [{}] }],
        },
      }),
    );

    // Then none of them published, and none of them was recorded. Each is a
    // log line this cannot read as metrics rather than a metric it failed to
    // write.
    const { Metrics } = await simAws
      .cloudWatch()
      .listMetrics(new ListMetricsCommand({}));

    assertArrayLength(Metrics ?? [], 0);
    assertArrayLength(simAws.logs().metricPublicationFailures, 0);
  });
});
