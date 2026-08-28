# Simulated EventBridge Scheduler

Yulin includes a simulated Amazon EventBridge Scheduler for tests and local development. Schedules
are held in memory and every operation is authorized by simulated IAM. Scheduler-specific types are
imported from the `@kensio/yulin/scheduler` subpath.

Scheduler is a separate service from [EventBridge](https://yulinsim.dev/services/eventbridge/), not a corner of it. It has its
own SDK client, its own ARN shape, and its own way of reaching a target. A schedule assumes an IAM
execution role, where an EventBridge rule relies on a resource policy admitting a service principal.
A project using Scheduler cannot be tested against simulated EventBridge rules. That is why this
exists separately.

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
`default` one. An EventBridge rule ARN differs, showing the bus only when it is not the default. An
IAM policy naming a schedule needs the group in it, or it matches no schedule.

## Writing the schedule expression

Three forms, and the same parser as an [EventBridge scheduled
rule](https://yulinsim.dev/services/eventbridge/#rules-that-fire-on-a-schedule) with two differences:

- `at(yyyy-mm-ddThh:mm:ss)` runs once, at that instant. The timezone is a separate setting on the
  schedule, outside the expression, and a trailing `Z` is refused.
- `rate(<value> <unit>)` runs from when the schedule was created. The unit is `minute`, `hour` or
  `day`, and Scheduler lets it disagree with its value. `rate(1 hours)` is an hour here and a
  refusal on an EventBridge rule.
- `cron(<six fields>)` names absolute instants in UTC. Minutes, hours, day-of-month, month,
  day-of-week and year, so every day at two in the morning is `cron(0 2 * * ? *)`. The day-of-month
  and day-of-week fields cannot both say something. Whichever is not deciding the day is written
  `?`.

## Firing a schedule

A schedule fires on the simulation's clock. Advancing simulated time past a due
instant invokes the target. Leave time alone and the target is never invoked. A nightly job takes no
time at all to test.

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

Firing is per due instant. Advancing an hour with a `rate(1 minute)` schedule
invokes the target sixty times, at sixty distinct simulated instants. `advanceBy(...)` returns once
every one of those invocations has settled, leaving the next line free to assert.

A target with an `Input` receives that text. One without receives an empty JSON object, which AWS
documents for a function with no payload. There is no envelope, since a schedule has no event of its
own to describe.

### The execution role

This is the part that differs most from an [EventBridge rule](https://yulinsim.dev/services/eventbridge/), and the part that
most often goes wrong in a real account. A rule reaches its target as the `events.amazonaws.com`
service principal, and the target's own resource policy decides. A schedule assumes the `RoleArn` on
its target, and that role's policies decide. No resource policy on the target is involved at all.

Two things therefore have to be right, and they are fixed in different places:

- The role's **trust policy** has to let `scheduler.amazonaws.com` assume it. A role copied from an
  EventBridge rule trusts `events.amazonaws.com` and fails here.
- A policy **on the role** has to allow the action on the target, being `lambda:InvokeFunction`,
  `sqs:SendMessage`, `sns:Publish` or `ecs:RunTask`.

When either is missing the target goes uninvoked and no error is thrown, exactly as on AWS, where the
failure goes to CloudWatch and nowhere the caller can see. `advanceBy(...)` still returns normally. A
test asserting on a failed invocation reads `deliveryFailures`:

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
surprises people who expected it to clean up. It keeps counting against the schedule quota and keeps
turning up in listings. `ActionAfterCompletion: "DELETE"` is what removes it, and after that
`GetSchedule` reports it gone.

A schedule that is disabled when its only instant passes has not completed, since nothing was
invoked. It is still there afterwards whatever `ActionAfterCompletion` says.

`State: "DISABLED"` stops a recurring schedule firing while it is off, and an `UpdateSchedule`
enabling it picks up from the next due instant. What it missed is never replayed. An update that
changes the expression reschedules from the new one.

## Running an ECS task on a schedule

A target whose ARN names an ECS cluster runs a [simulated ECS](https://yulinsim.dev/services/ecs/) task, in place of being
invoked with a payload. That is the shape a nightly batch job usually has. A container runs, does
its work and stops.

```typescript sim-scheduler-ecs-target
/**
 * A schedule running an ECS task every night.
 */

import {
  CreateClusterCommand,
  ListTasksCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateScheduleCommand } from "@aws-sdk/client-scheduler";

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});
const ecs = simAws.ecs();
const imported: string[] = [];

await ecs.createCluster(new CreateClusterCommand({ clusterName: "orders" }));

ecs.bindContainer({
  family: "nightly-import",
  containerName: "app",
  run: () => {
    imported.push(process.env["IMPORT_MODE"] ?? "");
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "nightly-import",
    containerDefinitions: [{ name: "app", image: "nightly-import:1" }],
  }),
);

// The schedule runs the task as this role, so the role trusts Scheduler and is
// allowed to run it.
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
    PolicyName: "RunImport",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "ecs:RunTask", Resource: "*" },
    }),
  }),
);

await simAws.scheduler().createSchedule(
  new CreateScheduleCommand({
    Name: "nightly-import",
    ScheduleExpression: "cron(0 2 * * ? *)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: {
      Arn: "arn:aws:ecs:us-east-1:888888888888:cluster/orders",
      RoleArn: "arn:aws:iam::888888888888:role/SchedulerRole",
      EcsParameters: {
        TaskDefinitionArn: "nightly-import",
        TaskCount: 1,
      },
      // An ECS target's Input is the task's overrides, since a task has
      // nowhere to receive a payload.
      Input: JSON.stringify({
        containerOverrides: [
          {
            name: "app",
            environment: [{ name: "IMPORT_MODE", value: "full" }],
          },
        ],
      }),
    },
  }),
);

// Advancing past 02:00 fires the schedule and runs the task.
await simAws.clock().advanceBy({ hours: 24 });

console.log(imported); // ["full"]

const tasks = await ecs.listTasks(
  new ListTasksCommand({ cluster: "orders", desiredStatus: "STOPPED" }),
);

console.log(tasks.taskArns?.length); // 1
```

The target ARN names the cluster. An ARN naming anything else in ECS is refused when the schedule
is created. `EcsParameters` names the task definition, as a family, a `family:revision` or a full
ARN, and the same one `RunTask` would take.

An ECS target's `Input` is the task's overrides, since a task has nowhere to receive a payload. A
target with no `Input` runs the task with no overrides.
`EcsParameters` on a target whose ARN names anything else is refused, since it would do nothing.

[Simulated ECS](https://yulinsim.dev/services/ecs/) decides which containers actually run. A container
with a binding runs its handler, and a container without one is recorded as not simulated.
A target naming a task definition with nothing bound therefore records a task that never started,
and the schedule counts as invoked.

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

`UpdateSchedule` carries the whole of a schedule, and anything an earlier request set and this one
leaves out is gone. That is real behaviour and a common surprise. The schedule has to exist.
Updating one that is absent raises `ResourceNotFoundException`. EventBridge's `PutRule` creates it.

`CreateSchedule` for a name that already exists raises `ConflictException`. A deployment running it
twice fails the second time here as it does on AWS. `DeleteSchedule` for a schedule that is absent
raises `ResourceNotFoundException`, where EventBridge's `DeleteRule` succeeds.

## Listing schedules

`ListSchedules` reports the schedules of a group in creation order, narrowed by `NamePrefix` and
`State` and paged by `MaxResults` and `NextToken`.

A listing carries less than a describe, as it does on AWS. It has the target's ARN and no more of the target,
and no expression at all. Code reading `ScheduleExpression` off a listing gets
`undefined` from AWS, and gets `undefined` here too.

## Schedule groups

Every account and region starts with a `default` group. A schedule naming no group goes in it.

A schedule's name is unique within its group, and the group is in the schedule's ARN. Two
deployments of one construct into the same account and region collide on schedule names unless each
one brings its own group.

```typescript sim-scheduler-schedule-group
/**
 * A schedule group scoping the names of one deployment's schedules.
 */

import {
  CreateScheduleCommand,
  CreateScheduleGroupCommand,
  ListSchedulesCommand,
} from "@aws-sdk/client-scheduler";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const scheduler = simAws.scheduler();

const group = await scheduler.createScheduleGroup(
  new CreateScheduleGroupCommand({ Name: "reporting-pr-412" }),
);

console.log(group.ScheduleGroupArn);
// "arn:aws:scheduler:us-east-1:888888888888:schedule-group/reporting-pr-412"

const created = await scheduler.createSchedule(
  new CreateScheduleCommand({
    Name: "pageviews-hourly",
    GroupName: "reporting-pr-412",
    ScheduleExpression: "rate(1 hour)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: {
      Arn: "arn:aws:lambda:us-east-1:888888888888:function:report",
      RoleArn: "arn:aws:iam::888888888888:role/SchedulerRole",
    },
  }),
);

// The group is in the schedule's ARN. The same schedule name is free in every
// other group, including default.
console.log(created.ScheduleArn);
// ".../schedule/reporting-pr-412/pageviews-hourly"

const listed = await scheduler.listSchedules(
  new ListSchedulesCommand({ GroupName: "reporting-pr-412" }),
);

console.log(listed.Schedules?.length); // 1
```

A `GroupName` for a group that has yet to be created raises `ResourceNotFoundException`, and so
does a listing for one. Real Scheduler answers the same way. A schedule quietly moved into `default`
would carry an ARN naming a group it had never been put in.

`GetScheduleGroup` reports a group's ARN, state and timestamps. `ListScheduleGroups` reports them
all in creation order, narrowed by `NamePrefix` and paged by `MaxResults` and `NextToken`.

`DeleteScheduleGroup` deletes the schedules in the group along with it, as AWS does. It refuses the
`default` group, which comes with the account. Losing that group would leave every request naming
no group with nowhere to go.

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

`ListSchedules` names no schedule. IAM evaluates it against `*`, and only a policy whose `Resource`
is `*` allows it. A policy naming a schedule ARN allows no listing, here as on AWS.

That is the caller's own permission to manage schedules, and it is a separate question from whether a
schedule's execution role may invoke its target. The second is asked when the schedule fires,
against the `RoleArn` on the target.

## Deploying from a CloudFormation template

`AWS::Scheduler::Schedule` deploys through [simulated CloudFormation](https://yulinsim.dev/services/cloudformation/). A stack
that declares its schedules can be exercised end to end, with no SDK calls of its own. Everything the
Resource carries lines up with `CreateSchedule`, and a target ARN or execution role resolved by
`Fn::GetAtt` from the same template works as it would in a real deployment.

```typescript sim-scheduler-cloudformation
/**
 * A schedule deployed from a template, firing as simulated time advances.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});

const queueArn = "arn:aws:sqs:us-east-1:888888888888:reports";
const roleArn = "arn:aws:iam::888888888888:role/SchedulerRole";

// The execution role has to trust Scheduler, and be allowed to send.
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
    PolicyName: "SendReports",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "sqs:SendMessage",
        Resource: queueArn,
      },
    }),
  }),
);

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "reporting-stack",
  template: {
    Resources: {
      ReportQueue: {
        Type: "AWS::SQS::Queue",
        Properties: { QueueName: "reports" },
      },
      HourlyReport: {
        Type: "AWS::Scheduler::Schedule",
        Properties: {
          Name: "hourly-report",
          ScheduleExpression: "rate(1 hour)",
          FlexibleTimeWindow: { Mode: "OFF" },
          Target: {
            Arn: { "Fn::GetAtt": ["ReportQueue", "Arn"] },
            RoleArn: roleArn,
            Input: JSON.stringify({ report: "hourly" }),
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

// Three simulated hours on, the schedule has invoked its target three times.
await simAws.clock().advanceBy({ hours: 3 });

const received = await simAws.sqs().receiveMessage(
  new ReceiveMessageCommand({
    QueueUrl: "https://sqs.us-east-1.amazonaws.com/888888888888/reports",
    MaxNumberOfMessages: 10,
  }),
);

console.log(received.Messages?.length); // 3

// Nothing went wrong on the way, which is worth checking: a schedule that
// could not reach its target says so here rather than by throwing.
console.log(simAws.scheduler().deliveryFailures.length); // 0
```

`Ref` returns the schedule's **name** and `Fn::GetAtt ... Arn` its ARN, which carries the schedule
group as it always does. A schedule the template leaves unnamed gets one generated from the stack
name and the logical ID.

A property this simulation leaves out is refused at deploy time, naming the Resource. Deploying a
schedule that behaves differently from the one declared would be worse. Tearing the stack down
removes the schedules it created, and no schedule fires afterwards.

### Deploying a schedule group

`AWS::Scheduler::ScheduleGroup` deploys too, so a stack can bring the group its schedules go in.

```typescript sim-scheduler-cfn-schedule-group
/**
 * A stack deploying its own schedule group, with a schedule in it.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "reporting-stack",
  template: {
    Resources: {
      ReportGroup: {
        Type: "AWS::Scheduler::ScheduleGroup",
        Properties: { Name: "reporting-pr-412" },
      },
      HourlyReport: {
        Type: "AWS::Scheduler::Schedule",
        Properties: {
          Name: "pageviews-hourly",
          GroupName: { Ref: "ReportGroup" },
          ScheduleExpression: "rate(1 hour)",
          FlexibleTimeWindow: { Mode: "OFF" },
          Target: {
            Arn: "arn:aws:sqs:us-east-1:888888888888:reports",
            RoleArn: "arn:aws:iam::888888888888:role/SchedulerRole",
          },
        },
      },
    },
    Outputs: {
      GroupArn: { Value: { "Fn::GetAtt": ["ReportGroup", "Arn"] } },
    },
  },
});

await stack.waitForDeployComplete();

// An execution role policy is often written against this, since it covers
// every schedule the group will ever hold.
console.log(stack.output("GroupArn"));
// "arn:aws:scheduler:us-east-1:888888888888:schedule-group/reporting-pr-412"
```

`Ref` returns the group's **name** and `Fn::GetAtt` answers `Arn`, `State`, `CreationDate` and
`LastModificationDate`. A group the template leaves unnamed gets one generated from the stack name
and the logical ID.

`Tags` on a group are recorded as an ignored property and the group deploys without them. The CDK
puts a stack's tags on every taggable Resource in it, so a template gains them without asking.
Failing the whole stack over a tag would refuse a deployment for a property the simulation ignores
anyway. Read the record back from `stack.getResource("<logicalId>")?.ignoredProperties`.

Tearing the stack down removes the group. Its schedules go with it, whether or not they are
Resources of the same stack.

## Available functionality

- `CreateSchedule`, `GetSchedule`, `UpdateSchedule`, `DeleteSchedule` and `ListSchedules`.
- `at(...)`, `rate(...)` and six-field `cron(...)` expressions, fired by advancing the simulation's
  clock.
- Lambda, SQS and SNS targets, with a target `Input`, invoked as the target's execution role and
  authorized against that role's own policies.
- ECS targets, running a simulated task as the execution role, with the task definition and
  `TaskCount` from `EcsParameters` and container overrides from the target's `Input`.
- `ActionAfterCompletion`, and `deliveryFailures` for invocations that did not happen.
- `CreateScheduleGroup`, `GetScheduleGroup`, `DeleteScheduleGroup` and `ListScheduleGroups`, over
  the `default` group every account and region starts with and any group created beside it.
- `AWS::Scheduler::Schedule` and `AWS::Scheduler::ScheduleGroup` deployed from a CloudFormation
  template.
- Creation and modification timestamps from the simulation's clock, and prefix-narrowed,
  state-narrowed, paged listings.
- IAM authorization against the schedule ARN.
- SDK interception of `SchedulerClient`.

## Limitations

- A schedule only fires while a test advances the simulation's clock. The host's clock drives none
  of it, and a simulation left alone in real time never fires however long it is left.
- Firing is exact and exactly once. Real Scheduler invokes within a minute of the due time, and its
  promise is at-least-once.
- An invocation is attempted once. There is no retry and no dead letter queue. A target that throws
  is recorded as a failure, and never redelivered. A failed invocation never rejects
  `advanceBy(...)`, and is read from `deliveryFailures`.
- A schedule group carries no tags. `CreateScheduleGroup` refuses `Tags`, since the simulation
  stores them nowhere. A template's `Tags` are recorded as an ignored property and the group still
  deploys.
- A schedule group is `ACTIVE` or gone. Deleting one removes its schedules in the same call, where
  real Scheduler holds the group in `DELETING` until they have gone.
- The `default` schedule group cannot be deleted. AWS leaves the answer to that request
  undocumented.
- `FlexibleTimeWindow` with `Mode: "FLEXIBLE"` is refused. Real Scheduler invokes the target at an
  unpredictable moment inside the window, and firing at the exact due time instead would let a test
  rely on timing AWS leaves unpromised.
- `ScheduleExpressionTimezone` other than `UTC` is refused outright, since running a schedule in the
  wrong zone fires it at the wrong hour.
- `StartDate` and `EndDate` are refused outright.
- Targets are Lambda, SQS, SNS and ECS. The universal target
  (`arn:aws:scheduler:::aws-sdk:<service>:<action>`) and every other target service are refused when
  the schedule is created, ahead of the first due instant.
- A target `DeadLetterConfig`, `RetryPolicy`, `EventBridgeParameters`, `KinesisParameters`,
  `SageMakerPipelineParameters` and `SqsParameters` are refused outright, as is `EcsParameters` on a
  target whose ARN names something other than an ECS cluster.
- An ECS target's `EcsParameters` takes `TaskDefinitionArn` and `TaskCount`, and takes and ignores
  `LaunchType`, `PlatformVersion`, `NetworkConfiguration` and `CapacityProviderStrategy`, since
  there is no placement and no network here for them to apply to. Anything else it can carry, such
  as `Group`, `Tags` or `PropagateTags`, is refused outright.
- An ECS target's `Input` is read as the task's overrides. A `containerOverrides` list is how a
  schedule sets a container's environment. An `Input` that is anything but a JSON object is refused
  on an ECS target, where every other target type takes any text.
- A `TaskCount` above one runs that many simulated tasks, and a bound container handler runs once
  for each of them, in this process and one after another.
- `KmsKeyArn` is refused, and `ClientToken` is accepted and ignored. Nothing here retries, so it has
  no request to make idempotent.
- `AWS::Scheduler::ScheduleGroup` is absent as a CloudFormation resource type.
  `AWS::Scheduler::Schedule` is there, under
  [deploying from a template](#deploying-from-a-cloudformation-template).
