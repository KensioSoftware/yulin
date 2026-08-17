# Simulated CloudWatch metrics and alarms

Yulin includes a simulated Amazon CloudWatch for tests and local development. It holds custom
metrics: the datapoints `PutMetricData` publishes, and the statistics `GetMetricStatistics` and
`GetMetricData` read back from them, without an AWS account. It also holds alarms over those
metrics, which evaluate on the simulation's clock and notify an SNS topic when they change state.

Code that publishes a business metric is code teams already have, and until now the only way to test
it was to assert that the SDK client had been called. That proves the call was made. What it
measured goes untested.

Only custom metrics live here. This simulation publishes into no `AWS/` namespace. A query for
`AWS/Lambda` `Invocations` comes back empty, in place of a number that was never measured.

CloudWatch specific types are imported from the `@kensio/yulin/cloudwatch` subpath.

## Publishing and reading back a metric

A metric is identified by its namespace, its name and its dimensions together. Publishing a value
and asking for it back at a period is the whole loop:

```typescript sim-cloudwatch-publish-and-read
/**
 * Publishing a custom metric and reading it back as statistics.
 */

import {
  GetMetricStatisticsCommand,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const metrics = simAws.cloudWatch();

await metrics.putMetricData(
  new PutMetricDataCommand({
    Namespace: "Orders",
    MetricData: [
      {
        MetricName: "Failed",
        Value: 1,
        Unit: "Count",
        Timestamp: new Date("2026-08-16T09:00:10.000Z"),
        Dimensions: [{ Name: "Channel", Value: "web" }],
      },
    ],
  }),
);

const read = await metrics.getMetricStatistics(
  new GetMetricStatisticsCommand({
    Namespace: "Orders",
    MetricName: "Failed",
    Dimensions: [{ Name: "Channel", Value: "web" }],
    StartTime: new Date("2026-08-16T09:00:00.000Z"),
    EndTime: new Date("2026-08-16T09:05:00.000Z"),
    Period: 60,
    Statistics: ["Sum", "SampleCount"],
  }),
);

// One datapoint, stamped with the start of the minute the value fell in.
console.log(read.Datapoints?.at(0)?.Sum);
```

A datum may state its values as a plain `Value`, as a `StatisticValues` summary, or as `Values` with
matching `Counts`. All three answer the same statistics, and a metric published one way reads back
like a metric published another.

Values are checked the way real CloudWatch checks them: within -2^360 to 2^360, never `NaN` or an
infinity, at most 150 unique values in one datum, and `Counts` only alongside the `Values` it
counts. `Unit` is the closed `StandardUnit` set, not free text, on the way in and on the way out. A
query naming a unit CloudWatch lacks fails here as it would in an account.

## Metrics are identified by their dimensions

Real CloudWatch leaves a custom metric unrolled across its dimensions, and so does this. The same
metric name published under two channels is two metrics, and a read naming no dimensions reaches the
metric that was published with none, not the total of all of them.

That is the behaviour teams most often get wrong, and it is worth a test of its own. A dashboard
query written against a metric name alone finds nothing at all if every publish carried a dimension.

## Metrics and simulated time

A datum carrying no `Timestamp` is stamped from the simulation's clock, not the host's. A test with
a frozen clock therefore gets timestamps it can assert on exactly, and one that moves time on gets
datapoints in the period it moved to:

```typescript sim-cloudwatch-simulated-time
/**
 * Publishing metrics across simulated minutes, and reading a value per minute.
 */

import {
  GetMetricDataCommand,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const metrics = simAws.cloudWatch();
const startedAt = new Date("2026-08-16T09:00:00.000Z");

await simAws.clock().setTo(startedAt);

// Three failures, one a minute, without waiting three real minutes.
for (let minute = 0; minute < 3; minute++) {
  await metrics.putMetricData(
    new PutMetricDataCommand({
      Namespace: "Orders",
      MetricData: [{ MetricName: "Failed", Value: 1 }],
    }),
  );
  await simAws.clock().advanceBy({ minutes: 1 });
}

const read = await metrics.getMetricData(
  new GetMetricDataCommand({
    MetricDataQueries: [
      {
        Id: "failed",
        MetricStat: {
          Metric: { Namespace: "Orders", MetricName: "Failed" },
          Period: 60,
          Stat: "Sum",
        },
      },
    ],
    StartTime: startedAt,
    EndTime: new Date("2026-08-16T09:03:00.000Z"),
    ScanBy: "TimestampAscending",
  }),
);

// [1, 1, 1]: one failure in each of the three simulated minutes.
console.log(read.MetricDataResults?.at(0)?.Values);
```

