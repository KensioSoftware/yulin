import {
  DescribeAlarmsCommand,
  GetMetricStatisticsCommand,
  PutMetricAlarmCommand,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimCloudWatchInvalidParameterValueException } from "../error/sim-cloudwatch.error.js";

const startedAt = new Date("2026-08-30T09:00:00.000Z");
const dimensions = [{ Name: "UserPool", Value: "eu-west-1_pool" }];

/** A simulation with a stopped clock. */
async function simAwsAtStartedAt(): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.clock().setTo(startedAt);

  return simAws;
}

/** The `Sum` of one AWS/Cognito metric over the five minutes from the start. */
async function seeded(simAws: SimAws): Promise<number | undefined> {
  const statistics = new GetMetricStatisticsCommand({
    Namespace: "AWS/Cognito",
    MetricName: "SignInThrottles",
    Dimensions: dimensions,
    StartTime: startedAt,
    EndTime: new Date(startedAt.getTime() + 300_000),
    Period: 300,
    Statistics: ["Sum"],
  });
  const { Datapoints } = await simAws
    .cloudWatch()
    .getMetricStatistics(statistics);

  return Datapoints?.at(0)?.Sum;
}

describe("SimCloudWatchServiceWriter", () => {
  it("seeds a metric a caller may not write into", async () => {
    // Given a simulation whose clock is stopped.
    const simAws = await simAwsAtStartedAt();

    // When a datapoint is published into a reserved namespace.
    simAws
      .cloudWatch()
      .serviceWriter()
      .publish([
        {
          namespace: "AWS/Cognito",
          metricName: "SignInThrottles",
          dimensions,
          value: 4,
          unit: "Count",
        },
      ]);

    // Then a query reads it back the way it reads a custom metric.
    assertIdentical(await seeded(simAws), 4);
  });

  it("stamps a datapoint with the simulation's clock", async () => {
    // Given a simulation whose clock is stopped.
    const simAws = await simAwsAtStartedAt();

    // When a datapoint arrives carrying no timestamp of its own.
    simAws
      .cloudWatch()
      .serviceWriter()
      .publish([
        {
          namespace: "AWS/Cognito",
          metricName: "SignInThrottles",
          dimensions,
          value: 1,
        },
      ]);

    // Then it landed at the instant the clock is stopped at, which is what
    // puts it inside a window a test asks for.
    assertIdentical(await seeded(simAws), 1);
  });

  it("honours a timestamp a datapoint carries", async () => {
    // Given a simulation whose clock has moved past the window.
    const simAws = await simAwsAtStartedAt();

    await simAws.clock().advanceBy({ hours: 2 });

    // When a datapoint names an instant back inside it.
    simAws
      .cloudWatch()
      .serviceWriter()
      .publish([
        {
          namespace: "AWS/Cognito",
          metricName: "SignInThrottles",
          dimensions,
          value: 7,
          timestamp: startedAt.getTime(),
        },
      ]);

    // Then it landed where it said rather than where the clock is, which is
    // how a test seeds a window without arranging the clock around it.
    assertIdentical(await seeded(simAws), 7);
  });

  it("leaves PutMetricData refusing the same namespace", async () => {
    // Given a simulation whose clock is stopped.
    const simAws = await simAwsAtStartedAt();

    // When a caller tries to write the datapoint the service writer just did.
    const data = new PutMetricDataCommand({
      Namespace: "AWS/Cognito",
      MetricData: [
        { MetricName: "SignInThrottles", Dimensions: dimensions, Value: 4 },
      ],
    });
    const error = await assertThrowsErrorAsync(
      async () => await simAws.cloudWatch().putMetricData(data),
    );

    // Then it is refused, as real CloudWatch refuses it. Seeding is a route a
    // caller has none of.
    assertInstanceOf(error, SimCloudWatchInvalidParameterValueException);
    assertIdentical(error.name, "InvalidParameterValueException");
  });

  it("drives an alarm on a reserved metric to ALARM", async () => {
    // Given an alarm watching a metric nothing in the simulation publishes.
    const simAws = await simAwsAtStartedAt();

    await simAws.cloudWatch().putMetricAlarm(
      new PutMetricAlarmCommand({
        AlarmName: "SignInsThrottling",
        Namespace: "AWS/Cognito",
        MetricName: "SignInThrottles",
        Dimensions: dimensions,
        Statistic: "Sum",
        Period: 300,
        EvaluationPeriods: 3,
        DatapointsToAlarm: 1,
        Threshold: 0,
        ComparisonOperator: "GreaterThanThreshold",
        TreatMissingData: "notBreaching",
      }),
    );

    // When a datapoint is seeded and the clock passes the period.
    simAws
      .cloudWatch()
      .serviceWriter()
      .publish([
        {
          namespace: "AWS/Cognito",
          metricName: "SignInThrottles",
          dimensions,
          value: 4,
          unit: "Count",
        },
      ]);
    await simAws.backgroundTasksComplete();
    await simAws.clock().advanceBy({ minutes: 6 });

    // Then the alarm went off, which is the arithmetic a test could not reach
    // while the datapoint had no way in.
    const described = new DescribeAlarmsCommand({
      AlarmNames: ["SignInsThrottling"],
    });
    const { MetricAlarms } = await simAws
      .cloudWatch()
      .describeAlarms(described);

    assertIdentical(MetricAlarms?.at(0)?.StateValue, "ALARM");
  });
});
