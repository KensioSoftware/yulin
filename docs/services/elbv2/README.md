# Simulated Elastic Load Balancing

Yulin includes a simulated Application Load Balancer for tests and local development. Load
balancers, target groups, listeners and listener rules are held in memory and every operation is
authorized by simulated IAM. ELBv2-specific types are imported from the `@kensio/yulin/elbv2`
subpath.

This is the state an Application Load Balancer holds. A load balancer created here has a DNS name of
the shape real ELB issues, so a [Route53](../route53/) alias or a [CloudFront](../cloudfront/) origin
has something of the right form to point at, and its listeners and rules say what it would do with a
request. Answering a request is separate work that follows.

Only the application load balancer is simulated. A network or gateway load balancer routes below
HTTP, which nothing here speaks, so `Type: "network"` is refused rather than created as an
application load balancer in disguise.

## Creating a load balancer

```typescript sim-elbv2-create-load-balancer
/**
 * Creating a load balancer and reading the DNS name it is issued.
 *
 * Nothing answers on that name yet: it is the name a Route53 alias or a
 * CloudFront origin would point at.
 */

import {
  CreateLoadBalancerCommand,
  DescribeLoadBalancersCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const elbV2 = simAws.account("888888888888").region("eu-west-1").elbV2();

const created = await elbV2.createLoadBalancer(
  new CreateLoadBalancerCommand({
    Name: "shop-alb",
    Scheme: "internet-facing",
    // Subnets and security groups are accepted and not modelled: there is no
    // network here to place a load balancer on.
    Subnets: ["subnet-a", "subnet-b"],
  }),
);

console.log(created.LoadBalancers?.[0]?.DNSName);
// "shop-alb-0000000001.eu-west-1.elb.amazonaws.com"

console.log(created.LoadBalancers?.[0]?.LoadBalancerArn);
// "arn:aws:elasticloadbalancing:eu-west-1:888888888888:loadbalancer/app/shop-alb/0000000000000001"

const described = await elbV2.describeLoadBalancers(
  new DescribeLoadBalancersCommand({ Names: ["shop-alb"] }),
);

console.log(described.LoadBalancers?.[0]?.State.Code); // "active"
```

A load balancer is `active` as soon as it is created, where real ELB leaves one in `provisioning`
for a few minutes first. A name is unique within one account and region, so the same name can be used in
another region and the two do not see each other.

An internal load balancer's host name carries the `internal-` prefix real ELB gives it, which is also
why a load balancer cannot be named starting with `internal-`.

## Target groups hold functions or addresses

A target group names what it holds through its `TargetType`, and that decides the rest: how many
targets it takes, what a target's `Id` has to look like, and whether the group carries a protocol and
port at all.

```typescript sim-elbv2-lambda-target-group
/**
 * A target group holding one Lambda function.
 */

import {
  CreateTargetGroupCommand,
  DescribeTargetHealthCommand,
  RegisterTargetsCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const elbV2 = simAws.account("888888888888").region("eu-west-1").elbV2();

const targetGroup = await elbV2.createTargetGroup(
  new CreateTargetGroupCommand({
    Name: "checkout-tg",
    // A lambda target group takes no Protocol or Port: the load balancer
    // invokes the function rather than connecting to it.
    TargetType: "lambda",
  }),
);

const targetGroupArn = targetGroup.TargetGroups?.[0]?.TargetGroupArn;

await elbV2.registerTargets(
  new RegisterTargetsCommand({
    TargetGroupArn: targetGroupArn,
    Targets: [
      { Id: "arn:aws:lambda:eu-west-1:888888888888:function:checkout" },
    ],
  }),
);

const health = await elbV2.describeTargetHealth(
  new DescribeTargetHealthCommand({ TargetGroupArn: targetGroupArn }),
);

console.log(health.TargetHealthDescriptions?.[0]?.Target.Id);
// "arn:aws:lambda:eu-west-1:888888888888:function:checkout"
console.log(health.TargetHealthDescriptions?.[0]?.TargetHealth.State);
// "healthy"
```

A `lambda` target group takes exactly one function, as real ELB does, so registering a second is
refused. An `ip` target group is what a container service registers itself as, takes many addresses,
and requires the `Protocol` and `Port` its targets are reached on.

