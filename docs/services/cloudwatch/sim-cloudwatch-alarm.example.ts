/**
 * An alarm that fires into an SNS topic once two of three minutes breach.
 */

import {
  DescribeAlarmsCommand,
  PutMetricAlarmCommand,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import { CreateTopicCommand } from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const metrics = simAws.cloudWatch();

await simAws.clock().setTo(new Date("2026-08-16T09:00:00.000Z"));

const topic = await simAws
  .sns()
  .createTopic(new CreateTopicCommand({ Name: "orders-alerts" }));

await metrics.putMetricAlarm(
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
    AlarmActions: [String(topic.TopicArn)],
  }),
);

// Two breaching minutes, without waiting two real minutes.
for (let minute = 0; minute < 2; minute++) {
  await metrics.putMetricData(
    new PutMetricDataCommand({
      Namespace: "Orders",
      MetricData: [{ MetricName: "Failed", Value: 10 }],
    }),
  );
  await simAws.clock().advanceBy({ minutes: 1 });
}

const described = await metrics.describeAlarms(
  new DescribeAlarmsCommand({ AlarmNames: ["OrdersFailing"] }),
);

// "ALARM", and anything subscribed to the topic has the notification.
console.log(described.MetricAlarms?.at(0)?.StateValue);
