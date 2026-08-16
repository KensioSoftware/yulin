import {
  CloudWatchClient,
  GetMetricDataCommand,
  GetMetricStatisticsCommand,
  ListMetricsCommand,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  assertArrayEquals,
  assertArrayIncludesAll,
  assertIdentical,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";

const publishedAt = new Date("2026-08-16T09:00:10.000Z");
const window = {
  StartTime: new Date("2026-08-16T09:00:00.000Z"),
  EndTime: new Date("2026-08-16T09:01:00.000Z"),
};

describe("SimCloudWatchSdkCommandRouter", () => {
  it("names every Command simulated CloudWatch handles", () => {
    // Given a scoped simulated CloudWatch.
    const simAws = new SimAws();

    // When its supported Command names are asked for.
    const names = simAws
      .cloudWatch()
      .sdkCommandRouter()
      .supportedCommandNames();

    // Then each simulated operation is routable by SDK Command name.
    assertArrayIncludesAll(names, [
      "PutMetricDataCommand",
      "ListMetricsCommand",
      "GetMetricStatisticsCommand",
      "GetMetricDataCommand",
    ]);
  });

  it("has no route for a Command it does not handle", () => {
    // Given a scoped simulated CloudWatch.
    const simAws = new SimAws();

    // When a CloudWatch Command outside what is simulated is looked up.
    const route = simAws
      .cloudWatch()
      .sdkCommandRouter()
      .route("PutMetricAlarmCommand");

    // Then there is no route for it.
    assertUndefined(route);
  });
});

describe("CloudWatch SDK interception", () => {
  it("routes an intercepted CloudWatchClient to simulated CloudWatch", async () => {
    // Given an intercepted CloudWatch SDK client.
    using simSdk = new SimSdk();
    simSdk.intercept(CloudWatchClient);

    const client = new CloudWatchClient({ region: "eu-west-2" });

    // When ordinary SDK code publishes a metric and reads it back every way it
    // can.
    await client.send(
      new PutMetricDataCommand({
        Namespace: "Orders",
        MetricData: [
          { MetricName: "Failed", Value: 4, Timestamp: publishedAt },
        ],
      }),
    );

    const listed = await client.send(new ListMetricsCommand({}));
    const statistics = await client.send(
      new GetMetricStatisticsCommand({
        Namespace: "Orders",
        MetricName: "Failed",
        Statistics: ["Sum"],
        Period: 60,
        ...window,
      }),
    );
    const data = await client.send(
      new GetMetricDataCommand({
        MetricDataQueries: [
          {
            Id: "failed",
            MetricStat: {
              Metric: { Namespace: "Orders", MetricName: "Failed" },
              Period: 60,
              Stat: "Sum",
            },
          },
        ],
        ...window,
      }),
    );

    // Then every operation reached the simulator, with nothing touching the
    // network.
    assertArrayEquals(
      listed.Metrics?.map((metric) => metric.MetricName),
      ["Failed"],
    );
    assertIdentical(statistics.Datapoints?.at(0)?.Sum, 4);
    assertArrayEquals(data.MetricDataResults?.at(0)?.Values, [4]);
  });

  it("keeps one Region's metrics out of another's", async () => {
    // Given a metric published through a client in one Region.
    using simSdk = new SimSdk();
    simSdk.intercept(CloudWatchClient);

    await new CloudWatchClient({ region: "eu-west-2" }).send(
      new PutMetricDataCommand({
        Namespace: "Orders",
        MetricData: [{ MetricName: "Failed", Value: 1 }],
      }),
    );

    // When another Region's client lists its metrics.
    const listed = await new CloudWatchClient({ region: "us-east-1" }).send(
      new ListMetricsCommand({}),
    );

    // Then it sees none of them, as it would in an account.
    assertArrayEquals(listed.Metrics ?? [], []);
  });
});