```typescript sim-elbv2-ip-target-group
/**
 * A target group holding addresses, and taking one out again.
 */

import {
  CreateTargetGroupCommand,
  DeregisterTargetsCommand,
  DescribeTargetHealthCommand,
  RegisterTargetsCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const elbV2 = simAws.elbV2();

const targetGroup = await elbV2.createTargetGroup(
  new CreateTargetGroupCommand({
    Name: "web-tg",
    TargetType: "ip",
    Protocol: "HTTP",
    Port: 8080,
  }),
);

const targetGroupArn = targetGroup.TargetGroups?.[0]?.TargetGroupArn;

await elbV2.registerTargets(
  new RegisterTargetsCommand({
    TargetGroupArn: targetGroupArn,
    // A target naming no port takes the group's, as it does on real ELB.
    Targets: [{ Id: "10.0.1.5" }, { Id: "10.0.1.6", Port: 9090 }],
  }),
);

await elbV2.deregisterTargets(
  new DeregisterTargetsCommand({
    TargetGroupArn: targetGroupArn,
    Targets: [{ Id: "10.0.1.6", Port: 9090 }],
  }),
);

const health = await elbV2.describeTargetHealth(
  new DescribeTargetHealthCommand({ TargetGroupArn: targetGroupArn }),
);

console.log(health.TargetHealthDescriptions?.length); // 1
console.log(health.TargetHealthDescriptions?.[0]?.Target.Port); // 8080
```

`TargetType: "instance"` is refused rather than accepted and ignored, because there are no EC2
instances here for it to mean anything about: a group created as one would look configured and route
nowhere. A request naming no target type at all is refused for the same reason, since real ELB
defaults it to `instance`.

## Listeners and the rules on them

A listener answers on a port and holds the default actions for a request no rule claims. Rules carry
a priority, and that is what decides which of several matching rules claims a request, so two rules
on one listener cannot hold the same priority.

```typescript sim-elbv2-listener-rules
/**
 * A listener and a rule sending one host name to a different target group.
 *
 * The rule is stored rather than applied: nothing matches a request against it
 * yet.
 */

import {
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateRuleCommand,
  CreateTargetGroupCommand,
  DescribeRulesCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const elbV2 = simAws.elbV2();

const loadBalancer = await elbV2.createLoadBalancer(
  new CreateLoadBalancerCommand({ Name: "shop-alb" }),
);
const web = await elbV2.createTargetGroup(
  new CreateTargetGroupCommand({
    Name: "web-tg",
    TargetType: "ip",
    Protocol: "HTTP",
    Port: 8080,
  }),
);
const admin = await elbV2.createTargetGroup(
  new CreateTargetGroupCommand({ Name: "admin-tg", TargetType: "lambda" }),
);

const listener = await elbV2.createListener(
  new CreateListenerCommand({
    LoadBalancerArn: loadBalancer.LoadBalancers?.[0]?.LoadBalancerArn,
    Protocol: "HTTP",
    Port: 80,
    DefaultActions: [
      {
        Type: "forward",
        TargetGroupArn: web.TargetGroups?.[0]?.TargetGroupArn,
      },
    ],
  }),
);

const listenerArn = listener.Listeners?.[0]?.ListenerArn;

await elbV2.createRule(
  new CreateRuleCommand({
    ListenerArn: listenerArn,
    Priority: 10,
    Conditions: [{ Field: "host-header", Values: ["admin.example.com"] }],
    Actions: [
      {
        Type: "forward",
        TargetGroupArn: admin.TargetGroups?.[0]?.TargetGroupArn,
      },
    ],
  }),
);

const rules = await elbV2.describeRules(
  new DescribeRulesCommand({ ListenerArn: listenerArn }),
);

// The listener's rules come back in evaluation order, ending in the default
// rule, which is the listener's own default actions.
console.log(rules.Rules?.map((rule) => rule.Priority)); // ["10", "default"]
```

Conditions are held rather than matched, so a request is not routed by them yet. What is checked when
a rule is written is that it could match something: the field has to be one an Application Load
Balancer understands, and it has to have values to compare against. A forward action naming a target
group that was never created is refused for the same reason.

