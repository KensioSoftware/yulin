# Simulated EventBridge

Yulin includes a simulated Amazon EventBridge for tests and local development. Event buses are held
in memory and every operation is authorized by simulated IAM.

Event buses, rules, targets and `PutEvents`. A rule can send matched events to a simulated Lambda
function, SQS queue or SNS topic, run a simulated ECS task, or fire on a schedule when a test
advances simulated time. [EventBridge Scheduler](../scheduler/) is a separate service with its own
docs. EventBridge-specific types are imported from the `@kensio/yulin/eventbridge` subpath.

## Putting an event onto a bus

```typescript sim-event-bridge-put-events
/**
 * Putting an event onto the default event bus.
 */

import { PutEventsCommand } from "@aws-sdk/client-eventbridge";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const events = simAws.eventBridge();

const output = await events.putEvents(
  new PutEventsCommand({
    Entries: [
      {
        Source: "orders.service",
        DetailType: "OrderPlaced",
        Detail: JSON.stringify({ orderId: "order-1", total: 4200 }),
      },
    ],
  }),
);

console.log(output.FailedEntryCount); // 0
console.log(output.Entries?.[0]?.EventId !== undefined); // true
```

Every account and region has a `default` bus without one being created, and an entry that names no
bus goes to it. A request carries between one and ten entries, and they are independent. Each may
name a different bus, and one that fails leaves the others alone.

`Detail`, `DetailType` and `Source` are all optional in the API model, and all three are needed for
EventBridge to take an entry. An entry missing one fails on its own, with the rest of the request
going through. A request in which no entry carries all three fails outright.

The size limit applies to the whole request. The entries together come to less than 1 MB, measured
the way AWS measures them, where a `Time` counts as 14 bytes and `Source`, `DetailType`, `Detail`
and each `Resources` entry count as the length of their UTF-8 forms.

## Creating an event bus

```typescript sim-event-bridge-create-bus
/**
 * Creating a custom event bus and putting an event onto it.
 */

import {
  CreateEventBusCommand,
  DescribeEventBusCommand,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const events = simAws.eventBridge();

const created = await events.createEventBus(
  new CreateEventBusCommand({ Name: "orders" }),
);

console.log(created.EventBusArn);
// "arn:aws:events:us-east-1:888888888888:event-bus/orders"

await events.putEvents(
  new PutEventsCommand({
    Entries: [
      {
        EventBusName: "orders",
        Source: "orders.service",
        DetailType: "OrderPlaced",
        Detail: JSON.stringify({ orderId: "order-1" }),
      },
    ],
  }),
);

const described = await events.describeEventBus(
  new DescribeEventBusCommand({ Name: "orders" }),
);

console.log(described.Name); // "orders"
```

A bus ARN is `arn:aws:events:<region>:<account-id>:event-bus/<name>`. Unlike an SNS topic ARN it
carries a resource type. An IAM policy naming a bus has the `event-bus/` in it.

A bus name is up to 256 characters of letters, numbers, full stops, hyphens and underscores.
Creating one that already exists is refused with `ResourceAlreadyExistsException`, which includes
`default`, since that bus is always there. That differs from SNS `CreateTopic`, which answers a
repeated create with the existing topic.

`DescribeEventBus` takes a name or a bus ARN, and describes the default bus when the request names
neither. `ListEventBuses` reports the default bus alongside the custom ones, narrowed by
`NamePrefix` and paged by `Limit` and `NextToken`.

`DeleteEventBus` frees the name at once, ready to be reused straight away. Deleting a bus that was
never there succeeds. The default bus stays.

## Events put onto an unknown bus

An event put onto a bus that was never created **succeeds**:

```typescript sim-event-bridge-missing-bus
/**
 * An event put onto a bus that does not exist is accepted and dropped.
 */

import { PutEventsCommand } from "@aws-sdk/client-eventbridge";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const output = await simAws.eventBridge().putEvents(
  new PutEventsCommand({
    Entries: [
      {
        EventBusName: "odrers", // A typo, and nothing says so.
        Source: "orders.service",
        DetailType: "OrderPlaced",
        Detail: JSON.stringify({ orderId: "order-1" }),
      },
    ],
  }),
);

console.log(output.FailedEntryCount); // 0
console.log(output.Entries?.[0]?.EventId !== undefined); // true
```

