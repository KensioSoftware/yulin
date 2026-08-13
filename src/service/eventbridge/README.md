# Simulated EventBridge implementation

This directory contains the simulated EventBridge service implementation. Event buses, rules and
PutEvents: targets and EventBridge Scheduler come later.

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

`SimEventRule` is a pattern and a state. What a rule does when it matches is deliberately not on it:
targets will live in their own store, keyed by rule, the same way a topic's subscriptions are in
simulated SNS.

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

`SimEventBridgeRouter` under `routing/` is what a bus does with an event: find the bus, ask each of
its enabled rules, and record the matches. Sending a matched event on to the rule's targets belongs
here too, and is what the next change adds.

## Divergences

Three, all deliberate.

An entry naming a bus that does not exist **succeeds**. Real EventBridge answers 200, matches the
event against no rule, and drops it, without counting the entry as failed. It is a trap, because a
mistyped bus name looks exactly like a working call, and reproducing it is the point.

An entry naming a bus ARN in another account or region is **refused**, which real EventBridge allows.
Nothing here can reach another simulation's bus, and treating a foreign ARN as local would let a test
pass while the real call crossed a boundary it has no permission for.

Deleting an event bus **deletes its rules**. Real EventBridge refuses to delete a bus that still has
rules on it. Refusing would mean a test tearing down a stack had to delete rules in order, and a rule
that outlived its bus would match events put onto a bus later recreated under the same name.

Event bus resource policies are not modelled at all, since nothing sets one: `PutPermission` and the
bus `Policy` attribute are both absent. A caller from another account therefore has no way to be
admitted to a bus, which is stricter than real AWS.
