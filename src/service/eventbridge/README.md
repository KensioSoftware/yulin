# Simulated EventBridge implementation

This directory contains the simulated EventBridge service implementation. Event buses, rules,
targets, PutEvents and scheduled rules. EventBridge Scheduler comes later.

The guiding decision here is that a bus is a router rather than a store. Real EventBridge keeps no
events, so nothing here answers an SDK command from stored events. The events a bus does keep are a
simulator affordance for tests, reached through `SimEventBridge.eventsOn(...)`, and no command reads
them.

## Entry points

- `sim-event-bridge.ts` is the main in-memory service object for one account/region scope.
- `index.ts` exports the public EventBridge simulator API for `@kensio/yulin/eventbridge`.

A `SimEventBridge` instance owns a `SimEventBusStore` holding its buses. The simulator is scoped to
an account and region because buses are: a bus ARN names the region, and a bus name is unique within
one account and region rather than globally.

## Bus model

Bus state lives under `bus/`.

`SimEventBus` is the stored resource: its name, its ARN, when it was created, and the events it has
received. `SimEventBus.default(...)` builds the bus every account and region has without one being
created, and `SimEventBusStore` is constructed with it rather than seeding itself, so the store stays
a store.

`SimEventBusArn` carries a resource type, unlike an SNS topic ARN: it is
`arn:aws:events:<region>:<account>:event-bus/<name>`. That is why `parseEventBusArn` does this
service's own ARN reading rather than deferring to `parseSimArn`, and why an IAM policy resource for a
bus has the `event-bus/` in it.

`SimEventBusName` validates a name in one place. The API's own pattern allows `/`, but only for
partner bus names of the form `aws.partner/...`, so a name carrying one is refused here as an
unsimulated input rather than as a malformed name.

## Event model

`SimEventBridgeEvent` under `event/` is what a bus received. It is deliberately not the PutEvents
entry that produced it: the entry carries `DetailType` and a `Detail` string, and the event carries
`detail-type` and a parsed `detail` object, which is the shape a rule matches and a target receives.
`toEnvelope()` produces that shape, writing the timestamp RFC3339 to the second, as real EventBridge
does.

## Rule model

Rule state lives under `rule/`, and the pattern engine under `pattern/`.

`SimEventRule` is a state and whatever makes it fire: an event pattern, a schedule, or both. Both are
optional on it and PutRule refuses a rule carrying neither, rather than the rule type being an
enumeration: real EventBridge takes both on one rule, and a rule with only a schedule matching no
event falls out of `pattern` being absent rather than out of a check. What a rule does when it fires
is deliberately not on it: targets live in their own store, keyed by rule, the same way a topic's
subscriptions are in simulated SNS.

`eventRuleArn` is the one place a rule ARN is built, because a request has to authorize against the
ARN a rule would have before knowing whether that rule exists. A rule on the default bus leaves the
bus out of its ARN and a rule on a custom bus carries it, which is what keeps two rules of the same
name on two buses apart.

`SimEventRuleStore` keys rules by bus and name together, since a rule name is unique within a bus
rather than within the account.

## Pattern engine

The shape mirrors simulated SNS's filter policies, and deliberately shares no code with them. Both
read a JSON document into a tree of matchers, but they are matching different things: an SNS filter
policy matches a flat map of typed message attributes, and an EventBridge pattern matches the nested
JSON of a whole event. The operator sets differ too. Sharing would have meant a type parameter
threaded through every matcher to save a handful of comparisons.

- `SimEventPattern` is the public thing: parse from the string a request carried, keep that string
  for DescribeRule to report back, and match an event.
- `SimEventPatternNode` is one object of the pattern, and `SimEventPatternField` is one key's list of
  conditions. The node holds the "every key matches" rule and the field holds the "any condition
  matches" rule, which is the whole of the and/or behaviour.
- `match/` holds one class per operator, and `sim-event-pattern-operators.ts` is the table that picks
  between them. An operator real EventBridge has and this does not is listed by name there, so a
  pattern using one is refused saying so rather than refused as unrecognised. Which of the two
  messages a reader gets tells them whether they mistyped an operator or reached for one that is not
  here yet.

Matchers take `unknown` for the event value they compare, and narrow it themselves. Event values are
parsed JSON of no known shape, so the alternative was casting the envelope into a JSON type at the
boundary, which would have been a lie about what the matcher can be handed.

## Commands

Command handling follows the usual layout: `command/<area>/*.command.ts` for the local structural SDK
types, and a handler class beside it.

`SimEventBridgeBusAccess` is how a request reaches the bus it names. Every operation but
ListEventBuses goes through it, and it authorizes before looking the bus up, so a caller with no
permission is refused for a bus that does not exist rather than told the bus is missing.

`SimEventBridgePutEvents` is the one with real behaviour in it, and most of that behaviour is about
what fails and how:

- Entries are independent. One EventBridge will not take comes back as a failure in its own place in
  the result while the rest go through, which is why `SimEventBridgeEntryFailure` is a returned value
  rather than a thrown error.
- `Detail`, `DetailType` and `Source` are optional in the API model and required in practice. An entry
  missing one fails on its own; a request in which _no_ entry carries all three fails outright. Both
  halves of that rule are AWS's, and `SimEventBridgeEntryReader.isRoutable` is what the second half
  asks of each entry.
- The size limit is on the request, not the entry, and it is measured by AWS's own documented
  calculation rather than by the JSON on the wire. `sim-event-bridge-entry-size.ts` implements that
  calculation, which is why a `Time` counts as a flat 14 bytes and a `TraceHeader` counts as nothing.