`ListMetrics` reads `RecentlyActive: "PT3H"` against the same clock, so advancing time past the
window drops a metric out of the listing without anything having to expire it.

## Alarms

An alarm watches one metric and changes state on the simulation's clock, with no real timer behind
it. Each evaluation is scheduled at the next period boundary. A frozen clock evaluates nothing, and
advancing time by twenty minutes walks twenty one-minute evaluations and settles before the next
line of the test runs.

```typescript sim-cloudwatch-alarm
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
```

A new alarm is in `INSUFFICIENT_DATA` until it has evaluated a period, as on real CloudWatch. The
window it looks back over reaches behind the moment the alarm was created. An alarm over a metric
nothing publishes into, with `TreatMissingData: "breaching"`, therefore fires on its first
evaluation, without waiting for the periods to accumulate. That is what an account does too.

### Reaching a subscriber

An alarm notifies through the ordinary `Publish` path. A notification fans out to the topic's
subscriptions exactly as an SDK caller's message would, with the JSON body real CloudWatch sends:
`AlarmName`, `NewStateValue`, `OldStateValue`, `NewStateReason`, `StateChangeTime` and `Trigger`.
Only a change fires anything, and an alarm that stays in `ALARM` across ten periods notifies once.

`SetAlarmState` forces a transition and fires its actions. That is how a test exercises a subscriber
without arranging for a metric to breach at all.

The topic has to be in the same account and region as the alarm, as real CloudWatch requires. An
action that lands nowhere is recorded, never passed over quietly:

```typescript sim-cloudwatch-alarm-failures
/**
 * Finding out that an alarm action reached nothing.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// ...after an alarm with a bad action ARN has fired:
for (const failure of simAws.cloudWatch().alarmActionFailures) {
  console.log(failure.alarmName, failure.actionArn, failure.reason);
}
```

Real CloudWatch tells nobody when an alarm action fails, and this tells nobody either. The alarm
changes state regardless. Keeping the failure is what stops a subscriber's queue being mysteriously
empty.

### What an alarm can watch and do

- The four threshold comparison operators, `DatapointsToAlarm` for M-of-N evaluation, and all four
  `TreatMissingData` treatments including `ignore`, which leaves the alarm where it is.
- `ActionsEnabled: false` still evaluates and records state. It just publishes no notification.
- `DescribeAlarmHistory` reports the state changes with the simulated time each happened at.
- An SNS topic ARN is the only action target. Auto Scaling, EC2, Systems Manager and Lambda actions
  are refused, never stored and ignored, because an alarm that fired into nowhere would let a test
  pass while the thing the alarm exists to do never happened.
- Composite alarms, anomaly detection and metric math alarms are all refused.

## Declaring an alarm in a template

Alarms are nearly always declared in infrastructure rather than created through the SDK, so
`AWS::CloudWatch::Alarm` is deployed by simulated CloudFormation. The alarm a stack creates is the
same thing `PutMetricAlarm` creates. It evaluates on the clock, fires on a transition, and refuses
what the command refuses.

```yaml
OrdersFailing:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: OrdersFailing
    Namespace: Orders
    MetricName: Failed
    Statistic: Sum
    Period: 60
    EvaluationPeriods: 3
    DatapointsToAlarm: 2
    Threshold: 5
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref Alerts
```

`Ref` resolves to the alarm name and `Fn::GetAtt Arn` to the alarm ARN. An `AlarmActions` entry
holding a `Ref` to an `AWS::SNS::Topic` in the same stack resolves to that topic's ARN. A test can
deploy the stack, publish a breaching datapoint, advance the clock and read the notification off
whatever is subscribed. Deleting the stack deletes the alarm and takes its scheduled evaluation back
off the clock with it.

`AlarmName` may be left out, and the alarm is then named after the stack and the logical ID. A test
still has a name to pass to `DescribeAlarms`. Real CloudFormation generates a physical ID of the
same shape with a random tail on the end. The tail is left off here, so the name is one a test can
predict.

These are the properties acted on: `AlarmName`, `AlarmDescription`, `ActionsEnabled`,
`AlarmActions`, `OKActions`, `InsufficientDataActions`, `Namespace`, `MetricName`, `Dimensions`,
`Statistic`, `Unit`, `Period`, `EvaluationPeriods`, `DatapointsToAlarm`, `Threshold`,
`ComparisonOperator` and `TreatMissingData`.

`Metrics`, `ThresholdMetricId`, `ExtendedStatistic` and `EvaluateLowSampleCountPercentile` are
refused, in the same words `PutMetricAlarm` refuses them with. Each of them changes what the alarm
watches or how it decides. An alarm deployed with one ignored would sit in a test looking configured
and evaluating something else.

