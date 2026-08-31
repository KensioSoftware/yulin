import {
  DescribeAlarmHistoryCommand,
  DescribeAlarmsCommand,
  PutMetricAlarmCommand,
  PutMetricDataCommand,
  SetAlarmStateCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayIncludes,
  assertArrayLength,
  assertIdentical,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";

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

/**
 * Force one alarm into a state, which is how these tests make a transition
 * without arranging a metric to breach.
 */
async function forceState(
  simAws: SimAws,
  AlarmName: string,
  StateValue: "ALARM" | "OK",
): Promise<void> {
  await simAws.cloudWatch().setAlarmState(
    new SetAlarmStateCommand({
      AlarmName,
      StateValue,
      StateReason: "Forced",
    }),
  );
}

/**
 * When each item in a history answer happened.
 */
function timesIn(history: {
  AlarmHistoryItems?: readonly { Timestamp: Date }[] | undefined;
}): readonly number[] {
  return (history.AlarmHistoryItems ?? []).map((item) =>
    item.Timestamp.getTime(),
  );
}

describe("SimCloudWatch alarm listings", () => {
  it("selects alarms by the actions they carry, and history by date", async () => {
    // Given two alarms notifying different topics, one of which transitions.
    const simAws = await simulation();
    const topicArn = `arn:aws:sns:${simAws.defaultRegionName}:${simAws.defaultAccountId}:paging`;

    await simAws
      .cloudWatch()
      .putMetricAlarm(alarm("paged", { OKActions: [topicArn] }));
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

    // Then each filter selects what it names, including an alarm whose only
    // action is on its OK list rather than its alarm list, and the history
    // window excludes its end as CloudWatch reads one.
    assertArrayEquals(
      paging.MetricAlarms?.map((one) => one.AlarmName),
      ["paged"],
    );
    assertArrayEmpty(before.AlarmHistoryItems ?? []);
    assertArrayLength(including.AlarmHistoryItems ?? [], 1);
  });

  it("merges the history of every alarm into one order, newest first", async () => {
    // Given two alarms whose transitions interleave in time.
    const simAws = await simulation();

    await simAws.cloudWatch().putMetricAlarm(alarm("first"));
    await simAws.cloudWatch().putMetricAlarm(alarm("second"));

    await forceState(simAws, "first", "ALARM");
    await simAws.clock().advanceBy({ minutes: 1 });
    await forceState(simAws, "second", "ALARM");
    await simAws.clock().advanceBy({ minutes: 1 });
    await forceState(simAws, "first", "OK");
    await simAws.clock().advanceBy({ minutes: 1 });

    // When the whole scope's history is read, and then read the other way.
    const newest = await simAws
      .cloudWatch()
      .describeAlarmHistory(new DescribeAlarmHistoryCommand({}));
    const oldest = await simAws
      .cloudWatch()
      .describeAlarmHistory(
        new DescribeAlarmHistoryCommand({ ScanBy: "TimestampAscending" }),
      );

    // Then it comes back in time order across both alarms rather than one
    // alarm's whole history after the other's, and the other way round when
    // asked to scan ascending.
    const descending = timesIn(newest);

    assertArrayEquals(
      descending,
      descending.toSorted((left, right) => right - left),
    );
    assertArrayEquals(timesIn(oldest), descending.toReversed());
    assertArrayIncludes(
      (newest.AlarmHistoryItems ?? []).map((item) => item.AlarmName),
      "second",
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

  it("selects history by the kind of item, of which there is one", async () => {
    // Given an alarm that has changed state once.
    const simAws = await simulation();

    await simAws.cloudWatch().putMetricAlarm(alarm("OrdersFailing"));
    await forceState(simAws, "OrdersFailing", "ALARM");

    // When state updates are asked for, and then configuration updates, which
    // this simulation does not record.
    const updates = await simAws
      .cloudWatch()
      .describeAlarmHistory(
        new DescribeAlarmHistoryCommand({ HistoryItemType: "StateUpdate" }),
      );
    const configuration = await simAws.cloudWatch().describeAlarmHistory(
      new DescribeAlarmHistoryCommand({
        HistoryItemType: "ConfigurationUpdate",
      }),
    );

    // Then the filter selects rather than being ignored, so a request for a
    // kind that is not recorded gets nothing instead of everything.
    assertArrayLength(updates.AlarmHistoryItems ?? [], 1);
    assertArrayEmpty(configuration.AlarmHistoryItems ?? []);
  });

  it("records nothing when a state is forced to the one it is already in", async () => {
    // Given an alarm already forced into ALARM.
    const simAws = await simulation();

    await simAws.cloudWatch().putMetricAlarm(alarm("OrdersFailing"));
    await forceState(simAws, "OrdersFailing", "ALARM");
    await forceState(simAws, "OrdersFailing", "ALARM");

    // When its history is read.
    const history = await simAws
      .cloudWatch()
      .describeAlarmHistory(new DescribeAlarmHistoryCommand({}));

    // Then the second call recorded nothing, because it was not a change.
    assertArrayLength(history.AlarmHistoryItems ?? [], 1);
  });
});
