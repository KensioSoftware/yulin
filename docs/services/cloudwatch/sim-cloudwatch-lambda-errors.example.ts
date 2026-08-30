/**
 * An alarm firing on the errors a failing function counted.
 */

import {
  DescribeAlarmsCommand,
  PutMetricAlarmCommand,
} from "@aws-sdk/client-cloudwatch";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();

await simAws.clock().setTo(new Date("2026-08-30T09:00:00Z"));
await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
    Code: {
      ZipFile: makeLambdaZipFileInput(() => {
        throw new Error("order has no items");
      }),
    },
  }),
);
await simAws.backgroundTasksComplete();

await simAws.cloudWatch().putMetricAlarm(
  new PutMetricAlarmCommand({
    AlarmName: "OrdersFailing",
    Namespace: "AWS/Lambda",
    MetricName: "Errors",
    Dimensions: [{ Name: "FunctionName", Value: "orders" }],
    Statistic: "Sum",
    Period: 300,
    EvaluationPeriods: 3,
    DatapointsToAlarm: 1,
    Threshold: 0,
    ComparisonOperator: "GreaterThanThreshold",
    TreatMissingData: "notBreaching",
  }),
);

await simAws.lambda().invoke(new InvokeCommand({ FunctionName: "orders" }));
await simAws.backgroundTasksComplete();
await simAws.clock().advanceBy({ minutes: 6 });

const { MetricAlarms } = await simAws
  .cloudWatch()
  .describeAlarms(new DescribeAlarmsCommand({ AlarmNames: ["OrdersFailing"] }));

// ALARM. The invocation counted its own error.
console.log(MetricAlarms?.[0]?.StateValue);