`Tags` is the one difference from the command, which refuses it outright. Real CloudFormation tags
the alarm it creates, and this leaves the alarm untagged. A template's tags are usually the whole
stack's rather than the alarm's, and they are recorded as an ignored property, leaving the deploy
standing. Nothing reads them back either. An alarm deployed with tags behaves as though the template
had never named them.

`AWS::CloudWatch::CompositeAlarm`, `AWS::CloudWatch::Dashboard` and
`AWS::CloudWatch::AnomalyDetector` are left undeployed, and recorded as gaps in the stack.

## Permissions

CloudWatch metrics have no ARN, leaving a policy nothing to name. Every metric action here is
granted on `*`. A policy written against something like
`arn:aws:cloudwatch:eu-west-2:111111111111:metric/Orders/Failed` reaches nothing, here and in an
account.

Alarms are the exception, and do have an ARN. `PutMetricAlarm`, `DeleteAlarms` and `SetAlarmState`
authorize against `arn:aws:cloudwatch:<region>:<account>:alarm:<name>`, while `DescribeAlarms` and
`DescribeAlarmHistory` take no resource-level permission at all, exactly as on real CloudWatch.

The one way to narrow publishing is the `cloudwatch:namespace` condition key:

```typescript sim-cloudwatch-permissions
/**
 * A simulated IAM policy allowing a Role to publish into one namespace only.
 */

import { PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrdersFunctionRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "OrdersFunctionRole",
    PolicyName: "PublishOrdersMetrics",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "cloudwatch:PutMetricData",
        // Metrics have no ARN, so the namespace condition is what scopes this.
        Resource: "*",
        Condition: { StringEquals: { "cloudwatch:namespace": "Orders" } },
      },
    }),
  }),
);

const asRole = { caller: { kind: "arn", arn: role.Role.Arn } } as const;

await simAws.cloudWatch().putMetricData(
  new PutMetricDataCommand({
    Namespace: "Orders",
    MetricData: [{ MetricName: "Failed", Value: 1 }],
  }),
  asRole,
);

// Publishing into any other namespace as this Role is denied.
```

## What is simulated

- `PutMetricData`, with `Value`, `StatisticValues` and `Values`/`Counts`.
- `ListMetrics`, filtered by namespace, metric name and dimensions, with `RecentlyActive` and
  `NextToken` paging.
- `GetMetricStatistics`, with `SampleCount`, `Average`, `Sum`, `Minimum` and `Maximum` over periods
  of a whole number of minutes, filtered by `Unit`.
- `GetMetricData`, with `MetricStat` queries, `ScanBy` and `ReturnData`.
- `PutMetricAlarm`, `DescribeAlarms`, `DeleteAlarms`, `SetAlarmState` and `DescribeAlarmHistory`,
  with evaluation on the simulation's clock and SNS notifications on a state change.
- IAM authorization on each action, including the `cloudwatch:namespace` condition key and
  alarm-ARN resources.
- `AWS::CloudWatch::Alarm` in simulated CloudFormation, deployed through `PutMetricAlarm` and taken
  down with the stack.

## What is refused, and how it says so

Anything real CloudWatch would accept and this leaves undone is refused with a message saying so,
rather than accepted and ignored. A silently dropped filter is worse than a failure, because the
test still passes and no longer means what it says.

- **Composite and anomaly detection alarms.** `Metrics` and `ThresholdMetricId` on `PutMetricAlarm`
  are refused. There is no trained model here for an anomaly band to come from.
- **Metric math.** A `GetMetricData` query carrying an `Expression` is refused.
- **Percentiles and other extended statistics.** They need the individual values behind a period,
  which a `StatisticValues` datum never carries, so CloudWatch itself cannot report one for a metric
  published that way.
- **High-resolution metrics.** `StorageResolution: 1` is refused. Every period here is a whole
  number of minutes.
- **`MaxDatapoints`.** Real CloudWatch answers it by widening the period, and every result here
  comes back at the period its query asked for.
- **Cross-account metrics.** `IncludeLinkedAccounts` and `OwningAccount` are refused. There is no
  monitoring account.
- **Metrics AWS publishes.** No simulated service writes its own `AWS/` metrics.

Two divergences are deliberate, and not refusals. Real CloudWatch rejects a datapoint more than two
weeks old or more than two hours in the future, and this accepts any timestamp, letting a test seed
a window without arranging the clock around it. And datapoints come back earliest first, which real
CloudWatch's contract permits without promising, because a test reading the third period of five
needs an order it can rely on.