## Target model and delivery

Targets live under `target/`, and getting an event to one lives under `delivery/`.

`SimEventTargetStore` holds targets keyed by bus and rule rather than on the rule itself, the same
way a topic's subscriptions are held apart from the topic in simulated SNS. A rule with no targets is
a rule that matches events and sends them nowhere, which real EventBridge lets you have, and holding
them apart is what keeps that from looking like a broken rule.

`SimEventTargetArn` reads target ARNs itself rather than deferring to `parseSimArn`, because the
three services it delivers to write their resource part three ways: a queue and a topic put the name
straight after the Account, and a function writes `function:<name>`. An ARN naming any other service
is refused when the target is added, so a rule that cannot work says so at the point it was written.

Delivery has one class per destination service, and each asks that service's own authorizer:
`SimSqsServiceSendAuthorizer`, `SimSnsServicePublishAuthorizer` and
`SimLambdaServiceInvokeAuthorizer`. Those already existed for simulated SNS's own fan-out, and they
answer the same question here with a different service principal, so nothing about who may reach a
queue lives in this service.

`SimAwsEventBridgeDeliveryTargets` is the SimAws-level dispatcher, and a `SimEventBridge` built on
its own gets `SimEventBridgeNoDeliveryTargets` instead, which records every delivery as a failure
saying why there was nowhere to make it. A rule that appeared to deliver to a target that was never
reachable would be the worst of the possible answers.

## Scheduled rules

`schedule/` holds what makes a rule fire on its own, and the expression parser it uses lives in
`src/util/schedule/` rather than here.

That split is the point. EventBridge Scheduler is a separate service with its own dialect: its cron
fields are the same six and its rate expression does not insist a unit agrees with its value. So
`SimScheduleDialect` is what a service brings, and `eventBridgeScheduleDialect` in
`sim-event-bridge-schedule.ts` is EventBridge's. The parser throws `SimScheduleExpressionError` and
`SimUnsimulatedScheduleExpressionError`, which know nothing about any service, and
`eventBridgeSchedule(...)` turns them into this service's own `ValidationException` and
`UnsimulatedInputException`.

`SimCronExpression.nextAfter(...)` searches rather than enumerates. A field that does not match skips
the whole of the unit below it, so a month that does not match moves to the first of the next month
instead of trying its forty thousand minutes. The search ends at the year after the dialect's highest,
which is what gives a cron expression naming only past years an answer of "never" rather than a loop.

`SimEventBridgeRuleSchedules` arms a rule for its next due instant through
`BackgroundScheduler.scheduleAt`, and a firing arms the next one before it returns. That is what makes
firing per due instant rather than per advance: `SimClockControl.advanceBy` walks the interval taking
whatever has fallen due, so a rule rescheduling itself inside the interval is taken again in the same
walk. An hour of `rate(1 minute)` is therefore sixty firings at sixty instants.

Nothing cancels a timer. A firing checks that the rule it holds is still the rule its store has under
that name, and stops if it is not, which covers deletion and a PutRule replacement in one. A disabled
rule is re-armed without firing, which is what makes `EnableRule` pick up from the next due instant
rather than replay what it missed.

## Routing

`SimEventBridgeRouter` under `routing/` is what a bus does with an event: find the bus, ask each of
its enabled rules, record the matches, and schedule a delivery for every target of every rule that
matched. `SimEventBridgeTargetDelivery` makes each of those deliveries and keeps whatever went wrong.

`fire(...)` is the scheduled path, and it skips the matching: nothing put the event onto the bus, so
there is nothing to match it against. It still records the event on the bus, which is what lets a test
with no target yet assert on a schedule through `eventsOn(...)`.

The split is that the router decides and the delivery does. A failure is recorded rather than thrown
because these run as background tasks: one left rejected would fail an unrelated
`backgroundTasksComplete()`, and real EventBridge has nowhere to report a delivery failure to
anyway.

## Divergences

Six, all deliberate.

An entry naming a bus that does not exist **succeeds**. Real EventBridge answers 200, matches the
event against no rule, and drops it, without counting the entry as failed. It is a trap, because a
mistyped bus name looks exactly like a working call, and reproducing it is the point.

An entry naming a bus ARN in another account or region is **refused**, which real EventBridge allows.
Nothing here can reach another simulation's bus, and treating a foreign ARN as local would let a test
pass while the real call crossed a boundary it has no permission for.

Deleting an event bus **deletes its rules**, and deleting a rule **deletes its targets**. Real
EventBridge refuses to delete either while it still has what hangs off it. Refusing would mean a test
tearing down a stack had to delete in order, and a rule that outlived its bus would match events put
onto a bus later recreated under the same name.

`PutTargets` **refuses the whole request** for a target it will not take, where real EventBridge
reports a failed entry. Every failure this simulation has is about the request being written for
something unmodelled, and a caller not reading `FailedEntryCount` would otherwise see a silent
no-op.

Event bus resource policies are not modelled at all, since nothing sets one: `PutPermission` and the
bus `Policy` attribute are both absent. A caller from another account therefore has no way to be
admitted to a bus, which is stricter than real AWS.

A scheduled rule fires **exactly, and exactly once**. Real EventBridge documents a delay of several
seconds between a rule falling due and its target running, and does not promise a single delivery.
Reproducing either would make a test on a schedule assert on something that is not the schedule.