`ModifyRule` changes a rule's conditions and actions but not its priority, as on real ELB. Moving
rules about is `SetRulePriorities`, which reorders a whole listener, and which judges a request
against the order it would leave behind rather than the one it started from, so two rules can swap
places in one request.

## Deleting

Deleting a load balancer takes its listeners and their rules with it, and leaves its target groups
where they are, which is what real ELB does: a target group is a resource in its own right and a
replacement load balancer's listeners forward to the same ones. A target group a listener or rule
still forwards to cannot be deleted until it does not.

```typescript sim-elbv2-delete-load-balancer
/**
 * Deleting a load balancer, and what survives it.
 */

import {
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateTargetGroupCommand,
  DeleteLoadBalancerCommand,
  DeleteTargetGroupCommand,
  DescribeListenersCommand,
  DescribeTargetGroupsCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";

import { SimAws } from "@kensio/yulin";
import {
  SimElbV2LoadBalancerNotFoundException,
  SimElbV2ResourceInUseException,
} from "@kensio/yulin/elbv2";

const simAws = new SimAws();
const elbV2 = simAws.elbV2();

const loadBalancer = await elbV2.createLoadBalancer(
  new CreateLoadBalancerCommand({ Name: "shop-alb" }),
);
const targetGroup = await elbV2.createTargetGroup(
  new CreateTargetGroupCommand({ Name: "checkout-tg", TargetType: "lambda" }),
);

const loadBalancerArn = loadBalancer.LoadBalancers?.[0]?.LoadBalancerArn;
const targetGroupArn = targetGroup.TargetGroups?.[0]?.TargetGroupArn;

await elbV2.createListener(
  new CreateListenerCommand({
    LoadBalancerArn: loadBalancerArn,
    Protocol: "HTTP",
    Port: 80,
    DefaultActions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
  }),
);

// While the listener forwards to it, the target group cannot go.
try {
  await elbV2.deleteTargetGroup(
    new DeleteTargetGroupCommand({ TargetGroupArn: targetGroupArn }),
  );
} catch (error) {
  console.log(error instanceof SimElbV2ResourceInUseException); // true
}

await elbV2.deleteLoadBalancer(
  new DeleteLoadBalancerCommand({ LoadBalancerArn: loadBalancerArn }),
);

// The listener went with the load balancer; the target group did not.
const remaining = await elbV2.describeTargetGroups(
  new DescribeTargetGroupsCommand({}),
);

console.log(remaining.TargetGroups?.length); // 1
console.log(remaining.TargetGroups?.[0]?.LoadBalancerArns.length); // 0

try {
  await elbV2.describeListeners(
    new DescribeListenersCommand({ LoadBalancerArn: loadBalancerArn }),
  );
} catch (error) {
  // The listener went with the load balancer, and so did the load balancer.
  console.log(error instanceof SimElbV2LoadBalancerNotFoundException); // true
}
```

## IAM authorization

Every operation is authorized by simulated [IAM](../iam/) as the caller making it, against the
`elasticloadbalancing:` action and the ARN of whatever it names. An operation naming nothing that
exists yet, such as `CreateLoadBalancer` or a describe, is authorized against `*`, so only a policy
whose Resource is `*` allows it.

```typescript sim-elbv2-iam-policy
/**
 * A Role allowed to describe load balancers but not to create one.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateLoadBalancerCommand,
  DescribeLoadBalancersCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";

import { SimAws } from "@kensio/yulin";
import { SimElbV2AccessDeniedException } from "@kensio/yulin/elbv2";

const simAws = new SimAws();
const account = simAws.account("888888888888");
const elbV2 = account.region("eu-west-1").elbV2();

await account.iam().createRole(
  new CreateRoleCommand({
    RoleName: "ReadOnlyRole",
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

await account.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ReadOnlyRole",
    PolicyName: "describe-only",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "elasticloadbalancing:DescribeLoadBalancers",
        Resource: "*",
      },
    }),
  }),
);

const caller = {
  kind: "arn",
  arn: "arn:aws:iam::888888888888:role/ReadOnlyRole",
} as const;

const described = await elbV2.describeLoadBalancers(
  new DescribeLoadBalancersCommand({}),
  { caller },
);

console.log(described.LoadBalancers?.length); // 0

try {
  await elbV2.createLoadBalancer(
    new CreateLoadBalancerCommand({ Name: "shop-alb" }),
    { caller },
  );
} catch (error) {
  console.log(error instanceof SimElbV2AccessDeniedException); // true
}
```