This is real EventBridge behaviour, and not a gap here. AWS answers 200, finds no rule to match the
event against, and drops it, without counting the entry as failed. A mistyped bus name therefore
looks exactly like a working call. That is worth knowing before it costs an afternoon, and the
simulation reproduces it faithfully.

## Inspecting what a bus received

Real EventBridge keeps no events, and there is no API for reading them back. For tests,
`eventsOn(...)` reports what a bus received, in arrival order. It is a simulator accessor and not a
simulated API. No SDK command builds its answer from it.

```typescript sim-event-bridge-inspecting-events
/**
 * Asserting on the envelope EventBridge built from an entry.
 */

import { PutEventsCommand } from "@aws-sdk/client-eventbridge";

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  defaultAccountId: "111111111111",
  defaultRegionName: "eu-west-2",
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});

await simAws.eventBridge().putEvents(
  new PutEventsCommand({
    Entries: [
      {
        Source: "orders.service",
        DetailType: "OrderPlaced",
        Detail: JSON.stringify({ orderId: "order-1" }),
        Resources: ["arn:aws:s3:::orders"],
      },
    ],
  }),
);

const [event] = simAws.eventBridge().eventsOn("default");

console.log(event?.toEnvelope());
// {
//   version: "0",
//   id: "0f2c...",
//   "detail-type": "OrderPlaced",
//   source: "orders.service",
//   account: "111111111111",
//   time: "2026-07-26T09:00:00Z",
//   region: "eu-west-2",
//   resources: ["arn:aws:s3:::orders"],
//   detail: { orderId: "order-1" },
// }
```

The envelope is the shape a rule matches against and a target receives. An entry that names no
`Time` is stamped from the simulation's own clock, giving a test with a fixed clock a predictable
timestamp. The timestamp is written to the second, as real EventBridge writes it.

## Matching events with rules

A rule watches one bus and matches events against an event pattern.

```typescript sim-event-bridge-rules
/**
 * A rule matching order events on a bus.
 */

import { PutEventsCommand, PutRuleCommand } from "@aws-sdk/client-eventbridge";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const events = simAws.eventBridge();

await events.putRule(
  new PutRuleCommand({
    Name: "large-orders",
    EventPattern: JSON.stringify({
      source: ["orders.service"],
      "detail-type": ["OrderPlaced"],
      detail: { total: [{ numeric: [">=", 1000] }] },
    }),
  }),
);

await events.putEvents(
  new PutEventsCommand({
    Entries: [
      {
        Source: "orders.service",
        DetailType: "OrderPlaced",
        Detail: JSON.stringify({ orderId: "order-1", total: 4200 }),
      },
    ],
  }),
);

const [receipt] = events.receiptsOn("default");

console.log(receipt?.matchedRuleNames); // ["large-orders"]
```

A rule name is up to 64 characters, shorter than a bus name, and it is unique within one bus and not
within the account. A rule ARN on the default bus is
`arn:aws:events:<region>:<account>:rule/<name>`, and a rule on a custom bus carries the bus as well,
as `rule/<bus>/<name>`.

`PutRule` creates and updates alike, and an update **replaces** the rule rather than merging into
it. A second request that leaves out the description clears the description. That is real behaviour
and a common surprise.

`DisableRule` stops a rule matching, and `EnableRule` starts it again. A rule that was off picks up
from the next event and leaves what it missed behind. `DeleteRule` on a rule that was never there
succeeds. Deleting a bus deletes its rules with it.

`receiptsOn(...)` is a simulator accessor. It reports what a bus received and which rules each event
matched. A test can assert on routing before there are targets to watch.

## Event patterns

A pattern has the same shape as the events it matches. Every key of a pattern has to match, making
the keys an "and". A field's conditions are written as a list, and any one matching is enough,
making the list an "or".

Supported conditions:

