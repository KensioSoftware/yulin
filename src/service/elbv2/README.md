# Simulated Elastic Load Balancing v2 implementation

This directory contains the simulated ELBv2 service implementation.

The guiding decision here is that this is the Application Load Balancer and nothing else. A network
or gateway load balancer routes below HTTP, which nothing in this simulation speaks, so one is
refused rather than created as something it is not. The second decision is that this piece is state:
a load balancer here has a DNS name of the shape real ELB issues, and listeners, rules and target
groups saying what it would do with a request. Answering a request is separate work.

## Entry points

- `sim-elbv2.ts` is the main in-memory service object for one account/region scope.
- `index.ts` exports the public ELBv2 simulator API for `@kensio/yulin/elbv2`.

A `SimElbV2` instance owns a `SimElbV2Stores` holding its four resources. The simulator is scoped to
an account and region because real load balancers are: an ARN names the region, a name is unique
within one account and region rather than globally, and the DNS name ELB issues carries the region.

## Resource model

The four resources live in four stores rather than nested inside each other, because the SDK
addresses each of them by its own ARN and a describe has no parent to start from. What they do have
is a lifetime that runs one way, and `SimElbV2Stores` owns that: deleting a load balancer takes its
listeners, and deleting a listener takes its rules. Target groups are left alone, which is what real
ELB does, since a replacement load balancer's listeners forward to the same groups.

`SimElbV2LoadBalancer` is the DNS name above all. That is the only way anything reaches a load
balancer on real AWS, and it is what a Route53 alias or a CloudFront origin points at.
`sim-elbv2-load-balancer-arn.ts` builds both it and the ARN, and owns the `internal-` prefix an
internal load balancer's host name carries, which is why that prefix is refused in a load balancer's
own name.

`SimElbV2Listener` and `SimElbV2ListenerRule` build their ARNs from their parents' rather than from
the scope. That is what makes the load balancer's name and id appear in a listener ARN the way real
ELB has them, and what lets a rule say which listener it belongs to without anything looking it up.

`SimElbV2TargetType` is a strategy rather than a label. How many targets a group takes, what a
target's Id has to look like, and whether the group carries a protocol and port all depend on it,
and each subclass is one set of those answers. That is why nothing else in the service branches on
whether a group holds a function or an address. `instance` is refused rather than accepted: there
are no EC2 instances here for it to mean anything about, and a group created as one would look
configured and route nowhere. A request naming no type at all is refused too, because real ELB
defaults it to `instance`.

`SimElbV2Action` and `SimElbV2RuleCondition` hold what a listener or rule would do and what it would
match, and neither performs it. What they own is that what is stored is something a real load
balancer would have accepted: a forward action names a target group that exists, a fixed-response
action has a status code, and a condition is on a field with something to compare against. Each is
checked when the rule is written rather than when a request arrives.

`SimElbV2ListenerRuleStore` owns priority uniqueness, because it is a property of a listener's whole
set of rules rather than of any one rule. `SetRulePriorities` judges a request against the order it
would leave behind rather than the one it started from, which is what lets two rules swap places in
one request.

`SimElbV2TargetGroupUsage` answers which load balancers forward to a target group by reading the
listeners and rules rather than by a record on the group. A rule can be written and deleted without
the group hearing about it, so reading it back is the only answer that cannot go stale. It is also
what refuses to delete a group anything still forwards to.

## Command handling

AWS SDK-style operations are implemented under `command/`, one directory per resource and one
handler per operation, so the `SimElbV2` facade stays a list of delegations:

- `command/load-balancer/` — `CreateLoadBalancer`, `DescribeLoadBalancers`, `DeleteLoadBalancer`
- `command/target-group/` — the target group create, describe, modify and delete
- `command/target/` — `RegisterTargets`, `DeregisterTargets`, `DescribeTargetHealth`
- `command/listener/` — the listener create, describe, modify and delete
- `command/rule/` — the rule create, describe, modify and delete, and `SetRulePriorities`
- `command/authorize/` — the shared IAM authorizer
- `command/sim-elbv2-command-handler.ts` — the collaborators every handler holds
- `command/sim-elbv2-command.types.ts` — the command types gathered for the facade

`SimElbV2Commands` builds the handlers, so the facade is a method per operation and adding one is a
handler there and a method here.

As elsewhere, implementation code under `src/` does not import real AWS SDK packages. The structural
command types in `*.command.ts` match the SDK shapes closely enough for callers to pass real SDK
command instances. Enum-shaped fields are widened to `string`, so an input this simulation refuses
is refused at runtime with an explanation rather than by the type checker with none.

## Authorization

`SimElbV2Authorizer` serves the whole service rather than one authorizer per command, because ELBv2
has one action prefix for all four resources and the resource an action names is the ARN of whichever
of them it operates on. An operation naming nothing that exists yet, such as `CreateLoadBalancer` or
a describe, authorizes against `*`, so only a policy whose Resource is `*` allows it.

There is no resource policy support here, and none to add: ELBv2 has none on real AWS either.

## Divergences worth knowing

- A load balancer is `active` as soon as it is created. Real ELB leaves one `provisioning` for a few
  minutes, which every test would wait out for no behaviour it could observe.
- Every registered target is `healthy`. No health check is ever performed, so health check settings
  are held and reported and nothing acts on them.
- `CanonicalHostedZoneId` is one value everywhere rather than the real per-region table, because
  simulated Route53 resolves an alias by looking the target up rather than by its zone id.
- Deregistration is immediate, where real ELB drains connections first, because there are no
  connections to drain.
- Subnets, security groups and availability zones are accepted and left out of a describe rather
  than invented.
- ARN ids and DNS name suffixes count rather than being random, so a test can assert on an ARN it
  did not capture. The shape is the real one either way.

The full list is in [docs/services/elbv2](../../../docs/services/elbv2/).
