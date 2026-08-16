import {
  DeleteAlarmsCommand,
  DescribeAlarmHistoryCommand,
  DescribeAlarmsCommand,
  PutMetricAlarmCommand,
  PutMetricDataCommand,
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

  it("selects alarms by name, prefix and state", async () => {
    // Given three alarms, one of them fired.
    const simAws = await simulation();

    await simAws.cloudWatch().putMetricAlarm(alarm("orders-failing"));
    await simAws.cloudWatch().putMetricAlarm(alarm("orders-slow"));
    await simAws.cloudWatch().putMetricAlarm(alarm("billing-failing"));
    await simAws.cloudWatch().setAlarmState(
      new SetAlarmStateCommand({
        AlarmName: "orders-slow",
        StateValue: "ALARM",
        StateReason: "Forced",
      }),
    );

    // When each filter is applied.
    const named = await simAws
      .cloudWatch()
      .describeAlarms(
        new DescribeAlarmsCommand({ AlarmNames: ["billing-failing"] }),
      );
    const prefixed = await simAws
      .cloudWatch()
      .describeAlarms(
        new DescribeAlarmsCommand({ AlarmNamePrefix: "orders-" }),
      );
    const firing = await simAws
      .cloudWatch()
      .describeAlarms(new DescribeAlarmsCommand({ StateValue: "ALARM" }));

    // Then each selects what it names.
    assertArrayLength(named.MetricAlarms ?? [], 1);
    assertArrayLength(prefixed.MetricAlarms ?? [], 2);
    assertArrayEquals(
      firing.MetricAlarms?.map((one) => one.AlarmName),
      ["orders-slow"],
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

  it("reports the history of an alarm's state changes, newest first", async () => {
    // Given an alarm driven through two transitions a minute apart.
    const simAws = await simulation();

    await simAws
      .cloudWatch()
      .putMetricAlarm(alarm("OrdersFailing", { EvaluationPeriods: 1 }));
    await simAws.cloudWatch().putMetricData(
      new PutMetricDataCommand({
        Namespace: "Orders",
        MetricData: [{ MetricName: "Failed", Value: 10 }],
      }),
    );
    await simAws.clock().advanceBy({ minutes: 1 });
    await simAws.cloudWatch().putMetricData(
      new PutMetricDataCommand({
        Namespace: "Orders",
        MetricData: [{ MetricName: "Failed", Value: 1 }],
      }),
    );
    await simAws.clock().advanceBy({ minutes: 1 });

    // When the history is read.
    const history = await simAws
      .cloudWatch()
      .describeAlarmHistory(
        new DescribeAlarmHistoryCommand({ AlarmName: "OrdersFailing" }),
      );
    const items = history.AlarmHistoryItems ?? [];

    // Then both transitions are there, newest first, stamped with the
    // simulated time each happened at.
    assertArrayLength(items, 2);
    assertIdentical(items.at(0)?.HistoryItemType, "StateUpdate");
    assertIdentical(
      items.at(0)?.Timestamp.toISOString(),
      "2026-08-16T09:02:00.000Z",
    );
    assertIdentical(
      items.at(1)?.Timestamp.toISOString(),
      "2026-08-16T09:01:00.000Z",
    );
    assertIdentical(
      items.at(0)?.HistorySummary,
      "Alarm updated from ALARM to OK",
    );
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

  it("selects alarms by the actions they carry, and history by date", async () => {
    // Given two alarms notifying different topics, one of which transitions.
    const simAws = await simulation();
    const topicArn = `arn:aws:sns:${simAws.defaultRegionName}:${simAws.defaultAccountId}:paging`;

    await simAws
      .cloudWatch()
      .putMetricAlarm(alarm("paged", { AlarmActions: [topicArn] }));
    await simAws.cloudWatch().putMetricAlarm(alarm("quiet"));
    await simAws.cloudWatch().setAlarmState(
      new SetAlarmStateCommand({
        AlarmName: "paged",
        StateValue: "ALARM",
        StateReason: "Forced",
      }),
    );

    // When alarms are selected by action prefix, and history by a window that
    // ends before the transition.
    const paging = await simAws.cloudWatch().describeAlarms(
      new DescribeAlarmsCommand({
        ActionPrefix: `arn:aws:sns:${simAws.defaultRegionName}`,
      }),
    );
    const before = await simAws
      .cloudWatch()
      .describeAlarmHistory(
        new DescribeAlarmHistoryCommand({ EndDate: startedAt }),
      );
    const including = await simAws.cloudWatch().describeAlarmHistory(
      new DescribeAlarmHistoryCommand({
        StartDate: startedAt,
        EndDate: new Date("2026-08-16T10:00:00.000Z"),
      }),
    );

    // Then each filter selects what it names, and the history window excludes
    // its end as CloudWatch reads one.
    assertArrayEquals(
      paging.MetricAlarms?.map((one) => one.AlarmName),
      ["paged"],
    );
    assertArrayLength(before.AlarmHistoryItems ?? [], 0);
    assertArrayLength(including.AlarmHistoryItems ?? [], 1);
  });
});