| Condition                      | Written as                                             |
| ------------------------------ | ------------------------------------------------------ |
| Exact value, or any of several | `"source": ["orders.service", "billing.service"]`      |
| Nested field                   | `"detail": { "customer": { "tier": ["gold"] } }`       |
| Begins with                    | `"time": [{ "prefix": "2026-07-26" }]`                 |
| Ends with                      | `"FileName": [{ "suffix": ".png" }]`                   |
| Anything but                   | `"state": [{ "anything-but": ["stopped", "failed"] }]` |
| Numeric, and ranges            | `"total": [{ "numeric": [">", 0, "<=", 5000] }]`       |
| Field is or is not there       | `"refundId": [{ "exists": false }]`                    |

Values are compared by type. The string `"5"` in a pattern does not match the number `5` in an
event. `null` and the empty string are values like any other. Where the event carries a list for a
field, the pattern matches when the two lists overlap, and a pattern naming one ARN then matches an
event whose `resources` names several. `exists` is about the field and not its members, and a field
carrying an empty list still exists.

Anything else is refused at `PutRule`. The `cidr`, `equals-ignore-case`, `wildcard` and `$or`
operators are all refused by name, as are the nested forms of `anything-but` and the
case-insensitive forms of `prefix` and `suffix`. A pattern that silently matched nothing would look
like a pattern that was simply too specific, and the rule would go unnoticed until the deployment.

## Testing a pattern without a rule

`TestEventPattern` answers whether one event matches one pattern, creating no rule:

```typescript sim-event-bridge-test-pattern
/**
 * Checking a pattern against an event before writing a rule with it.
 */

import { TestEventPatternCommand } from "@aws-sdk/client-eventbridge";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const { Result } = await simAws.eventBridge().testEventPattern(
  new TestEventPatternCommand({
    EventPattern: JSON.stringify({
      detail: { total: [{ numeric: [">=", 1000] }] },
    }),
    Event: JSON.stringify({
      source: "orders.service",
      "detail-type": "OrderPlaced",
      detail: { orderId: "order-1", total: 4200 },
    }),
  }),
);

console.log(Result); // true
```

This is the quickest way to find out why a rule stays quiet, and a pattern this simulation cannot
evaluate is refused here exactly as `PutRule` refuses it.

## Sending matched events to targets

