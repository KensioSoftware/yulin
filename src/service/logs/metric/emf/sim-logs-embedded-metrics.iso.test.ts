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
  assertArrayEmpty,
  assertArrayEquals,
  assertIdentical,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimLogs } from "../../sim-logs.js";
import {
  countedFailures as counted,
  embeddedMetricDocument as embeddedDocument,
  emfLogGroupName as logGroupName,
  emfLogStreamName as logStreamName,
  emfStartedAt as startedAt,
  simAwsWithEmfLogStream as simAwsWithLogStream,
  writeEmfLines as write,
} from "../../../../../test/logs/embedded-metric-fixture.js";

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
    assertArrayEmpty(simLogs.metricPublicationFailures);
  });

  it("stamps from the write where the document carries no timestamp", async () => {
    // Given a document with no _aws.Timestamp of its own.
    const simAws = await simAwsWithLogStream();

    await write(simAws, embeddedDocument({}, { Timestamp: undefined }));

    // Then the instant CloudWatch Logs took the event is what stamps it.
    assertIdentical(await counted(simAws), 1);
  });

  it("publishes undimensioned where the document declares no dimensions", async () => {
    // Given a document with no Dimensions at all, and one with an empty set.
    const simAws = await simAwsWithLogStream();

    await write(
      simAws,
      JSON.stringify({
        _aws: {
          Timestamp: startedAt.getTime(),
          CloudWatchMetrics: [
            {
              Namespace: "ChineseBoost",
              Metrics: [{ Name: "UserRequestFailed" }],
            },
          ],
        },
        UserRequestFailed: 1,
      }),
    );

    // Then it published without dimensions, which is what it asked for.
    assertIdentical(await counted(simAws, []), 1);
  });
});
