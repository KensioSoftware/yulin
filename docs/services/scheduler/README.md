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
- `at(...)`, `rate(...)` and six-field `cron(...)` expressions.
- Lambda, SQS and SNS targets, with a target `Input`.
- The `default` schedule group in every account and region, without one being created.
- Creation and modification timestamps from the simulation's clock, and prefix-narrowed,
  state-narrowed, paged listings.
- IAM authorization against the schedule ARN.
- SDK interception of `SchedulerClient`.

## Limitations

- A schedule does not fire yet. Creating one, reading it and deleting it all work; advancing the
  clock past a due time invokes nothing. Firing and target invocation are the next change.
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