A rule sends every event it matches to each of its targets. A target is a simulated Lambda function,
SQS queue or SNS topic, or an ECS cluster where the rule runs a task. See
[running an ECS task](#running-an-ecs-task).

```typescript sim-event-bridge-targets
/**
 * A rule sending order events to a queue.
 */

import {
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const queueArn = "arn:aws:sqs:us-east-1:888888888888:orders";

const queue = await simAws
  .sqs()
  .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

// The queue's own policy is what admits EventBridge.
await simAws.sqs().setQueueAttributes(
  new SetQueueAttributesCommand({
    QueueUrl: queue.QueueUrl,
    Attributes: {
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "events.amazonaws.com" },
            Action: "sqs:SendMessage",
            Resource: queueArn,
          },
        ],
      }),
    },
  }),
);

await simAws.eventBridge().putRule(
  new PutRuleCommand({
    Name: "orders",
    EventPattern: JSON.stringify({ source: ["orders.service"] }),
  }),
);

await simAws.eventBridge().putTargets(
  new PutTargetsCommand({
    Rule: "orders",
    Targets: [{ Id: "orders-queue", Arn: queueArn }],
  }),
);

await simAws.eventBridge().putEvents(
  new PutEventsCommand({
    Entries: [
      {
        Source: "orders.service",
        DetailType: "OrderPlaced",
        Detail: JSON.stringify({ orderId: "order-1" }),
      },
    ],
  }),
);

// Delivery happens after PutEvents has answered, as it does on real AWS.
await simAws.backgroundTasksComplete();

const received = await simAws
  .sqs()
  .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queue.QueueUrl }));

console.log(received.Messages?.length); // 1
```

A queue or topic target receives the event as its message body, with no envelope around it. A Lambda
target is invoked with the event as its payload. A target with an `Input` receives that fixed JSON
in place of the event. That makes `Input` useful for a target that only needs to know something
happened.

A rule has at most five targets, and a target id is unique within one rule. `PutTargets` replaces a
target of the same id, and never adds a second beside it. `RemoveTargets` reports an unknown id as a
failed entry and lets the request itself succeed. Deleting a rule takes its targets with it.

`ListTargetsByRule` reports a rule's targets, and `ListRuleNamesByTarget` reports the rules of a bus
that send to one target ARN.

## What a target has to allow

EventBridge reaches a queue, topic or function target as the `events.amazonaws.com` service
principal, and the target's own resource policy is the whole of the decision. Those three have no
execution role, and a rule `RoleArn` and a target `RoleArn` are both refused. An ECS target is the
exception, because a task definition has no resource policy for a rule to be admitted by, and it
carries a role of its own.

- **A queue** needs `sqs:SendMessage` for `events.amazonaws.com` in its `Policy` attribute.
- **A topic** needs `sns:Publish` for `events.amazonaws.com` in its `Policy` attribute.
- **A function** needs an `AddPermission` grant of `lambda:InvokeFunction` to
  `events.amazonaws.com`.

The policy is consulted on every delivery, and never when the target is added. A permission taken
away afterwards stops delivery. Real EventBridge leaves it unchecked at `PutTargets` time too.

A target may be in another account or region of the same simulation. It is the target's own account
that decides. The policy lives with the target and is evaluated by that account's IAM, as it is on
real AWS. Both condition keys AWS documents for this work. `aws:SourceArn` carries the rule's ARN
and `aws:SourceAccount` carries the account the rule belongs to.

```typescript sim-event-bridge-cross-account
/**
 * A rule in one Account sending to a queue in another.
 */

const queuePolicy = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "events.amazonaws.com" },
      Action: "sqs:SendMessage",
      Resource: "arn:aws:sqs:us-east-1:222222222222:orders",
      Condition: {
        ArnLike: {
          "aws:SourceArn": "arn:aws:events:us-east-1:111111111111:rule/orders",
        },
      },
    },
  ],
};

console.log(JSON.stringify(queuePolicy).length > 0); // true
```

An event delivered across accounts still names the account it was put in, and never the target's.

## Running an ECS task

A target whose ARN names an ECS cluster runs a [simulated ECS](../ecs/) task instead of receiving
the event. `EcsParameters` says which task definition and how many tasks, and the target's `RoleArn`
is the role the rule runs it as, both of which real EventBridge requires for the same reasons.

```typescript sim-event-bridge-ecs-target
/**
 * A rule running an ECS task when an order event arrives.
 */

import {
  CreateClusterCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import {
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();
const imported: string[] = [];

await ecs.createCluster(new CreateClusterCommand({ clusterName: "orders" }));

ecs.bindContainer({
  family: "order-import",
  containerName: "app",
  run: () => {
    imported.push(process.env["ORDER_ID"] ?? "");
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "order-import",
    containerDefinitions: [{ name: "app", image: "order-import:1" }],
  }),
);

// The rule runs the task as this role, so the role trusts EventBridge and is
// allowed to run it.
await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "EventsRole",
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

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "EventsRole",
    PolicyName: "RunImport",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "ecs:RunTask", Resource: "*" },
    }),
  }),
);

await simAws.eventBridge().putRule(
  new PutRuleCommand({
    Name: "orders",
    EventPattern: JSON.stringify({ source: ["orders.service"] }),
  }),
);

await simAws.eventBridge().putTargets(
  new PutTargetsCommand({
    Rule: "orders",
    Targets: [
      {
        Id: "order-import",
        Arn: "arn:aws:ecs:us-east-1:888888888888:cluster/orders",
        RoleArn: "arn:aws:iam::888888888888:role/EventsRole",
        EcsParameters: { TaskDefinitionArn: "order-import", TaskCount: 1 },
        // An ECS target's Input is the task's overrides, since a task has
        // nowhere to receive a payload.
        Input: JSON.stringify({
          containerOverrides: [
            {
              name: "app",
              environment: [{ name: "ORDER_ID", value: "order-1" }],
            },
          ],
        }),
      },
    ],
  }),
);

await simAws.eventBridge().putEvents(
  new PutEventsCommand({
    Entries: [
      {
        Source: "orders.service",
        DetailType: "OrderPlaced",
        Detail: JSON.stringify({ orderId: "order-1" }),
      },
    ],
  }),
);

// The task runs after PutEvents has answered, as it does on real AWS.
await simAws.backgroundTasksComplete();

console.log(imported); // ["order-1"]
```

The target ARN names the cluster. An ARN naming anything else in ECS is refused when the target is
added. `EcsParameters` names the task definition, as a family, a `family:revision` or a full ARN,
and the same one `RunTask` would take.

An ECS target's `Input` is the task's overrides, because a task has nowhere to receive a payload. So
container environment variables are set the way the CDK sets them, with a `containerOverrides` list
naming the container. A target with no `Input` runs the task with no overrides, and the matched
event never reaches the container.

The role is the whole of the decision. It has to trust `events.amazonaws.com` in its
`AssumeRolePolicyDocument`, and it has to be allowed `ecs:RunTask` on the task definition revision
the target runs. A role that may not becomes a recorded
[delivery failure](#reading-back-a-failed-delivery), and the caller who put the event sees no error.

Which containers actually run is [simulated ECS](../ecs/)'s answer, and never the rule's. A
container with a binding runs its handler, and a container without one is recorded as not simulated.
A target naming a task definition with nothing bound therefore records a task that never started,
and the rule counts as delivered.

## Rules that fire on a schedule

A rule created with a `ScheduleExpression` in place of an event pattern fires on its own timing,
independently of anything put onto a bus. That timing is the simulation's clock. The rule fires when
a test advances simulated time to or past a due instant, and never otherwise. So a schedule that
takes an hour in production takes no time at all to test.

```typescript sim-event-bridge-scheduled-rules
/**
 * A scheduled rule invoking a function three times in three simulated hours.
 */

import { PutRuleCommand, PutTargetsCommand } from "@aws-sdk/client-eventbridge";
import { AddPermissionCommand } from "@aws-sdk/client-lambda";

import { SimAws, SimFixedClock } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});

const ranAt: string[] = [];

await simAws.lambda().createFunction({
  input: {
    FunctionName: "reconcile",
    Role: "arn:aws:iam::888888888888:role/ReconcileRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: { time: string }) => {
        ranAt.push(event.time);
        return { ok: true };
      }),
    },
  },
});

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "reconcile",
    StatementId: "events",
    Action: "lambda:InvokeFunction",
    Principal: "events.amazonaws.com",
  }),
);

await simAws.eventBridge().putRule(
  new PutRuleCommand({
    Name: "hourly-reconciliation",
    ScheduleExpression: "rate(1 hour)",
  }),
);

await simAws.eventBridge().putTargets(
  new PutTargetsCommand({
    Rule: "hourly-reconciliation",
    Targets: [
      {
        Id: "reconcile",
        Arn: "arn:aws:lambda:us-east-1:888888888888:function:reconcile",
      },
    ],
  }),
);

// Three simulated hours later, the function has run three times.
await simAws.clock().advanceBy({ hours: 3 });

console.log(ranAt);
// [ '2026-07-26T10:00:00Z', '2026-07-26T11:00:00Z', '2026-07-26T12:00:00Z' ]
```

Firing is per due instant, and not per advance. Advancing an hour with a `rate(1 minute)` rule
invokes the target sixty times, at sixty distinct simulated timestamps, because that is what an hour
of that rule does. `advanceBy(...)` returns once every one of those firings and its deliveries have
settled, ready for the next line to assert.

A scheduled event carries the standard envelope with `source: "aws.events"`, `detail-type:
"Scheduled Event"` and an empty `detail`, and names the rule that fired in `resources`. Its `time`
is the instant the rule fell due rather than the instant the advance finished. That is the field AWS
advises scheduled handler code to read in place of the clock.

### Writing the schedule

`rate(<value> <unit>)` runs from the moment the rule was created. A `rate(1 day)` rule created at
half past nine falls due at half past nine. The unit is `minute`, `hour` or `day`, and has to agree
with its value. `rate(1 hour)` and `rate(5 hours)` are the valid forms, and `rate(1 hours)` is
refused as real EventBridge refuses it. A minute is the finest schedule AWS runs, and there is no
unit below it.

`cron(<six fields>)` names absolute instants in UTC. The six fields are minutes, hours,
day-of-month, month, day-of-week and year, making the every-day-at-noon expression `cron(0 12 * * ?
*)`. A five-field expression, the form Unix cron takes, is refused naming the six-field form.
Day-of-week runs `1-7` or `SUN-SAT` with Sunday as one, unlike Unix cron. The day-of-month and
day-of-week fields cannot both say something, and whichever one is standing aside is written `?`.

A scheduled rule only works on the `default` bus, as it does on real AWS, and a `ScheduleExpression`
on any other bus is refused.

`DisableRule` stops a scheduled rule firing while it is off, and `EnableRule` picks up from the next
due instant. What was missed while it was off stays missed. `DeleteRule` stops it for good, and
`PutRule` replacing a scheduled rule restarts the schedule from the replacement.

A rule with no target still fires, and what it produced can be read with `eventsOn(...)`. That is
useful for asserting on the schedule itself before there is anything to deliver to.

## Deploying from a CloudFormation template

`AWS::Events::EventBus` and `AWS::Events::Rule` deploy through
[simulated CloudFormation](../cloudformation/). A stack that declares its routing in a template can
be exercised end to end. A rule carries its `EventPattern` or `ScheduleExpression`, its `State`, and
its inline `Targets`, and a target ARN resolved by `Fn::GetAtt` from a function or queue in the same
template works as it would in a real deployment.

```typescript sim-event-bridge-cloudformation
/**
 * A rule and its target, deployed from a template rather than by the SDK.
 */

import { PutEventsCommand } from "@aws-sdk/client-eventbridge";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const handled: unknown[] = [];

await simAws.lambda().createFunction({
  input: {
    FunctionName: "fulfilment",
    Role: "arn:aws:iam::888888888888:role/FulfilmentRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: unknown) => {
        handled.push(event);
        return { ok: true };
      }),
    },
  },
});

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrdersRule: {
        Type: "AWS::Events::Rule",
        Properties: {
          Name: "orders",
          // A template carries the pattern as an object, where the API takes
          // it as a string of JSON.
          EventPattern: { source: ["orders.service"] },
          Targets: [
            {
              Id: "fulfilment",
              Arn: "arn:aws:lambda:us-east-1:888888888888:function:fulfilment",
            },
          ],
        },
      },
      // The grant CDK emits alongside a Lambda target, and that the target
      // needs here too.
      PermissionForEventsToInvokeLambda: {
        Type: "AWS::Lambda::Permission",
        Properties: {
          FunctionName: "fulfilment",
          Action: "lambda:InvokeFunction",
          Principal: "events.amazonaws.com",
          SourceArn: { "Fn::GetAtt": ["OrdersRule", "Arn"] },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

await simAws.eventBridge().putEvents(
  new PutEventsCommand({
    Entries: [
      {
        Source: "orders.service",
        DetailType: "OrderPlaced",
        Detail: JSON.stringify({ orderId: "order-1" }),
      },
    ],
  }),
);

await simAws.backgroundTasksComplete();

console.log(handled.length); // 1
```

`Ref` returns the **name** of a bus or a rule, and never its ARN. That is what AWS returns, and it
makes a bus `Ref` usable straight away as another resource's `EventBusName`. The ARN comes from
`Fn::GetAtt ... Arn`, which an `AWS::Lambda::Permission` `SourceArn` needs. An unnamed rule gets a
name generated from the stack name and the logical ID, as real CloudFormation generates one.

A target property this simulation leaves out, such as `InputTransformer` or `InputPath`, is refused
at deploy time naming the property and the Resource. The alternative is a rule that sends the whole
event where one field was asked for. Tearing the stack down removes the buses, rules and targets it
created.

## Reading back a failed delivery

Real EventBridge tells the caller nothing about a failed delivery. A `PutEvents` that matched a rule
whose target refuses the call still answers with an event id. `deliveryFailures` explains a target
that is unexpectedly empty:

```typescript sim-event-bridge-delivery-failures
/**
 * Finding out why a target received nothing.
 */

import {
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import { CreateQueueCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// A queue with no policy admitting EventBridge.
await simAws.sqs().createQueue(new CreateQueueCommand({ QueueName: "orders" }));

await simAws.eventBridge().putRule(
  new PutRuleCommand({
    Name: "orders",
    EventPattern: JSON.stringify({ source: ["orders.service"] }),
  }),
);
await simAws.eventBridge().putTargets(
  new PutTargetsCommand({
    Rule: "orders",
    Targets: [{ Id: "q", Arn: "arn:aws:sqs:us-east-1:888888888888:orders" }],
  }),
);

await simAws.eventBridge().putEvents(
  new PutEventsCommand({
    Entries: [
      { Source: "orders.service", DetailType: "OrderPlaced", Detail: "{}" },
    ],
  }),
);
await simAws.backgroundTasksComplete();

const [failure] = simAws.eventBridge().deliveryFailures;

console.log(failure?.targetId); // "q"
console.log(failure?.message);
// "The queue policy of arn:aws:sqs:... does not allow events.amazonaws.com..."
```

A target that names nothing reads differently from one whose policy said no, because a policy saying
no is a modelled outcome a test may be asking for on purpose.

## Permissions

Most operations are authorized by simulated IAM against the bus ARN. The two that name no bus
authorize against `*` instead, and a policy naming a bus will not allow either. Those are
`events:ListEventBuses`, which has no bus-level resource on real AWS, and `events:TestEventPattern`,
which reaches no bus at all.

```typescript sim-event-bridge-iam-policy
/**
 * A policy allowing events onto one bus and nothing else.
 */

const policy = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Action: "events:PutEvents",
      Resource: "arn:aws:events:us-east-1:888888888888:event-bus/orders",
    },
  ],
};

console.log(JSON.stringify(policy).length > 0); // true
```

A caller refused by IAM gets `AccessDeniedException`. Permission is checked before the bus is looked
up, and a caller who may not reach a bus is refused whether or not that bus exists.

## Scoping

Buses belong to one account and region, as they do on real AWS:

```typescript sim-event-bridge-scoping
/**
 * Event buses in two Regions of the same Account.
 */

import { CreateEventBusCommand } from "@aws-sdk/client-eventbridge";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws
  .account("111111111111")
  .region("eu-west-2")
  .eventBridge()
  .createEventBus(new CreateEventBusCommand({ Name: "orders" }));

const elsewhere = simAws.account("111111111111").region("us-east-1");

console.log(elsewhere.eventBridge().findEventBus("orders")); // undefined
```

An entry naming a bus ARN in another account or region is refused. Real EventBridge does deliver
events across accounts that way, but nothing here can reach another simulation's bus, and quietly
treating a foreign ARN as local would let a test pass while the real call crossed a boundary it has
no permission for.

## Available functionality

- `CreateEventBus`, `DeleteEventBus`, `DescribeEventBus`, `ListEventBuses` and `PutEvents`.
- `PutRule`, `DeleteRule`, `DescribeRule`, `ListRules`, `EnableRule`, `DisableRule` and
  `TestEventPattern`.
- Scheduled rules, with a `rate(...)` or six-field `cron(...)` `ScheduleExpression`, fired by
  advancing the simulation's clock.
- Event pattern matching on exact values, nested fields, lists, `prefix`, `suffix`, `anything-but`,
  `numeric` and `exists`.
- `PutTargets`, `RemoveTargets`, `ListTargetsByRule` and `ListRuleNamesByTarget`, with delivery to a
  simulated Lambda function, SQS queue or SNS topic, authorized by the target's own resource policy.
- ECS targets, running a simulated task through the target's `RoleArn` with the task definition and
  `TaskCount` from `EcsParameters` and container overrides from the target's `Input`.
- Targets in another account or region of the same simulation, admitted by the target's own resource
  policy on `aws:SourceArn` or `aws:SourceAccount`, as real EventBridge does.
- A target's fixed `Input`, and `deliveryFailures` for a delivery that failed.
- The `default` bus in every account and region, without one being created.
- Bus descriptions, creation timestamps from the simulation's clock, and prefix-narrowed paged
  listings.
- The event envelope EventBridge builds from an entry, reached through `eventsOn(...)`.
- IAM authorization against the bus ARN.
- SDK interception of `EventBridgeClient`.

## Limitations

- Targets deliver to Lambda, SQS and SNS, and run a task in ECS. A target ARN naming any other
  service is refused as the target is added, ahead of any matching event.
- Target `InputPath` and `InputTransformer` are refused, as are dead letter queues and retry
  policies. A delivery is attempted once. A target `RoleArn` is refused except on an ECS target.
  That is the one target type that runs as a role, where the others run as the service principal.
- An ECS target's `EcsParameters` takes `TaskDefinitionArn` and `TaskCount`, and takes and ignores
  `LaunchType`, `PlatformVersion`, `NetworkConfiguration` and `CapacityProviderStrategy`, since
  there is no placement and no network here for them to apply to. Anything else it can carry, such
  as `Group`, `Tags` or `PropagateTags`, is refused outright.
- An ECS target's `Input` is read as the task's overrides, and a `containerOverrides` list is how a
  rule sets a container's environment. A target with no `Input` runs the task with no overrides, and
  the matched event never reaches the container.
- A `TaskCount` above one runs that many simulated tasks, and a bound container handler runs once
  for each of them, in this process and one after another.
- An ECS target is refused in a CloudFormation template. `AWS::Events::Rule` still refuses a target
  `RoleArn` and `EcsParameters`. Write an ECS target with `PutTargets`.
- Numbers are compared after JSON parsing, so `300`, `300.0` and `3.0e2` are one value here. Real
  EventBridge compares the JSON token when matching an exact value, and so may tell those forms
  apart. Use `numeric` to compare numbers. That is what it is for.
- The `cidr`, `equals-ignore-case`, `wildcard` and `$or` pattern operators are refused at `PutRule`,
  as are the nested forms of `anything-but` and the case-insensitive forms of `prefix` and `suffix`.
- A rule needs an `EventPattern`, a `ScheduleExpression` or both. Real EventBridge takes a rule with
  neither, which matches nothing and fires never. Here that rule is refused.
- A scheduled rule only fires while a test advances the simulation's clock. Nothing runs on the
  host's clock, and a simulation left alone in real time fires nothing.
- `ScheduleExpressionTimezone` and the `L`, `W` and `#` cron wildcards are refused. Everything is
  read in UTC.
- Firing is exact and exactly once. Real EventBridge may deliver a scheduled event a few seconds
  late, and may deliver it more than once.
- EventBridge Scheduler is a separate service, simulated separately. See
  [simulated Scheduler](../scheduler/).
- Rule tags, a rule `RoleArn`, managed rules and the `ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS`
  state are all refused.
- Deleting an event bus deletes its rules, and deleting a rule deletes its targets. Real EventBridge
  refuses to delete either while it still has what hangs off it.
- `AWS::Events::EventBusPolicy`, `AWS::Events::Archive`, `AWS::Events::Connection` and
  `AWS::Events::ApiDestination` are absent as CloudFormation resource types. `AWS::Events::EventBus`
  and `AWS::Events::Rule` are there. See
  [deploying from a template](#deploying-from-a-cloudformation-template).
- Event bus resource policies are absent. `PutPermission`, `RemovePermission` and the bus `Policy`
  attribute are all missing, and a caller from another account cannot be admitted to a bus. That is
  stricter than real AWS.
- Putting an event onto another account's or region's bus is refused.
- Partner event buses and partner event sources are refused, as are event bus tags, encryption with
  a customer managed key, dead letter queues, logging configuration and global endpoints.
- Archives, replay, schema registry and discovery, API destinations and connections are not
  simulated.
