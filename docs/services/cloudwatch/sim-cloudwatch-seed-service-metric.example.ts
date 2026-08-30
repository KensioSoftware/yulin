/**
 * Driving an alarm on a metric nothing in the simulation publishes.
 */

import {
  DescribeAlarmsCommand,
  PutMetricAlarmCommand,
} from "@aws-sdk/client-cloudwatch";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.clock().setTo(new Date("2026-08-30T09:00:00Z"));

await simAws.cloudWatch().putMetricAlarm(
  new PutMetricAlarmCommand({
    AlarmName: "SignInsThrottling",
    Namespace: "AWS/Cognito",
    MetricName: "SignInThrottles",
    Dimensions: [{ Name: "UserPool", Value: "eu-west-1_pool" }],
    Statistic: "Sum",
    Period: 300,
    EvaluationPeriods: 3,
    DatapointsToAlarm: 1,
    Threshold: 0,
    ComparisonOperator: "GreaterThanThreshold",
    TreatMissingData: "notBreaching",
  }),
);

// The pool would have published this. Nothing here does, so the test does.
simAws
  .cloudWatch()
  .serviceWriter()
  .publish([
    {
      namespace: "AWS/Cognito",
      metricName: "SignInThrottles",
      dimensions: [{ Name: "UserPool", Value: "eu-west-1_pool" }],
      value: 4,
      unit: "Count",
    },
  ]);

await simAws.backgroundTasksComplete();
await simAws.clock().advanceBy({ minutes: 6 });

const { MetricAlarms } = await simAws
  .cloudWatch()
  .describeAlarms(
    new DescribeAlarmsCommand({ AlarmNames: ["SignInsThrottling"] }),
  );

// ALARM.
console.log(MetricAlarms?.[0]?.StateValue);
