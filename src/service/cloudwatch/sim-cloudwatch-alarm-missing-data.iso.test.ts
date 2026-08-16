import {
  PutMetricAlarmCommand,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";

const startedAt = new Date("2026-08-16T09:00:00.000Z");

/**
 * An alarm over a metric nothing publishes into, watching two periods, with
 * whatever treatment of missing data the test is about.
 */
async function withMissingData(
  treatMissingData: string,
  overrides: Partial<PutMetricAlarmCommand["input"]> = {},
): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.clock().setTo(startedAt);
  await simAws.cloudWatch().putMetricAlarm(
    new PutMetricAlarmCommand({
      AlarmName: "Quiet",
      Namespace: "Orders",
      MetricName: "Failed",
      Statistic: "Sum",
      Period: 60,
      EvaluationPeriods: 2,
      Threshold: 5,
      ComparisonOperator: "GreaterThanThreshold",
      TreatMissingData: treatMissingData,
      ...overrides,
    }),
  );

  return simAws;
}

function stateOf(simAws: SimAws): string {
  const alarm = simAws.cloudWatch().allAlarms().at(0);

  assertNonNullable(alarm);

  return alarm.state;
}

describe("SimCloudWatch alarm missing data", () => {
  it("reports INSUFFICIENT_DATA when periods are simply missing", async () => {
    // Given an alarm treating missing data the default way.
    const simAws = await withMissingData("missing");

    // When two empty minutes pass.
    await simAws.clock().advanceBy({ minutes: 2 });

    // Then it has nothing to go on rather than an opinion.
    assertIdentical(stateOf(simAws), "INSUFFICIENT_DATA");
  });

  it("stays OK when a missing period counts as not breaching", async () => {
    // Given an alarm treating a quiet period as healthy.
    const simAws = await withMissingData("notBreaching");

    // When two empty minutes pass.
    await simAws.clock().advanceBy({ minutes: 2 });

    // Then it is satisfied rather than uncertain.
    assertIdentical(stateOf(simAws), "OK");
  });

  it("fires when a missing period counts as breaching", async () => {
    // Given an alarm treating silence as a problem, which is how a heartbeat
    // metric is watched.
    const simAws = await withMissingData("breaching");

    // When two empty minutes pass.
    await simAws.clock().advanceBy({ minutes: 2 });

    // Then it fires on the silence.
    assertIdentical(stateOf(simAws), "ALARM");
  });

  it("keeps whatever state it had when told to ignore missing periods", async () => {
    // Given an alarm that has been driven into ALARM by real data.
    const simAws = await withMissingData("ignore", { EvaluationPeriods: 1 });

    await simAws.cloudWatch().putMetricData(
      new PutMetricDataCommand({
        Namespace: "Orders",
        MetricData: [{ MetricName: "Failed", Value: 10 }],
      }),
    );
    await simAws.clock().advanceBy({ minutes: 1 });

    const fired = stateOf(simAws);

    // When the metric stops being published entirely.
    await simAws.clock().advanceBy({ minutes: 10 });

    // Then it holds where it was rather than falling back to
    // INSUFFICIENT_DATA, which is what `ignore` asks for.
    assertIdentical(fired, "ALARM");
    assertIdentical(stateOf(simAws), "ALARM");
  });

  it("compares each way real CloudWatch compares", async () => {
    // Given the four threshold comparisons, each over a metric holding five.
    const cases = [
      { ComparisonOperator: "GreaterThanOrEqualToThreshold", fires: true },
      { ComparisonOperator: "GreaterThanThreshold", fires: false },
      { ComparisonOperator: "LessThanThreshold", fires: false },
      { ComparisonOperator: "LessThanOrEqualToThreshold", fires: true },
    ] as const;
    const fired = await Promise.all(
      cases.map(async (one) => {
        const simAws = await withMissingData("missing", {
          EvaluationPeriods: 1,
          ComparisonOperator: one.ComparisonOperator,
        });

        await simAws.cloudWatch().putMetricData(
          new PutMetricDataCommand({
            Namespace: "Orders",
            MetricData: [{ MetricName: "Failed", Value: 5 }],
          }),
        );
        await simAws.clock().advanceBy({ minutes: 1 });

        return stateOf(simAws) === "ALARM";
      }),
    );

    // Then each fired exactly when a value equal to the threshold should make
    // it: the two that include equality, and neither of the strict ones.
    assertArrayEquals(
      fired,
      cases.map((one) => one.fires),
    );
  });
});
