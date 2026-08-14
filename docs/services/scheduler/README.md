# Simulated EventBridge Scheduler

Yulin includes a simulated Amazon EventBridge Scheduler for tests and local development. Schedules
are held in memory and every operation is authorized by simulated IAM. Scheduler-specific types are
imported from the `@kensio/yulin/scheduler` subpath.

Scheduler is a separate service from [EventBridge](../eventbridge/), not a corner of it. It has its
own SDK client, its own ARN shape, and its own way of reaching a target: a schedule assumes an IAM
execution role, where an EventBridge rule relies on a resource policy admitting a service principal.
A project using Scheduler cannot be tested against simulated EventBridge rules instead, which is why
this exists separately.

## Creating a schedule

```typescript sim-scheduler-create-schedule
/**
 * Creating a schedule that invokes a function every night.
 */

import {
  CreateScheduleCommand,
  GetScheduleCommand,
} from "@aws-sdk/client-scheduler";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const scheduler = simAws.scheduler();

const created = await scheduler.createSchedule(
  new CreateScheduleCommand({
    Name: "nightly-report",
    ScheduleExpression: "cron(0 2 * * ? *)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: {
      Arn: "arn:aws:lambda:us-east-1:888888888888:function:report",
      RoleArn: "arn:aws:iam::888888888888:role/SchedulerRole",
    },
  }),
);

console.log(created.ScheduleArn);
// "arn:aws:scheduler:us-east-1:888888888888:schedule/default/nightly-report"

const described = await scheduler.getSchedule(
  new GetScheduleCommand({ Name: "nightly-report" }),
);

console.log(described.ScheduleExpression); // "cron(0 2 * * ? *)"
```

`FlexibleTimeWindow` and `Target` are both required, as AWS requires them, and a target carries both
an `Arn` and the `RoleArn` it is invoked as. A schedule ARN always names its group, even the
`default` one, which is unlike an EventBridge rule ARN, where the bus appears only when it is not
the default. An IAM policy naming a schedule needs the group in it or it matches nothing.

## Writing the schedule expression

