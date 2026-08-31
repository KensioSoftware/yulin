import {
  ListMetricsCommand,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { SimCloudWatchInvalidParameterValueException } from "./error/sim-cloudwatch.error.js";
import type { SimCloudWatch } from "./sim-cloudwatch.js";

const startedAt = new Date("2026-08-16T09:00:00.000Z");

/**
 * A simulation holding three metrics across two namespaces, published at the
 * simulation's own start time.
 */
async function withThreeMetrics(): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.clock().setTo(startedAt);

  await simAws.cloudWatch().putMetricData(
    new PutMetricDataCommand({
      Namespace: "Orders",
      MetricData: [
        {
          MetricName: "Failed",
          Value: 1,
          Dimensions: [{ Name: "Channel", Value: "web" }],
        },
        {
          MetricName: "Failed",
          Value: 1,
          Dimensions: [{ Name: "Channel", Value: "app" }],
        },
      ],
    }),
  );
  await simAws.cloudWatch().putMetricData(
    new PutMetricDataCommand({
      Namespace: "Billing",
      MetricData: [{ MetricName: "Retried", Value: 1 }],
    }),
  );

  return simAws;
}

async function listedNames(
  metrics: SimCloudWatch,
  command: ListMetricsCommand,
): Promise<readonly string[]> {
  const listed = await metrics.listMetrics(command);

  return (listed.Metrics ?? []).map(
    (metric) => `${metric.Namespace}/${metric.MetricName}`,
  );
}

describe("SimCloudWatch ListMetrics", () => {
  it("reports every metric that has been published to", async () => {
    // Given three metrics across two namespaces.
    const simAws = await withThreeMetrics();
    const metrics = simAws.cloudWatch();

    // When they are all listed.
    const names = await listedNames(metrics, new ListMetricsCommand({}));

    // Then each dimension set is reported as a metric of its own.
    assertArrayEquals(names, [
      "Orders/Failed",
      "Orders/Failed",
      "Billing/Retried",
    ]);
  });

  it("filters by namespace, metric name and dimension", async () => {
    // Given three metrics across two namespaces.
    const simAws = await withThreeMetrics();
    const metrics = simAws.cloudWatch();

    // When each filter is applied.
    const byNamespace = await listedNames(
      metrics,
      new ListMetricsCommand({ Namespace: "Billing" }),
    );
    const byMetricName = await listedNames(
      metrics,
      new ListMetricsCommand({ MetricName: "Failed" }),
    );
    const byDimensionValue = await metrics.listMetrics(
      new ListMetricsCommand({
        Dimensions: [{ Name: "Channel", Value: "app" }],
      }),
    );
    const byDimensionName = await metrics.listMetrics(
      new ListMetricsCommand({ Dimensions: [{ Name: "Channel" }] }),
    );

    // Then each selects what it names, and a dimension filter with no value
    // matches whatever value a metric carries under that name.
    assertArrayEquals(byNamespace, ["Billing/Retried"]);
    assertArrayEquals(byMetricName, ["Orders/Failed", "Orders/Failed"]);
    assertArrayEquals(
      byDimensionValue.Metrics?.flatMap((metric) =>
        metric.Dimensions.map((dimension) => dimension.Value),
      ),
      ["app"],
    );
    assertArrayLength(byDimensionName.Metrics ?? [], 2);
  });

  it("measures RecentlyActive against the simulation's clock", async () => {
    // Given metrics published at the simulation's start time.
    const simAws = await withThreeMetrics();
    const metrics = simAws.cloudWatch();
    const recently = new ListMetricsCommand({ RecentlyActive: "PT3H" });

    // When time is moved past the window CloudWatch counts as recent.
    const before = await listedNames(metrics, recently);

    await simAws.clock().advanceBy({ hours: 4 });

    const after = await listedNames(metrics, recently);

    // Then they drop out of the listing without anything having expired them.
    assertArrayLength(before, 3);
    assertArrayEmpty(after);
  });

  it("refuses a recency window and an account reach it cannot honour", async () => {
    // Given a simulation holding metrics.
    const simAws = await withThreeMetrics();
    const metrics = simAws.cloudWatch();

    // When another recency window, and a cross-account listing, are asked for.
    // The SDK's own types allow only PT3H, so the other window can only arrive
    // from code that is not using them.
    const window = await assertThrowsErrorAsync(
      async () =>
        await metrics.listMetrics({ input: { RecentlyActive: "PT1H" } }),
    );
    const linked = await assertThrowsErrorAsync(
      async () =>
        await metrics.listMetrics(
          new ListMetricsCommand({ IncludeLinkedAccounts: true }),
        ),
    );

    // Then each is refused rather than quietly ignored.
    assertInstanceOf(window, SimCloudWatchInvalidParameterValueException);
    assertInstanceOf(linked, SimCloudWatchInvalidParameterValueException);
  });

  it("pages a listing longer than one page, and refuses a token it never issued", async () => {
    // Given more metrics than one page of a listing holds.
    const simAws = new SimAws();
    const metrics = simAws.cloudWatch();

    await metrics.putMetricData(
      new PutMetricDataCommand({
        Namespace: "Orders",
        MetricData: Array.from({ length: 501 }, (_, index) => ({
          MetricName: "Failed",
          Value: 1,
          Dimensions: [{ Name: "Shard", Value: String(index) }],
        })),
      }),
    );

    // When the first page is read, and then the one its token reaches.
    const first = await metrics.listMetrics(new ListMetricsCommand({}));
    const second = await metrics.listMetrics(
      new ListMetricsCommand({ NextToken: first.NextToken }),
    );
    const bogus = await assertThrowsErrorAsync(
      async () =>
        await metrics.listMetrics(
          new ListMetricsCommand({ NextToken: "not a token" }),
        ),
    );

    // Then the listing came back in two pages, and the second ends it.
    assertArrayLength(first.Metrics ?? [], 500);
    assertArrayLength(second.Metrics ?? [], 1);
    assertUndefined(second.NextToken);
    assertInstanceOf(bogus, SimCloudWatchInvalidParameterValueException);
  });

  it("measures recency from the latest write, whatever order they arrived in", async () => {
    // Given a metric written to twice, the second datum stamped earlier than
    // the first, which is what a batch of buffered metrics looks like.
    const simAws = new SimAws();
    const metrics = simAws.cloudWatch();

    await simAws.clock().setTo(startedAt);
    await metrics.putMetricData(
      new PutMetricDataCommand({
        Namespace: "Orders",
        MetricData: [
          { MetricName: "Failed", Value: 1, Timestamp: startedAt },
          {
            MetricName: "Failed",
            Value: 1,
            Timestamp: new Date("2026-08-16T06:00:00.000Z"),
          },
        ],
      }),
    );

    // When time moves on past the older write but not the newer.
    await simAws.clock().advanceBy({ hours: 2 });

    const listed = await listedNames(
      metrics,
      new ListMetricsCommand({ RecentlyActive: "PT3H" }),
    );

    // Then it still counts as recent, because recency is the latest write
    // rather than the last one to arrive.
    assertArrayLength(listed, 1);
  });
});
