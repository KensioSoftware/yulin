import {
  DescribeAlarmsCommand,
  PutMetricAlarmCommand,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";

const startedAt = new Date("2026-08-16T09:00:00.000Z");

/**
 * A simulation whose clock is stopped on a minute boundary, with one alarm
 * over `Orders`/`Failed` watching for a sum above five.
 */
async function withAlarm(
  overrides: Partial<PutMetricAlarmCommand["input"]> = {},
): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.clock().setTo(startedAt);
  await simAws.cloudWatch().putMetricAlarm(
    new PutMetricAlarmCommand({
      AlarmName: "OrdersFailing",
      Namespace: "Orders",
      MetricName: "Failed",
      Statistic: "Sum",
      Period: 60,
      EvaluationPeriods: 3,
      DatapointsToAlarm: 2,
      Threshold: 5,
      ComparisonOperator: "GreaterThanThreshold",
      ...overrides,
    }),
  );

  return simAws;
}

/**
 * Publish one failure count into the minute the clock is standing in.
 */
async function publish(simAws: SimAws, value: number): Promise<void> {
  await simAws.cloudWatch().putMetricData(
    new PutMetricDataCommand({
      Namespace: "Orders",
      MetricData: [{ MetricName: "Failed", Value: value }],
    }),
  );
}

async function stateOf(simAws: SimAws): Promise<string> {
  const described = await simAws
    .cloudWatch()
    .describeAlarms(
      new DescribeAlarmsCommand({ AlarmNames: ["OrdersFailing"] }),
    );
  const alarm = described.MetricAlarms?.at(0);

  assertNonNullable(alarm);

  return alarm.StateValue;
}

describe("SimCloudWatch alarm evaluation", () => {
  it("starts in INSUFFICIENT_DATA until it has evaluated", async () => {
    // Given an alarm just created, with no time passed.
    const simAws = await withAlarm();

    // When its state is read.
    // Then it has not evaluated anything yet, as on real CloudWatch.
    assertIdentical(await stateOf(simAws), "INSUFFICIENT_DATA");
  });

  it("evaluates nothing while the clock stands still", async () => {
    // Given an alarm and a breaching value published into the current minute.
    const simAws = await withAlarm();

    await publish(simAws, 10);
    await publish(simAws, 10);
    await simAws.backgroundTasksComplete();

    // When no time passes.
    // Then nothing has evaluated: an alarm here runs on the simulation's
    // clock, so a frozen clock leaves it where it was.
    assertIdentical(await stateOf(simAws), "INSUFFICIENT_DATA");
  });

  it("fires once two of three periods breach, and not before", async () => {
    // Given an alarm wanting two breaching minutes out of three.
    const simAws = await withAlarm();

    // When one breaching minute passes.
    await publish(simAws, 10);
    await simAws.clock().advanceBy({ minutes: 1 });

    const afterOne = await stateOf(simAws);

    // And then a second.
    await publish(simAws, 10);
    await simAws.clock().advanceBy({ minutes: 1 });

    // Then one breaching minute was not enough and two were.
    assertIdentical(afterOne, "OK");
    assertIdentical(await stateOf(simAws), "ALARM");
  });

  it("comes back to OK once the breaching periods fall out of the window", async () => {
    // Given an alarm that has fired.
    const simAws = await withAlarm();

    await publish(simAws, 10);
    await simAws.clock().advanceBy({ minutes: 1 });
    await publish(simAws, 10);
    await simAws.clock().advanceBy({ minutes: 1 });

    const fired = await stateOf(simAws);

    // When quiet minutes pass until the breaching ones are behind the window.
    await publish(simAws, 1);
    await simAws.clock().advanceBy({ minutes: 3 });

    // Then it recovers on its own.
    assertIdentical(fired, "ALARM");
    assertIdentical(await stateOf(simAws), "OK");
  });

  it("records every transition with the simulated time it happened at", async () => {
    // Given an alarm that fires two minutes in.
    const simAws = await withAlarm();

    await publish(simAws, 10);
    await simAws.clock().advanceBy({ minutes: 1 });
    await publish(simAws, 10);
    await simAws.clock().advanceBy({ minutes: 1 });

    // When its history is read.
    const alarm = simAws.cloudWatch().allAlarms().at(0);

    assertNonNullable(alarm);

    // Then each transition is stamped with the boundary it was evaluated at,
    // rather than with wherever time was eventually advanced to.
    assertArrayLength(alarm.history.all, 2);
    assertIdentical(
      alarm.history.all.at(0)?.timestamp.toISOString(),
      "2026-08-16T09:02:00.000Z",
    );
    assertIdentical(alarm.history.all.at(0)?.state, "ALARM");
    assertIdentical(
      alarm.history.all.at(1)?.timestamp.toISOString(),
      "2026-08-16T09:01:00.000Z",
    );
    assertIdentical(alarm.history.all.at(1)?.state, "OK");
  });

  it("walks one evaluation per period across a long advance", async () => {
    // Given an alarm over a metric nothing is publishing to, told to treat a
    // missing period as breaching.
    const simAws = await withAlarm({
      TreatMissingData: "breaching",
      DatapointsToAlarm: 3,
    });

    // When twenty minutes pass in one call.
    await simAws.clock().advanceBy({ minutes: 20 });

    // Then it evaluated its way there rather than jumping, and it fired once
    // and stayed there. It fires on its first evaluation because the window a
    // new alarm looks back over reaches before the alarm existed, and those
    // periods are as missing as any other: real CloudWatch puts an alarm over
    // a metric nothing publishes into ALARM straight away too.
    const alarm = simAws.cloudWatch().allAlarms().at(0);

    assertNonNullable(alarm);
    assertIdentical(alarm.state, "ALARM");
    assertArrayLength(alarm.history.all, 1);
    assertIdentical(
      alarm.history.all.at(0)?.timestamp.toISOString(),
      "2026-08-16T09:01:00.000Z",
    );
  });

  it("evaluates on the new period when an alarm's period is changed", async () => {
    // Given an alarm evaluating once an hour.
    const simAws = await withAlarm({
      Period: 3600,
      EvaluationPeriods: 1,
      DatapointsToAlarm: 1,
      TreatMissingData: "breaching",
    });

    // When it is put again with a one-minute period, well before the hour it
    // was first scheduled for.
    await simAws.clock().advanceBy({ minutes: 5 });
    await simAws.cloudWatch().putMetricAlarm(
      new PutMetricAlarmCommand({
        AlarmName: "OrdersFailing",
        Namespace: "Orders",
        MetricName: "Failed",
        Statistic: "Sum",
        Period: 60,
        EvaluationPeriods: 1,
        DatapointsToAlarm: 1,
        Threshold: 5,
        ComparisonOperator: "GreaterThanThreshold",
        TreatMissingData: "breaching",
      }),
    );
    await simAws.clock().advanceBy({ minutes: 1 });

    // Then it evaluated on the minute it now watches, rather than holding the
    // turn it had booked for the top of the hour.
    assertIdentical(await stateOf(simAws), "ALARM");
  });
});