## AWS SDK interception

An `ElasticLoadBalancingV2Client` can be intercepted so ordinary SDK code reaches the simulation
without being handed a simulator object. See [AWS SDK interception](../../sdk/) for how that works.

```typescript sim-elbv2-sdk-interception
/**
 * Intercepting an ELBv2 SDK client.
 */

import {
  CreateLoadBalancerCommand,
  ElasticLoadBalancingV2Client,
} from "@aws-sdk/client-elastic-load-balancing-v2";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();
simSdk.intercept(ElasticLoadBalancingV2Client);

const client = new ElasticLoadBalancingV2Client({ region: "eu-west-2" });

const created = await client.send(
  new CreateLoadBalancerCommand({ Name: "shop-alb" }),
);

console.log(created.LoadBalancers?.[0]?.DNSName);
// "shop-alb-0000000001.eu-west-2.elb.amazonaws.com"
```

## Available functionality

- `CreateLoadBalancer`, `DescribeLoadBalancers` and `DeleteLoadBalancer`, with a DNS name, ARN,
  canonical hosted zone id, scheme and state on every load balancer.
- `CreateTargetGroup`, `DescribeTargetGroups`, `ModifyTargetGroup` and `DeleteTargetGroup`, with the
  `lambda` and `ip` target types.
- `RegisterTargets`, `DeregisterTargets` and `DescribeTargetHealth`.
- `CreateListener`, `DescribeListeners`, `ModifyListener` and `DeleteListener`, on HTTP and HTTPS.
- `CreateRule`, `DescribeRules`, `ModifyRule`, `DeleteRule` and `SetRulePriorities`, with priorities
  unique within a listener and the listener's default rule reported last.
- `forward`, `fixed-response` and `redirect` actions, and `host-header`, `path-pattern`,
  `http-header`, `http-request-method`, `query-string` and `source-ip` conditions. A condition is
  read through its own field's configuration, so one carrying another field's is refused.
- Paged describes with `PageSize` and `Marker`.
- IAM authorization against the ARN of whatever an operation names.
- SDK interception of `ElasticLoadBalancingV2Client`.

## Limitations

- Nothing routes a request yet. Listeners, rules and target groups say what would happen to one, and
  a simulated load balancer answers nothing.
- Network and gateway load balancers are not simulated. `Type: "network"` and `"gateway"` are
  refused, as are the `TCP`, `TLS`, `UDP`, `TCP_UDP` and `GENEVE` protocols.
- `TargetType: "instance"` and `"alb"` are refused rather than accepted and ignored, and a target
  group naming no target type at all is refused rather than defaulted to `instance` as real ELB
  defaults it.
- Health checks are not performed. Health check settings are held and reported, and every registered
  target is `healthy` however it is configured, so a test cannot watch a deployment come up.
- A load balancer is `active` immediately rather than `provisioning` for the minutes real ELB takes,
  and deregistration is immediate rather than draining connections first.
- Subnets, security groups, availability zones and cross-zone configuration are accepted and left out
  of a describe rather than modelled, and `AvailabilityZones` and `SecurityGroups` are therefore
  absent from a described load balancer.
- `CanonicalHostedZoneId` is one value everywhere rather than the real per-region one. Simulated
  Route53 resolves an alias by looking its target up, so only the shape is load-bearing, and copying
  this value into a real template would be copying the wrong one.
- ARN ids and DNS name suffixes count from one rather than being random, so a test can assert on an
  ARN it did not capture. The shape is the one real ELB issues either way.
- `authenticate-oidc` and `authenticate-cognito` actions are refused. Nothing here performs that
  exchange, and treating one as a plain forward would quietly skip authentication. Since those are
  the only actions that may precede a routing action, a listener or rule takes exactly one action
  here and a longer list is refused.
- Load balancer attributes, access logs, listener certificates as a separate resource, trust stores,
  tags as a readable resource, and weighted forwarding across target groups are not simulated. A
  `ForwardConfig` naming several target groups is stored and its weights are not acted on.
- There is no CloudFormation support yet, so `AWS::ElasticLoadBalancingV2::*` resources in a template
  are not deployed.
