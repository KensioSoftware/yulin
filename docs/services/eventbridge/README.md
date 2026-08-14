# Simulated EventBridge

Yulin includes a simulated Amazon EventBridge for tests and local development. Event buses are held
in memory and every operation is authorized by simulated IAM.

Event buses, rules, targets and `PutEvents`. A rule can send matched events to a simulated Lambda
function, SQS queue or SNS topic. EventBridge Scheduler and scheduled rules are not simulated yet. EventBridge-specific
types are imported from the `@kensio/yulin/eventbridge` subpath.

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
bus goes to it. A request carries between one and ten entries, and they are independent: each may
name a different bus, and one that fails does not stop the others.

`Detail`, `DetailType` and `Source` are all optional in the API model, and all three are needed for
EventBridge to take an entry. An entry missing one fails on its own, with the rest of the request
going through. A request in which no entry carries all three fails outright.

The size limit applies to the request rather than to any one entry: the entries together come to less
than 1 MB, measured the way AWS measures them, where a `Time` counts as 14 bytes and `Source`,
`DetailType`, `Detail` and each `Resources` entry count as the length of their UTF-8 forms.

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
carries a resource type, so an IAM policy naming a bus has the `event-bus/` in it.

A bus name is up to 256 characters of letters, numbers, full stops, hyphens and underscores. Creating
one that already exists is refused with `ResourceAlreadyExistsException`, which includes `default`,
since that bus is always there. That differs from SNS `CreateTopic`, which answers a repeated create
with the existing topic.

`DescribeEventBus` takes a name or a bus ARN, and describes the default bus when the request names
neither. `ListEventBuses` reports the default bus alongside the custom ones, narrowed by `NamePrefix`
and paged by `Limit` and `NextToken`.

`DeleteEventBus` frees the name at once, so it can be reused straight away. Deleting a bus that is
not there succeeds. The default bus cannot be deleted.

## A bus that does not exist

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

This is real EventBridge behaviour rather than a gap. AWS answers 200, finds no rule to match the
event against, and drops it, without counting the entry as failed. A mistyped bus name therefore
looks exactly like a working call, which is worth knowing before it costs an afternoon, so the
simulation reproduces it rather than being helpfully stricter.

## Inspecting what a bus received

Real EventBridge keeps no events, so there is no API for reading them back. For tests,
`eventsOn(...)` reports what a bus received, in arrival order. It is a simulator accessor rather than
a simulated API: nothing an SDK command returns is built from it.

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

The envelope is the shape a rule matches against and a target receives. An entry that names no `Time`
is stamped from the simulation's own clock, so a test with a fixed clock gets a predictable
timestamp, and the timestamp is written to the second, as real EventBridge writes it.

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

A rule name is up to 64 characters, shorter than a bus name, and it is unique within one bus rather
than within the account. A rule ARN on the default bus is `arn:aws:events:<region>:<account>:rule/<name>`,
and a rule on a custom bus carries the bus as well: `rule/<bus>/<name>`.

`PutRule` creates and updates alike, and an update **replaces** the rule rather than merging into it.
A second request that leaves out the description clears the description. That is real behaviour and a
common surprise.

`DisableRule` stops a rule matching, and `EnableRule` starts it again. A rule that was off does not
replay what it missed. `DeleteRule` on a rule that is not there succeeds. Deleting a bus deletes its
rules with it.

`receiptsOn(...)` is a simulator accessor rather than an API: it reports what a bus received and
which rules each event matched, which is how a test asserts on routing before there are targets to
watch.

## Event patterns

A pattern has the same shape as the events it matches. Every key of a pattern has to match, which is
an "and"; a field's conditions are written as a list, and any one matching is enough, which is an
"or".

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

Values are compared by type, so the string `"5"` in a pattern does not match the number `5` in an
event. `null` and the empty string are values like any other. Where the event carries a list for a
field, the pattern matches when the two lists overlap, which is how a pattern naming one ARN matches
an event whose `resources` names several. `exists` is about the field rather than its members, so a
field carrying an empty list still exists.

Anything else is refused at `PutRule` rather than quietly never matching. The `cidr`,
`equals-ignore-case`, `wildcard` and `$or` operators are all refused by name, as are the nested forms
of `anything-but` and the case-insensitive forms of `prefix` and `suffix`. A pattern that silently
matched nothing would look like a pattern that was simply too specific, and the rule would go
unnoticed until the deployment.

## Testing a pattern without a rule

`TestEventPattern` answers whether one event matches one pattern, creating nothing:

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

This is the quickest way to find out why a rule is not firing, and a pattern this simulation cannot
evaluate is refused here exactly as `PutRule` refuses it.

## Sending matched events to targets

