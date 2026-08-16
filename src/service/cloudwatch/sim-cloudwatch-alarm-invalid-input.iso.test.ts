import {
  assertArrayLength,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import type {
  SimPutMetricAlarmCommandInput,
  SimSetAlarmStateCommandInput,
} from "./command/sim-cloudwatch-command.types.js";
import {
  SimCloudWatchInvalidParameterValueException,
  SimCloudWatchMissingRequiredParameterException,
} from "./error/sim-cloudwatch.error.js";

/**
 * The alarm these tests vary one field of at a time. They are built as plain
 * command shapes because the SDK's own types refuse most of these outright: a
 * ComparisonOperator of "Sideways" does not compile.
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

async function putting(
  overrides: Partial<SimPutMetricAlarmCommandInput>,
): Promise<Error> {
  return await assertThrowsErrorAsync(
    async () =>
      await new SimAws()
        .cloudWatch()
        .putMetricAlarm({ input: { ...valid, ...overrides } }),
  );
}

async function settingState(
  input: SimSetAlarmStateCommandInput,
): Promise<Error> {
  const simAws = new SimAws();

  await simAws.cloudWatch().putMetricAlarm({ input: valid });

  return await assertThrowsErrorAsync(
    async () => await simAws.cloudWatch().setAlarmState({ input }),
  );
}

describe("SimCloudWatch invalid alarm input", () => {
  it("refuses a comparison it cannot evaluate", async () => {
    // Given operators outside the four this simulation compares with.
    // When each is used.
    const unknown = await putting({ ComparisonOperator: "Sideways" });
    const anomaly = await putting({
      ComparisonOperator: "LessThanLowerOrGreaterThanUpperThreshold",
    });

    // Then each is refused, the anomaly one saying why it cannot be
    // approximated.
    assertInstanceOf(unknown, SimCloudWatchInvalidParameterValueException);
    assertInstanceOf(anomaly, SimCloudWatchInvalidParameterValueException);
    assertStringIncludes(anomaly.message, "Anomaly detection");
  });

  it("refuses periods and a threshold that are not numbers it can use", async () => {
    // Given counts and a threshold outside what an alarm can be built from.
    // When each is used.
    const zeroPeriods = await putting({ EvaluationPeriods: 0 });
    const fractional = await putting({ EvaluationPeriods: 1.5 });
    const missingPeriods = await putting({ EvaluationPeriods: undefined });
    const tooManyDatapoints = await putting({ DatapointsToAlarm: 4 });
    const missingThreshold = await putting({ Threshold: undefined });
    const infiniteThreshold = await putting({
      Threshold: Infinity,
    });

    // Then each is refused.
    assertInstanceOf(zeroPeriods, SimCloudWatchInvalidParameterValueException);
    assertInstanceOf(fractional, SimCloudWatchInvalidParameterValueException);
    assertInstanceOf(
      missingPeriods,
      SimCloudWatchMissingRequiredParameterException,
    );
    assertInstanceOf(
      tooManyDatapoints,
      SimCloudWatchInvalidParameterValueException,
    );
    assertInstanceOf(
      missingThreshold,
      SimCloudWatchMissingRequiredParameterException,
    );
    assertInstanceOf(
      infiniteThreshold,
      SimCloudWatchInvalidParameterValueException,
    );
  });

  it("refuses a missing statistic and an unknown missing-data treatment", async () => {
    // Given an alarm with no statistic, and one with a treatment CloudWatch
    // does not have.
    // When each is used.
    const noStatistic = await putting({ Statistic: undefined });
    const treatment = await putting({ TreatMissingData: "shrug" });

    // Then each is refused.
    assertInstanceOf(
      noStatistic,
      SimCloudWatchMissingRequiredParameterException,
    );
    assertInstanceOf(treatment, SimCloudWatchInvalidParameterValueException);
  });

  it("refuses an action that is not an SNS topic, and too many of them", async () => {
    // Given actions this simulation does not carry out.
    // When each is used.
    const scaling = await putting({
      AlarmActions: [
        "arn:aws:autoscaling:us-east-1:111111111111:scalingPolicy:abc",
      ],
    });
    const tooMany = await putting({
      OKActions: Array.from(
        { length: 6 },
        (_, index) => `arn:aws:sns:us-east-1:111111111111:topic-${index}`,
      ),
    });

    // Then each is refused, rather than stored and silently never carried out.
    assertInstanceOf(scaling, SimCloudWatchInvalidParameterValueException);
    assertStringIncludes(scaling.message, "notifies an SNS topic");
    assertInstanceOf(tooMany, SimCloudWatchInvalidParameterValueException);
  });

  it("refuses the alarm kinds it does not simulate", async () => {
    // Given the inputs that make an alarm something other than a threshold
    // over one metric.
    // When each is used.
    const math = await putting({ Metrics: [{}] });
    const anomaly = await putting({ ThresholdMetricId: "ad1" });
    const percentile = await putting({ ExtendedStatistic: "p99" });
    const lowSample = await putting({
      EvaluateLowSampleCountPercentile: "ignore",
    });
    const tags = await putting({ Tags: [{}] });

    // Then each says it is not simulated rather than evaluating something
    // other than what was asked for.
    for (const error of [math, anomaly, percentile, lowSample, tags]) {
      assertInstanceOf(error, SimCloudWatchInvalidParameterValueException);
      assertStringIncludes(error.message, "not simulated");
    }
  });

  it("refuses a state that is not one an alarm can be in", async () => {
    // Given a state value outside the three.
    // When it is forced.
    const error = await settingState({
      AlarmName: "OrdersFailing",
      StateValue: "BROKEN",
    });

    // Then it is refused.
    assertInstanceOf(error, SimCloudWatchInvalidParameterValueException);
  });

  it("refuses a delete naming no alarms", async () => {
    // Given a simulation with an alarm.
    const simAws = new SimAws();

    await simAws.cloudWatch().putMetricAlarm({ input: valid });

    // When a delete carries no names.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.cloudWatch().deleteAlarms({ input: { AlarmNames: [] } }),
    );

    // Then it is refused rather than treated as nothing to do.
    assertInstanceOf(error, SimCloudWatchMissingRequiredParameterException);
    assertArrayLength(simAws.cloudWatch().allAlarms(), 1);
  });
});
