# Simulated CloudWatch metrics

Yulin includes a simulated Amazon CloudWatch for tests and local development. It holds custom
metrics: the datapoints `PutMetricData` publishes, and the statistics `GetMetricStatistics` and
`GetMetricData` read back from them, without an AWS account.

That is what this service is for. Code that publishes a business metric is code teams already have,
and until now the only way to test it was to assert that the SDK client had been called, which
proves the call was made and nothing about what it measured.

Only custom metrics live here. Nothing in this simulation publishes into the `AWS/` namespaces, so a
query for `AWS/Lambda` `Invocations` finds nothing rather than a number that was never measured.

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
matching `Counts`. All three answer the same statistics, so a metric published one way reads back
like a metric published another.

Values are checked the way real CloudWatch checks them: within -2^360 to 2^360, never `NaN` or an
infinity, at most 150 unique values in one datum, and `Counts` only alongside the `Values` it counts.
`Unit` is the closed `StandardUnit` set rather than free text, on the way in and on the way out, so a
query naming a unit CloudWatch does not have fails here as it would in an account rather than
quietly matching nothing.

## Metrics are identified by their dimensions

Real CloudWatch does not roll a custom metric up across its dimensions, and neither does this. The
same metric name published under two channels is two metrics, and a read naming no dimensions
reaches the metric that was published with none rather than the total of all of them.

That is the behaviour teams most often get wrong, so it is worth a test of its own: a dashboard
query written against a metric name alone finds nothing at all if every publish carried a dimension.

## Metrics and simulated time

A datum carrying no `Timestamp` is stamped from the simulation's clock, not the host's. A test with a
frozen clock therefore gets timestamps it can assert on exactly, and one that moves time on gets
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

## Permissions

CloudWatch metrics have no ARN, so there is nothing for a policy to name: every action here is
granted on `*`. A policy written against something like
`arn:aws:cloudwatch:eu-west-2:111111111111:metric/Orders/Failed` reaches nothing, here and in an
account.

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
- IAM authorization on each action, including the `cloudwatch:namespace` condition key.

## What is not, and how it says so

Anything real CloudWatch would accept and this does not carry out is refused with a message saying
so, rather than accepted and ignored. A silently dropped filter is worse than a failure, because the
test still passes and no longer means what it says.

- **Alarms.** Nothing here evaluates a threshold or fires an action yet.
- **Metric math.** A `GetMetricData` query carrying an `Expression` is refused.
- **Percentiles and other extended statistics.** They need the individual values behind a period,
  which a `StatisticValues` datum never carries, so CloudWatch itself cannot report one for a metric
  published that way.
- **High-resolution metrics.** `StorageResolution: 1` is refused; every period here is a whole
  number of minutes.
- **`MaxDatapoints`.** Real CloudWatch answers it by widening the period, and every result here comes
  back at the period its query asked for.
- **Cross-account metrics.** `IncludeLinkedAccounts` and `OwningAccount` are refused; there is no
  monitoring account.
- **Metrics AWS publishes.** No simulated service writes its own `AWS/` metrics.

Two divergences are deliberate rather than refusals. Real CloudWatch rejects a datapoint more than
two weeks old or more than two hours in the future, and this accepts any timestamp, so that a test
can seed a window without arranging the clock around it. And datapoints come back earliest first,
which real CloudWatch's contract permits but does not promise, because a test reading the third
period of five needs an order it can rely on.