A rule sends every event it matches to each of its targets. A target is a simulated Lambda function,
SQS queue or SNS topic.

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
instead of the event, which is what makes `Input` useful for a target that only needs to know
something happened.

A rule has at most five targets, and a target id is unique within one rule. `PutTargets` replaces a
target of the same id rather than adding a second beside it. `RemoveTargets` reports an id the rule
does not have as a failed entry rather than failing the request. Deleting a rule takes its targets
with it.

`ListTargetsByRule` reports a rule's targets, and `ListRuleNamesByTarget` reports the rules of a bus
that send to one target ARN.

## What a target has to allow

EventBridge reaches a target as the `events.amazonaws.com` service principal, and the target's own
resource policy is the whole of the decision. There is no execution role: a rule `RoleArn` is refused
rather than simulated.

- **A queue** needs `sqs:SendMessage` for `events.amazonaws.com` in its `Policy` attribute.
- **A topic** needs `sns:Publish` for `events.amazonaws.com` in its `Policy` attribute.
- **A function** needs an `AddPermission` grant of `lambda:InvokeFunction` to
  `events.amazonaws.com`.

The policy is consulted on every delivery rather than when the target is added, so a permission taken
away afterwards stops delivery. Real EventBridge does not check it at `PutTargets` time either.

A target may be in another account or region of the same simulation. It is the target's own account
that decides, so the policy lives with the target and is evaluated by that account's IAM, as it is on
real AWS. Both condition keys AWS documents for this work: `aws:SourceArn` carries the rule's ARN and
`aws:SourceAccount` carries the account the rule belongs to.

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

An event delivered across accounts still names the account it was put in, not the target's.

## Deliveries that did not happen

Real EventBridge tells the caller nothing about a failed delivery: a `PutEvents` that matched a rule
whose target refuses the call still answers with an event id. A target that is unexpectedly empty is
explained by `deliveryFailures` instead:

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

Every operation is authorized by simulated IAM against the bus ARN. `events:ListEventBuses` has no
bus-level resource on real AWS, so it authorizes against `*` and a policy naming a bus does not allow
it.

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
up, so a caller who is not allowed to reach a bus is refused whether or not that bus exists.

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
- Event pattern matching on exact values, nested fields, lists, `prefix`, `suffix`, `anything-but`,
  `numeric` and `exists`.
- `PutTargets`, `RemoveTargets`, `ListTargetsByRule` and `ListRuleNamesByTarget`, with delivery to a
  simulated Lambda function, SQS queue or SNS topic, authorized by the target's own resource policy.
- Targets in another account or region of the same simulation, admitted by the target's own resource
  policy on `aws:SourceArn` or `aws:SourceAccount`, as real EventBridge does.
- A target's fixed `Input`, and `deliveryFailures` for deliveries that did not happen.
- The `default` bus in every account and region, without one being created.
- Bus descriptions, creation timestamps from the simulation's clock, and prefix-narrowed paged
  listings.
- The event envelope EventBridge builds from an entry, reached through `eventsOn(...)`.
- IAM authorization against the bus ARN.
- SDK interception of `EventBridgeClient`.

## Limitations

- Targets deliver to Lambda, SQS and SNS only. A target ARN naming any other service is refused when
  the target is added rather than when an event first matches.
- Target `InputPath` and `InputTransformer` are refused, as are a target `RoleArn`, dead letter
  queues and retry policies. A delivery is attempted once.
- Numbers are compared after JSON parsing, so `300`, `300.0` and `3.0e2` are one value here. Real
  EventBridge compares the JSON token when matching an exact value, and so may tell those forms
  apart. Use `numeric` to compare numbers, which is what it is for.
- The `cidr`, `equals-ignore-case`, `wildcard` and `$or` pattern operators are refused rather than
  evaluated, as are the nested forms of `anything-but` and the case-insensitive forms of `prefix`
  and `suffix`.
- Scheduled rules and EventBridge Scheduler are not simulated, so `PutRule` refuses a
  `ScheduleExpression`. A rule needs an event pattern.
- Rule tags, a rule `RoleArn`, managed rules and the
  `ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS` state are refused rather than simulated.
- Deleting an event bus deletes its rules, and deleting a rule deletes its targets. Real EventBridge
  refuses to delete either while it still has what hangs off it.
- `AWS::Events::*` CloudFormation resource types are not simulated.
- Event bus resource policies are not simulated. `PutPermission`, `RemovePermission` and the bus
  `Policy` attribute are all absent, so a caller from another account cannot be admitted to a bus,
  which is stricter than real AWS.
- Putting an event onto another account's or region's bus is refused rather than delivered.
- Partner event buses and partner event sources are refused rather than simulated, as are event bus
  tags, encryption with a customer managed key, dead letter queues, logging configuration and global
  endpoints.
- Archives, replay, schema registry and discovery, API destinations and connections are not
  simulated.
