import {
  DeleteAlarmsCommand,
  DescribeAlarmsCommand,
  PutMetricAlarmCommand,
  SetAlarmStateCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { SimCloudWatchInvalidParameterValueException } from "./error/sim-cloudwatch.error.js";

const startedAt = new Date("2026-08-16T09:00:00.000Z");

function alarm(
  AlarmName: string,
  overrides: Partial<PutMetricAlarmCommand["input"]> = {},
): PutMetricAlarmCommand {
  return new PutMetricAlarmCommand({
    AlarmName,
    Namespace: "Orders",
    MetricName: "Failed",
    Statistic: "Sum",
    Period: 60,
    EvaluationPeriods: 1,
    Threshold: 5,
    ComparisonOperator: "GreaterThanThreshold",
    ...overrides,
  });
}

async function simulation(): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.clock().setTo(startedAt);

  return simAws;
}

describe("SimCloudWatch alarm management", () => {
  it("reports an alarm with everything it was configured with", async () => {
    // Given an alarm created with a full configuration.
    const simAws = await simulation();

    await simAws.cloudWatch().putMetricAlarm(
      alarm("OrdersFailing", {
        AlarmDescription: "Orders are failing",
        Dimensions: [{ Name: "Channel", Value: "web" }],
        DatapointsToAlarm: 1,
        TreatMissingData: "notBreaching",
      }),
    );

    // When it is described.
    const described = await simAws
      .cloudWatch()
      .describeAlarms(new DescribeAlarmsCommand({}));
    const reported = described.MetricAlarms?.at(0);

    // Then everything it was given comes back, with the ARN naming its
    // account and region.
    assertNonNullable(reported);
    assertIdentical(reported.AlarmName, "OrdersFailing");
    assertIdentical(reported.AlarmDescription, "Orders are failing");
    assertIdentical(
      reported.AlarmArn,
      `arn:aws:cloudwatch:${simAws.defaultRegionName}:${simAws.defaultAccountId}:alarm:OrdersFailing`,
    );
    assertIdentical(reported.StateValue, "INSUFFICIENT_DATA");
    assertIdentical(reported.DatapointsToAlarm, 1);
    assertIdentical(reported.TreatMissingData, "notBreaching");
    assertTrue(reported.ActionsEnabled);
    assertArrayEquals(
      reported.Dimensions.map((dimension) => dimension.Value),
      ["web"],
    );
  });

  it("keeps state and history when an alarm is reconfigured", async () => {
    // Given an alarm that has fired.
    const simAws = await simulation();

    await simAws.cloudWatch().putMetricAlarm(alarm("OrdersFailing"));
    await simAws.cloudWatch().setAlarmState(
      new SetAlarmStateCommand({
        AlarmName: "OrdersFailing",
        StateValue: "ALARM",
        StateReason: "Forced",
      }),
    );

    // When it is put again with a different threshold.
    await simAws
      .cloudWatch()
      .putMetricAlarm(alarm("OrdersFailing", { Threshold: 500 }));

    // Then there is still one alarm, holding the state and history it had:
    // real PutMetricAlarm updates an alarm rather than replacing it.
    const alarms = simAws.cloudWatch().allAlarms();

    assertArrayLength(alarms, 1);
    assertIdentical(alarms.at(0)?.state, "ALARM");
    assertIdentical(alarms.at(0)?.definition.threshold, 500);
    assertArrayLength(alarms.at(0)?.history.all ?? [], 1);
  });

  it("stops evaluating an alarm once it is deleted", async () => {
    // Given an alarm watching a metric that would fire it.
    const simAws = await simulation();

    await simAws
      .cloudWatch()
      .putMetricAlarm(
        alarm("OrdersFailing", { TreatMissingData: "breaching" }),
      );

    // When it is deleted before any time passes, and then time passes.
    await simAws
      .cloudWatch()
      .deleteAlarms(new DeleteAlarmsCommand({ AlarmNames: ["OrdersFailing"] }));
    await simAws.clock().advanceBy({ minutes: 10 });

    // Then it is gone and nothing kept evaluating it, which is what stops a
    // deleted alarm holding the simulation open.
    assertArrayLength(simAws.cloudWatch().allAlarms(), 0);
  });

  it("refuses to set the state of an alarm that is not there", async () => {
    // Given a simulation with no alarms.
    const simAws = await simulation();

    // When a state is forced on a name that does not exist.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.cloudWatch().setAlarmState(
          new SetAlarmStateCommand({
            AlarmName: "Missing",
            StateValue: "ALARM",
            StateReason: "Forced",
          }),
        ),
    );

    // Then it says so rather than quietly doing nothing.
    assertInstanceOf(error, SimCloudWatchInvalidParameterValueException);
  });
});
