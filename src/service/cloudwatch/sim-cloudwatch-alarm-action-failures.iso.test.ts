import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import type { SimPutMetricAlarmCommandInput } from "./command/sim-cloudwatch-command.types.js";
import { SimCloudWatch } from "./sim-cloudwatch.js";

/**
 * An alarm whose actions these tests point somewhere unreachable.
 */
const valid: SimPutMetricAlarmCommandInput = {
  AlarmName: "OrdersFailing",
  Namespace: "Orders",
  MetricName: "Failed",
  Statistic: "Sum",
  Period: 60,
  EvaluationPeriods: 3,
  Threshold: 5,
  ComparisonOperator: "GreaterThanThreshold",
};

describe("SimCloudWatch alarm action failures", () => {
  it("records a topic in another region as unreachable", async () => {
    // Given an alarm naming a topic in a different region, which real
    // CloudWatch does not allow either.
    const simAws = new SimAws();

    await simAws.cloudWatch().putMetricAlarm({
      input: {
        ...valid,
        AlarmActions: [
          `arn:aws:sns:eu-west-2:${simAws.defaultAccountId}:elsewhere`,
        ],
      },
    });

    // When it fires.
    await simAws.cloudWatch().setAlarmState({
      input: {
        AlarmName: "OrdersFailing",
        StateValue: "ALARM",
        StateReason: "Forced",
      },
    });
    await simAws.backgroundTasksComplete();

    // Then the failure is there to be found.
    const failure = simAws.cloudWatch().alarmActionFailures.at(0);

    assertNonNullable(failure);
    assertStringIncludes(failure.reason, "its own Account and Region");
  });

  it("reports an action reaching nothing when built without the simulation", async () => {
    // Given a simulated CloudWatch built on its own, with no SNS behind it.
    const cloudWatch = new SimCloudWatch();

    await cloudWatch.putMetricAlarm({
      input: {
        ...valid,
        AlarmActions: ["arn:aws:sns:us-east-1:111111111111:alerts"],
      },
    });

    // When an alarm fires.
    await cloudWatch.setAlarmState({
      input: {
        AlarmName: "OrdersFailing",
        StateValue: "ALARM",
        StateReason: "Forced",
      },
    });

    // Then it still changed state, and says why nothing was notified.
    assertIdentical(cloudWatch.allAlarms().at(0)?.state, "ALARM");
    assertStringIncludes(
      String(cloudWatch.alarmActionFailures.at(0)?.reason),
      "no SNS to publish to",
    );
  });

  it("warns once about an action that keeps failing the same way", async () => {
    // Given an alarm notifying a topic that is not there, driven back and
    // forth so the same action fails twice.
    const simAws = new SimAws();
    const gone = `arn:aws:sns:${simAws.defaultRegionName}:${simAws.defaultAccountId}:gone`;

    await simAws.cloudWatch().putMetricAlarm({
      input: { ...valid, AlarmActions: [gone], OKActions: [gone] },
    });

    for (const StateValue of ["ALARM", "OK"]) {
      // oxlint-disable-next-line no-await-in-loop
      await simAws.cloudWatch().setAlarmState({
        input: {
          AlarmName: "OrdersFailing",
          StateValue,
          StateReason: "Forced",
        },
      });
    }

    await simAws.backgroundTasksComplete();

    // Then both failures are kept, so a test can find either of them, even
    // though only the first was warned about.
    assertArrayLength(simAws.cloudWatch().alarmActionFailures, 2);
  });

  it("says nothing about deleting an alarm that was never there", async () => {
    // Given a simulation with no alarms.
    const simAws = new SimAws();

    // When a delete names one anyway.
    await simAws
      .cloudWatch()
      .deleteAlarms({ input: { AlarmNames: ["never-existed"] } });

    // Then it is a no-op, as real DeleteAlarms is for an unknown name.
    assertArrayLength(simAws.cloudWatch().allAlarms(), 0);
  });
});
