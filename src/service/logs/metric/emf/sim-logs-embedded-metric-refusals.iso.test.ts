import { ListMetricsCommand } from "@aws-sdk/client-cloudwatch";
import { PutMetricFilterCommand } from "@aws-sdk/client-cloudwatch-logs";
import {
  assertArrayIncludes,
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  countedFailures as counted,
  embeddedMetricDocument as embeddedDocument,
  emfLogGroupName as logGroupName,
  simAwsWithEmfLogStream as simAwsWithLogStream,
  writeEmfLines as write,
} from "../../../../../test/logs/embedded-metric-fixture.js";

describe("Embedded Metric Format documents this cannot publish", () => {
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
    assertIdentical(failures.at(0)?.source.kind, "embeddedMetricFormat");
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

  it("publishes nothing where the only dimension set cannot be filled in", async () => {
    // Given a document declaring one dimension set, naming a key its body has
    // not got.
    const simAws = await simAwsWithLogStream();

    await write(
      simAws,
      embeddedDocument(
        {},
        {
          CloudWatchMetrics: [
            {
              Namespace: "ChineseBoost",
              Dimensions: [["missing"]],
              Metrics: [{ Name: "UserRequestFailed" }],
            },
          ],
        },
      ),
    );

    // Then nothing published under an identity the document never declared.
    // Falling back to no dimensions here would put the datapoint where an
    // alarm watching the undimensioned metric would pick it up.
    const { Metrics } = await simAws
      .cloudWatch()
      .listMetrics(new ListMetricsCommand({}));

    assertArrayLength(Metrics ?? [], 0);
    assertArrayLength(simAws.logs().metricPublicationFailures, 1);
  });

  it("rejects a dimension set carrying anything but strings", async () => {
    // Given a document whose dimension set has a number in it.
    const simAws = await simAwsWithLogStream();

    await write(
      simAws,
      embeddedDocument(
        {},
        {
          CloudWatchMetrics: [
            {
              Namespace: "ChineseBoost",
              Dimensions: [["service", 1]],
              Metrics: [{ Name: "UserRequestFailed" }],
            },
          ],
        },
      ),
    );

    // Then the whole set goes. Keeping the members that were strings would
    // publish under a narrower identity than the document asked for.
    const { Metrics } = await simAws
      .cloudWatch()
      .listMetrics(new ListMetricsCommand({}));

    assertArrayLength(Metrics ?? [], 0);
  });

  it("tells its failures apart from a filter named after it", async () => {
    // Given a metric filter whose name is the other kind of source, writing
    // into a namespace PutMetricData will not take, on a group that also takes
    // an unpublishable embedded document.
    const simAws = await simAwsWithLogStream();

    await simAws.logs().putMetricFilter(
      new PutMetricFilterCommand({
        logGroupName,
        filterName: "embeddedMetricFormat",
        filterPattern: "ERROR",
        metricTransformations: [
          {
            metricNamespace: "AWS/Lambda",
            metricName: "Errors",
            metricValue: "1",
          },
        ],
      }),
    );

    // When one line trips the filter and another is a document with no value.
    await write(
      simAws,
      "ERROR order failed",
      embeddedDocument({ UserRequestFailed: "one" }),
    );

    // Then the two failures are told apart by their kind rather than by a
    // name a caller happens to have chosen.
    const kinds = simAws
      .logs()
      .metricPublicationFailures.map((failure) => failure.source.kind);

    assertArrayLength(kinds, 2);
    assertArrayIncludes(kinds, "metricFilter");
    assertArrayIncludes(kinds, "embeddedMetricFormat");
  });

  it("rejects a directive whose Dimensions is not a list of sets", async () => {
    // Given documents whose Dimensions is the wrong shape twice over.
    const simAws = await simAwsWithLogStream();

    await write(
      simAws,
      // Dimensions is not a list at all.
      embeddedDocument(
        {},
        {
          CloudWatchMetrics: [
            {
              Namespace: "ChineseBoost",
              Dimensions: "service",
              Metrics: [{ Name: "UserRequestFailed" }],
            },
          ],
        },
      ),
      // Dimensions is a list, and one of its sets is not.
      embeddedDocument(
        {},
        {
          CloudWatchMetrics: [
            {
              Namespace: "ChineseBoost",
              Dimensions: ["service"],
              Metrics: [{ Name: "UserRequestFailed" }],
            },
          ],
        },
      ),
    );

    // Then neither published. Reading a malformed envelope as a request for no
    // dimensions would put the datapoint on the undimensioned metric.
    const { Metrics } = await simAws
      .cloudWatch()
      .listMetrics(new ListMetricsCommand({}));

    assertArrayLength(Metrics ?? [], 0);
  });
});