Three forms, and the same parser as an [EventBridge scheduled
rule](../eventbridge/#rules-that-fire-on-a-schedule) with two differences:

- `at(yyyy-mm-ddThh:mm:ss)` runs once, at that instant. There is no timezone on it: the timezone is a
  separate setting on the schedule rather than part of the expression, so a trailing `Z` is refused.
- `rate(<value> <unit>)` runs from when the schedule was created. The unit is `minute`, `hour` or
  `day`, and Scheduler does not insist it agrees with its value, so `rate(1 hours)` is an hour here
  and a refusal on an EventBridge rule.
- `cron(<six fields>)` names absolute instants in UTC. Minutes, hours, day-of-month, month,
  day-of-week and year, so every day at two in the morning is `cron(0 2 * * ? *)`. The day-of-month
  and day-of-week fields cannot both say something: whichever is not deciding the day is written `?`.

## Firing a schedule

A schedule fires on the simulation's clock, not the host's: advancing simulated time past a due
instant invokes the target, and nothing happens otherwise. So a nightly job takes no time at all to
test.

```typescript sim-scheduler-firing
/**
 * A schedule invoking a function three times in three simulated hours.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateScheduleCommand } from "@aws-sdk/client-scheduler";

import { SimAws, SimFixedClock } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});

const functionArn = "arn:aws:lambda:us-east-1:888888888888:function:report";
const runs: string[] = [];

await simAws.lambda().createFunction({
  input: {
    FunctionName: "report",
    Role: "arn:aws:iam::888888888888:role/ReportRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(() => {
        runs.push("ran");
        return { ok: true };
      }),
    },
  },
});

// The execution role has to trust Scheduler, and be allowed to invoke.
await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "SchedulerRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "scheduler.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "SchedulerRole",
    PolicyName: "InvokeReport",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "lambda:InvokeFunction",
        Resource: functionArn,
      },
    }),
  }),
);

await simAws.scheduler().createSchedule(
  new CreateScheduleCommand({
    Name: "hourly-report",
    ScheduleExpression: "rate(1 hour)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: {
      Arn: functionArn,
      RoleArn: "arn:aws:iam::888888888888:role/SchedulerRole",
    },
  }),
);

await simAws.clock().advanceBy({ hours: 3 });

console.log(runs.length); // 3
```

Firing is per due instant rather than per advance. Advancing an hour with a `rate(1 minute)` schedule
invokes the target sixty times, at sixty distinct simulated instants. `advanceBy(...)` returns once
every one of those invocations has settled, so the next line can assert.

A target with an `Input` receives that text; one without receives an empty JSON object, which is what
AWS documents for a function with no payload. There is no envelope: a schedule has no event of its
own to describe.

### The execution role

This is the part that differs most from an [EventBridge rule](../eventbridge/), and the part that
most often goes wrong in a real account. A rule reaches its target as the `events.amazonaws.com`
service principal, and the target's own resource policy decides. A schedule assumes the `RoleArn` on
its target, and that role's policies decide. No resource policy on the target is involved at all.

Two things therefore have to be right, and they are fixed in different places:

- The role's **trust policy** has to let `scheduler.amazonaws.com` assume it. A role copied from an
  EventBridge rule trusts `events.amazonaws.com` and fails here.
- A policy **on the role** has to allow the action on the target: `lambda:InvokeFunction`,
  `sqs:SendMessage` or `sns:Publish`.

When either is missing the target is not invoked and nothing is thrown, exactly as on AWS, where the
failure goes to CloudWatch and nowhere the caller can see. `advanceBy(...)` still returns normally,
so a test asserting on a failed invocation reads `deliveryFailures` rather than expecting the advance
to reject:

```typescript sim-scheduler-delivery-failures
/**
 * Finding out why a schedule's target was never invoked.
 */

import { CreateRoleCommand } from "@aws-sdk/client-iam";
import { CreateScheduleCommand } from "@aws-sdk/client-scheduler";

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});

// A role that trusts EventBridge rules rather than Scheduler.
await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "SchedulerRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "events.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.scheduler().createSchedule(
  new CreateScheduleCommand({
    Name: "hourly-report",
    ScheduleExpression: "rate(1 hour)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: {
      Arn: "arn:aws:lambda:us-east-1:888888888888:function:report",
      RoleArn: "arn:aws:iam::888888888888:role/SchedulerRole",
    },
  }),
);

await simAws.clock().advanceBy({ hours: 1 });

const [failure] = simAws.scheduler().deliveryFailures;

console.log(failure?.message);
// "The trust policy of arn:aws:iam::888888888888:role/SchedulerRole does not
//  allow scheduler.amazonaws.com to assume it, ..."
```

### One-time schedules and what happens after

An `at(...)` schedule fires once and then stops. By default it stays in the Account afterwards, which
surprises people who expected it to clean up: it keeps counting against the schedule quota and keeps
turning up in listings. `ActionAfterCompletion: "DELETE"` is what removes it, and after that
`GetSchedule` reports it gone.

A schedule that is disabled when its only instant passes has not completed, because nothing was
invoked, so it is still there afterwards whatever `ActionAfterCompletion` says.

`State: "DISABLED"` stops a recurring schedule firing while it is off, and an `UpdateSchedule`
enabling it picks up from the next due instant rather than replaying what it missed. An update that
changes the expression reschedules from the new one.

## Updating and deleting

```typescript sim-scheduler-update-schedule
/**
 * An update replaces the whole schedule rather than merging into it.
 */

import {
  CreateScheduleCommand,
  GetScheduleCommand,
  UpdateScheduleCommand,
} from "@aws-sdk/client-scheduler";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const scheduler = simAws.scheduler();
const target = {
  Arn: "arn:aws:lambda:us-east-1:888888888888:function:report",
  RoleArn: "arn:aws:iam::888888888888:role/SchedulerRole",
};

await scheduler.createSchedule(
  new CreateScheduleCommand({
    Name: "nightly-report",
    Description: "The nightly reconciliation",
    ScheduleExpression: "cron(0 2 * * ? *)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: target,
  }),
);

// Meaning only to change the expression, and leaving the description out.
await scheduler.updateSchedule(
  new UpdateScheduleCommand({
    Name: "nightly-report",
    ScheduleExpression: "rate(30 minutes)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: target,
  }),
);

const described = await scheduler.getSchedule(
  new GetScheduleCommand({ Name: "nightly-report" }),
);

console.log(described.ScheduleExpression); // "rate(30 minutes)"
console.log(described.Description); // undefined, and not by accident
```

`UpdateSchedule` carries the whole of a schedule, so anything an earlier request set and this one
leaves out is gone. That is real behaviour and a common surprise. The schedule has to exist:
updating one that is not there is a `ResourceNotFoundException` rather than a create, which is
another difference from EventBridge's `PutRule`.

`CreateSchedule` for a name that already exists is a `ConflictException` rather than a replacement,
so a deployment running it twice fails the second time here as it does on AWS. `DeleteSchedule` for a
schedule that is not there is a `ResourceNotFoundException`, where EventBridge's `DeleteRule`
succeeds.

## Listing schedules

`ListSchedules` reports the schedules of a group in creation order, narrowed by `NamePrefix` and
`State` and paged by `MaxResults` and `NextToken`.

A listing carries less than a describe, as it does on AWS: the target's ARN and nothing else about
the target, and no expression at all. Code reading `ScheduleExpression` off a listing gets
`undefined` from AWS, so it gets `undefined` here too.

## Permissions

Every operation is authorized against the schedule ARN, which carries the group:

```typescript sim-scheduler-iam-policy
/**
 * A Role allowed to manage one schedule and no other.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateScheduleCommand } from "@aws-sdk/client-scheduler";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "ScheduleAdministrator",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::888888888888:root" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ScheduleAdministrator",
    PolicyName: "ManageNightlyReport",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "scheduler:CreateSchedule",
        // The group is part of the ARN, so a policy without it matches nothing.
        Resource:
          "arn:aws:scheduler:us-east-1:888888888888:schedule/default/nightly-report",
      },
    }),
  }),
);

const created = await simAws.scheduler().createSchedule(
  new CreateScheduleCommand({
    Name: "nightly-report",
    ScheduleExpression: "rate(1 hour)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: {
      Arn: "arn:aws:lambda:us-east-1:888888888888:function:report",
      RoleArn: "arn:aws:iam::888888888888:role/SchedulerRole",
    },
  }),
  { caller: { kind: "arn", arn: role.Role.Arn } },
);

console.log(created.ScheduleArn !== undefined); // true
```

`ListSchedules` names no schedule, so IAM evaluates it against `*` and only a policy whose `Resource`
is `*` allows it. A policy naming a schedule ARN allows no listing, here as on AWS.

That is the caller's own permission to manage schedules, and it is a separate question from whether a
schedule's execution role may invoke its target. The second is asked when the schedule fires, against
the `RoleArn` on the target rather than against whoever created the schedule.

## Available functionality

- `CreateSchedule`, `GetSchedule`, `UpdateSchedule`, `DeleteSchedule` and `ListSchedules`.
- `at(...)`, `rate(...)` and six-field `cron(...)` expressions, fired by advancing the simulation's
  clock.
- Lambda, SQS and SNS targets, with a target `Input`, invoked as the target's execution role and
  authorized against that role's own policies.
- `ActionAfterCompletion`, and `deliveryFailures` for invocations that did not happen.
- The `default` schedule group in every account and region, without one being created.
- Creation and modification timestamps from the simulation's clock, and prefix-narrowed,
  state-narrowed, paged listings.
- IAM authorization against the schedule ARN.
- SDK interception of `SchedulerClient`.

## Limitations

- A schedule only fires while a test advances the simulation's clock. Nothing runs on the host's
  clock, so a simulation left alone in real time fires nothing however long it is left.
- Firing is exact and exactly once. Real Scheduler invokes within a minute of the due time and does
  not promise a single invocation.
- An invocation is attempted once. There is no retry and no dead letter queue, so a target that
  throws is a recorded failure rather than a redelivery. A failed invocation never rejects
  `advanceBy(...)`; it is read from `deliveryFailures`.
- Schedule groups are not a manageable resource. Every schedule is in `default`, and a `GroupName`
  naming any other group is refused rather than quietly put in `default`, where its ARN would name a
  group it is not in.
- `FlexibleTimeWindow` with `Mode: "FLEXIBLE"` is refused. Real Scheduler invokes the target at an
  unpredictable moment inside the window, and firing at the exact due time instead would let a test
  rely on timing AWS does not promise.
- `ScheduleExpressionTimezone` other than `UTC` is refused rather than ignored, since running a
  schedule in the wrong zone fires it at the wrong hour.
- `StartDate` and `EndDate` are refused rather than ignored.
- Targets are Lambda, SQS and SNS only. The universal target
  (`arn:aws:scheduler:::aws-sdk:<service>:<action>`) and every other target service are refused when
  the schedule is created rather than when it first falls due.
- A target `DeadLetterConfig`, `RetryPolicy`, `EcsParameters`, `EventBridgeParameters`,
  `KinesisParameters`, `SageMakerPipelineParameters` and `SqsParameters` are refused rather than
  dropped.
- `KmsKeyArn` is refused, and `ClientToken` is accepted and ignored: nothing here retries, so there is
  no request for it to make idempotent.
- `AWS::Scheduler::Schedule` CloudFormation resources are not simulated.
