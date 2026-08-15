# Simulated Elastic Load Balancing

Yulin includes a simulated Application Load Balancer for tests and local development. Load
balancers, target groups, listeners and listener rules are held in memory and every operation is
authorized by simulated IAM. ELBv2-specific types are imported from the `@kensio/yulin/elbv2`
subpath.

A load balancer created here has a DNS name of the shape real ELB issues, so a
[Route53](../route53/) alias or a [CloudFront](../cloudfront/) origin has something of the right form
to point at. It also carries a request: a request is matched to a listener by port and then to one of
that listener's rules, and a `forward` action sends it to a target group, where a registered
[Lambda](../lambda/) function is invoked with the request and its response becomes the HTTP
response.

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

Conditions are `host-header` and `path-pattern`. What is checked when a rule is written is that it
could match something: the field has to be one of those two, and it has to have values to compare
against. A forward action naming a target group that was never created is refused for the same
reason. The other four condition fields real ELB has are refused, rather than stored and then never
matched. [Matching a request against the rules](#matching-a-request-against-the-rules) covers how the
values are compared.

`ModifyRule` changes a rule's conditions and actions but not its priority, as on real ELB. Moving
rules about is `SetRulePriorities`, which reorders a whole listener, and which judges a request
against the order it would leave behind rather than the one it started from, so two rules can swap
places in one request.

## Carrying a request to a Lambda function

`simElbV2Fetch` sends a request to whichever load balancer its host name names, in process and
without a socket. The port in the URL is the listener's, so `http://<dns-name>/orders` reaches the
listener on port 80.

The listener then evaluates its rules, and the first one to claim the request says what happens to
it. A request no rule claims is answered by the listener's default action. A `forward` action sends
the request to its target group, and a `lambda` target group invokes the function registered in it.

```typescript sim-elbv2-serve-lambda-target
/**
 * A request carried through a load balancer to a Lambda function.
 */

import {
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateTargetGroupCommand,
  RegisterTargetsCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import type { SimElbV2Event, SimElbV2Result } from "@kensio/yulin/elbv2";
import { simElbV2Fetch } from "@kensio/yulin/elbv2";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const region = simAws.account("888888888888").region("eu-west-1");

const created = await region.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "checkout",
    Role: "arn:aws:iam::888888888888:role/CheckoutRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(
        (event: SimElbV2Event): SimElbV2Result => ({
          statusCode: 200,
          statusDescription: "200 OK",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: event.path, method: event.httpMethod }),
          isBase64Encoded: false,
        }),
      ),
    },
  }),
);

const elbV2 = region.elbV2();

const loadBalancer = await elbV2.createLoadBalancer(
  new CreateLoadBalancerCommand({ Name: "shop-alb" }),
);
const targetGroup = await elbV2.createTargetGroup(
  new CreateTargetGroupCommand({ Name: "checkout-tg", TargetType: "lambda" }),
);

const targetGroupArn = targetGroup.TargetGroups?.[0]?.TargetGroupArn;

// Without this the load balancer cannot invoke the function, and every request
// gets a 502.
await region.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "checkout",
    StatementId: "elb-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "elasticloadbalancing.amazonaws.com",
    SourceArn: targetGroupArn,
  }),
);

await elbV2.registerTargets(
  new RegisterTargetsCommand({
    TargetGroupArn: targetGroupArn,
    Targets: [{ Id: created.FunctionArn }],
  }),
);

await elbV2.createListener(
  new CreateListenerCommand({
    LoadBalancerArn: loadBalancer.LoadBalancers?.[0]?.LoadBalancerArn,
    Protocol: "HTTP",
    Port: 80,
    DefaultActions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
  }),
);

const dnsName = loadBalancer.LoadBalancers?.[0]?.DNSName;

const response = await simElbV2Fetch(simAws, `http://${dnsName}/orders`);

console.log(response.status); // 200
console.log(response.statusText); // "OK"
console.log(await response.json()); // { path: "/orders", method: "GET" }
```

### Matching a request against the rules

Rules are evaluated in priority order, lowest number first, and the first one whose conditions all
hold claims the request. A rule later in the order that would also have matched never sees it. A
request no rule claims falls through to the listener's default action.

A rule with more than one condition claims a request only when every one of them holds. Within one
condition, a list of values is satisfied when any one of them matches.

Both fields support the two wildcards real ELB has, `*` for zero or more characters and `?` for
exactly one, and both compare the pattern against the whole value rather than looking for it inside
one. That last part is the one worth knowing, because a pattern can read as though it covers
something it does not:

- `/api/*` claims `/api/orders` and `/api/v1/orders`, and does not claim `/api`. The pattern has a
  slash the bare path does not. Real ELB behaves the same way, which is why a rule meant to cover
  both is written as `["/api", "/api/*"]`.
- `*.example.com` claims `admin.example.com` and `a.b.example.com`, and does not claim
  `example.com`, for the same reason.
- `*` covers slashes and dots, so `/api/*` claims paths any number of segments deep.

A path pattern is compared with regard to case and a host name without, as on real ELB. A path
pattern is compared against the path alone, so a query string is not part of it.

```typescript sim-elbv2-serve-listener-rules
/**
 * An application split across two services by path, with the rules matched
 * when a request arrives.
 */

import {
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateRuleCommand,
  CreateTargetGroupCommand,
  RegisterTargetsCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import type { SimElbV2Result } from "@kensio/yulin/elbv2";
import { simElbV2Fetch, simElbV2ServicePrincipal } from "@kensio/yulin/elbv2";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const elbV2 = simAws.elbV2();
const lambda = simAws.lambda();

/**
 * Create a function answering with its own name, a target group holding it,
 * and the permission the load balancer needs to invoke it.
 */
async function makeTargetGroup(name: string): Promise<string> {
  const created = await lambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: name,
      Role: `arn:aws:iam::888888888888:role/${name}-role`,
      Code: {
        ZipFile: makeLambdaZipFileInput((): SimElbV2Result => ({
          statusCode: 200,
          body: name,
        })),
      },
    }),
  );

  const group = await elbV2.createTargetGroup(
    new CreateTargetGroupCommand({ Name: `${name}-tg`, TargetType: "lambda" }),
  );
  const groupArn = group.TargetGroups?.[0]?.TargetGroupArn;

  await lambda.addPermission(
    new AddPermissionCommand({
      FunctionName: name,
      StatementId: "elb-invoke",
      Action: "lambda:InvokeFunction",
      Principal: simElbV2ServicePrincipal,
      SourceArn: groupArn,
    }),
  );
  await elbV2.registerTargets(
    new RegisterTargetsCommand({
      TargetGroupArn: groupArn,
      Targets: [{ Id: created.FunctionArn }],
    }),
  );

  return groupArn ?? "";
}

const web = await makeTargetGroup("web");
const api = await makeTargetGroup("api");

const loadBalancer = await elbV2.createLoadBalancer(
  new CreateLoadBalancerCommand({ Name: "shop-alb" }),
);
const listener = await elbV2.createListener(
  new CreateListenerCommand({
    LoadBalancerArn: loadBalancer.LoadBalancers?.[0]?.LoadBalancerArn,
    Protocol: "HTTP",
    Port: 80,
    DefaultActions: [{ Type: "forward", TargetGroupArn: web }],
  }),
);

await elbV2.createRule(
  new CreateRuleCommand({
    ListenerArn: listener.Listeners?.[0]?.ListenerArn,
    Priority: 10,
    Conditions: [{ Field: "path-pattern", Values: ["/api/*"] }],
    Actions: [{ Type: "forward", TargetGroupArn: api }],
  }),
);

const dnsName = loadBalancer.LoadBalancers?.[0]?.DNSName ?? "";

const toApi = await simElbV2Fetch(simAws, `http://${dnsName}/api/orders`);
console.log(await toApi.text()); // "api"

// The pattern has a slash the bare path does not, so this request is not one
// the rule claims, and the listener's default action answers it.
const toWeb = await simElbV2Fetch(simAws, `http://${dnsName}/api`);
console.log(await toWeb.text()); // "web"
```

A `host-header` condition is matched against the request's Host header, falling back to the host name
in the URL when the request carries none. On real AWS those are the same thing, since DNS is what
brought the request to the load balancer. Here a request reaches one at its own DNS name, so sending
a Host header is how a test says which name the client asked for. Any port in the header is left out
of the comparison, since a condition value cannot carry one.

### Answering without a target

A `fixed-response` action answers with the status, content type and body it holds, and a `redirect`
action answers with a status and a `Location`. Neither touches a target group, so a listener holding
one serves with nothing registered behind it.

```typescript sim-elbv2-serve-fixed-response
/**
 * A health endpoint and an HTTP to HTTPS redirect, neither of which needs a
 * target group.
 */

import {
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateRuleCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";

import { SimAws } from "@kensio/yulin";
import { simElbV2Fetch } from "@kensio/yulin/elbv2";

const simAws = new SimAws();
const elbV2 = simAws.elbV2();

const loadBalancer = await elbV2.createLoadBalancer(
  new CreateLoadBalancerCommand({ Name: "shop-alb" }),
);

// Nothing is registered behind this listener, and nothing needs to be: both
// actions are answered by the load balancer itself.
const listener = await elbV2.createListener(
  new CreateListenerCommand({
    LoadBalancerArn: loadBalancer.LoadBalancers?.[0]?.LoadBalancerArn,
    Protocol: "HTTP",
    Port: 80,
    DefaultActions: [
      {
        Type: "redirect",
        RedirectConfig: {
          Protocol: "HTTPS",
          Port: "443",
          StatusCode: "HTTP_301",
        },
      },
    ],
  }),
);

await elbV2.createRule(
  new CreateRuleCommand({
    ListenerArn: listener.Listeners?.[0]?.ListenerArn,
    Priority: 10,
    Conditions: [{ Field: "path-pattern", Values: ["/health"] }],
    Actions: [
      {
        Type: "fixed-response",
        FixedResponseConfig: {
          StatusCode: "200",
          ContentType: "application/json",
          MessageBody: '{"ok":true}',
        },
      },
    ],
  }),
);

const dnsName = loadBalancer.LoadBalancers?.[0]?.DNSName ?? "";

const health = await simElbV2Fetch(simAws, `http://${dnsName}/health`);
console.log(health.status); // 200
console.log(await health.text()); // '{"ok":true}'

const redirected = await simElbV2Fetch(simAws, `http://${dnsName}/orders`, {
  headers: { host: "shop.example.com" },
});
console.log(redirected.status); // 301
console.log(redirected.headers.get("location"));
// "https://shop.example.com:443/orders"
```

A redirect keeps the components it does not name, and the five reserved keywords put a component back
where one is named: `#{protocol}`, `#{host}`, `#{port}`, `#{path}` and `#{query}`. `#{path}` comes
without its leading slash, which is why a redirect keeping the path writes it as `/#{path}`, and
`#{query}` comes without its leading question mark, which the load balancer adds. A redirect that
changes none of the protocol, host, port or path is refused when it is written, since it would
redirect to the request's own URI.

The port is always in the `Location`, including when it is the protocol's own. A redirect to HTTPS on
443 therefore answers with a `Location` ending `:443`, which is what real ELB sends.

### The event and the response

The event is ELB's own shape, not either API Gateway payload format. A handler can tell them apart by
the request context: an ALB event has an `elb` block carrying the target group ARN, and nothing else
in it.

```typescript
{
  requestContext: { elb: { targetGroupArn: "arn:aws:elasticloadbalancing:..." } },
  httpMethod: "GET",
  path: "/orders",
  queryStringParameters: { page: "2" },
  headers: { host: "shop-alb-0000000001.eu-west-1.elb.amazonaws.com", ... },
  body: "",
  isBase64Encoded: false,
}
```

Every field is always there. A request with no query string carries an empty `queryStringParameters`
rather than none, and one with no body carries an empty `body`. Cookies stay in the `cookie` header
they arrived in rather than being lifted into a field of their own. Query string values arrive as
they were sent, since real ELB does not decode percent escapes and leaves that to the function.

The load balancer writes `host`, `x-amzn-trace-id`, `x-forwarded-port` and `x-forwarded-proto`
itself, so whatever a client sent under those names does not survive. `x-forwarded-for` is the
exception: the client's address is appended to what the request already carried, which is what makes
that header a chain of proxies.

A body is passed through as text for `text/*`, `application/json`, `application/javascript` and
`application/xml`, and base64 encoded otherwise, with `isBase64Encoded` saying which happened. A
request carrying a `content-encoding` header is always base64. That list is shorter than API
Gateway's: a form post is text to API Gateway and base64 to a load balancer. A body called text that
is not valid UTF-8 fails the invocation rather than reaching the handler with replacement characters
in it.

The response has to carry a `statusCode`. `statusDescription`, `headers`, `body` and
`isBase64Encoded` are all optional, and a `statusDescription` of `200 OK` becomes the reason phrase
`OK`, since the status line already has the code. Hop-by-hop headers and `content-length` are
dropped, because the load balancer writes those itself.

### What a load balancer answers itself

```typescript sim-elbv2-serve-errors
/**
 * What a load balancer answers when its target cannot serve the request.
 */

import {
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateTargetGroupCommand,
  RegisterTargetsCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { simElbV2Fetch } from "@kensio/yulin/elbv2";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const simLambda = simAws.lambda();
const elbV2 = simAws.elbV2();

const created = await simLambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "checkout",
    Role: "arn:aws:iam::888888888888:role/CheckoutRole",
    // A handler written for an API Gateway proxy integration, which returns no
    // status code of its own.
    Code: { ZipFile: makeLambdaZipFileInput(() => ({ body: "checkout" })) },
  }),
);

const loadBalancer = await elbV2.createLoadBalancer(
  new CreateLoadBalancerCommand({ Name: "shop-alb" }),
);
const targetGroup = await elbV2.createTargetGroup(
  new CreateTargetGroupCommand({ Name: "checkout-tg", TargetType: "lambda" }),
);

const targetGroupArn = targetGroup.TargetGroups?.[0]?.TargetGroupArn;
const dnsName = loadBalancer.LoadBalancers?.[0]?.DNSName;

await elbV2.createListener(
  new CreateListenerCommand({
    LoadBalancerArn: loadBalancer.LoadBalancers?.[0]?.LoadBalancerArn,
    Protocol: "HTTP",
    Port: 80,
    DefaultActions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
  }),
);

// Nothing is registered yet, so there is no target to send the request to.
const empty = await simElbV2Fetch(simAws, `http://${dnsName}/orders`);

console.log(empty.status); // 503

await simLambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "checkout",
    StatementId: "elb-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "elasticloadbalancing.amazonaws.com",
    SourceArn: targetGroupArn,
  }),
);
await elbV2.registerTargets(
  new RegisterTargetsCommand({
    TargetGroupArn: targetGroupArn,
    Targets: [{ Id: created.FunctionArn }],
  }),
);

// The function runs now, and what it returns is not a response ELB can send.
const malformed = await simElbV2Fetch(simAws, `http://${dnsName}/orders`);

console.log(malformed.status); // 502
```

A 503 means there was no target to send the request to, which is a target group with nothing
registered in it.

A 502 means there was a target and it did not produce a response. A missing invoke permission, a
function that is not there, a handler that threw, a result with no usable `statusCode`, and a
response over 1 MB are all 502, as they are on real ELB, where the difference between them is only
visible in the load balancer's own logs. The response limit is on the whole response document rather
than on the body alone, so a base64 body counts at its encoded size.

A request body over 1 MB is a 413, which is the limit on what real ELB sends to a Lambda target.

A host name no load balancer answers on, and a port no listener holds, both throw a
`SimElbV2ConnectionRefusedError` rather than answering. Neither reaches a load balancer on real AWS
either: one resolves to nothing and the other refuses the connection, so there is no status for
either.

### The invoke permission

A load balancer invokes a Lambda function through the function's resource-based policy, exactly as
real ELB does. The grant names `elasticloadbalancing.amazonaws.com` as the principal and the target
group as the source ARN, and the load balancer supplies the target group's own Account as the source
Account, so a policy written with the `aws:SourceAccount` condition the ELB documentation recommends
matches.

Forgetting the grant is a common way to end up with a load balancer that looks configured and serves
nothing but 502s. Real ELB refuses to register a Lambda target at all until the permission is there;
here the permission is checked when the request arrives instead, so a target group can be built in
any order and a policy that is later removed stops the requests.

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
- `forward`, `fixed-response` and `redirect` actions, and `host-header` and `path-pattern`
  conditions. A condition is read through its own field's configuration, so one carrying another
  field's is refused.
- Paged describes with `PageSize` and `Marker`.
- Carrying a request through `simElbV2Fetch`: a listener matched by port, its rules evaluated in
  priority order with the first match winning, and a fall through to the default action.
- `host-header` and `path-pattern` matching with ELB's own wildcard semantics, and a rule claiming a
  request only when all of its conditions hold.
- `forward` to a `lambda` target group, which invokes its function with an ALB-shaped event, and the
  `fixed-response` and `redirect` actions, which the load balancer answers itself.
- The load balancer's own 503, 502 and 413, and the invoke permission the function's resource policy
  has to grant `elasticloadbalancing.amazonaws.com`.
- IAM authorization against the ARN of whatever an operation names.
- SDK interception of `ElasticLoadBalancingV2Client`.

## Limitations

- Only `host-header` and `path-pattern` conditions exist. The `http-header`, `http-request-method`,
  `query-string` and `source-ip` fields real ELB has are refused when the rule is written, rather
  than stored and then never matching, which would leave a rule that looks configured and claims
  nothing. Regular expression condition values, which real ELB takes in `RegexValues`, are not
  matched either.
- A `host-header` condition is matched against the request's Host header, falling back to the host
  name in the URL. On real AWS those are the same thing, because DNS is what brought the request to
  the load balancer, and here a request reaches one at its own DNS name.
- A `forward` action is carried out only to a `lambda` target group. An `ip` target group and a
  `ForwardConfig` naming several target groups by weight are each refused when the request arrives
  rather than answered with something else.
- A redirect is not checked against the listener it is on, so redirecting HTTPS to HTTP is accepted
  where real ELB refuses it. Nothing here performs TLS, so the listener's protocol is not something a
  request can be trusted to have arrived over.
- The length limits real ELB puts on a condition value, a fixed response's message body and a
  redirect's components are not enforced.
- A request only reaches a load balancer through `simElbV2Fetch`. Nothing resolves a load balancer's
  DNS name yet, so `serveSimAws` does not serve one and a Route53 alias to one does not answer.
- No TLS is performed. `simElbV2Fetch` reads only the port out of a URL, so an `https:` URL reaches
  the listener on 443 without a handshake and without being checked against that listener's
  protocol. HTTPS listeners and their certificates follow separately.
- The invoke permission is checked when the request arrives, where real ELB checks it when a Lambda
  target is registered and refuses `RegisterTargets` without it. A target naming a function in
  another Account or Region is registered here and then answers 502, where real ELB refuses the
  registration.
- Multi-value headers are not simulated. `lambda.multi_value_headers.enabled` cannot be set, since
  target group attributes are not simulated, so the event and the accepted response always use the
  single-value `headers` and `queryStringParameters` fields. A repeated query string key keeps its
  last value, as real ELB does with the attribute off, while repeated request headers arrive already
  joined with commas rather than reduced to the last one.
- Health check requests are never sent to a Lambda target, so a handler will not see the
  `ELB-HealthChecker/2.0` event real ELB sends when health checks are enabled on a `lambda` target
  group.
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
- Load balancer and target group attributes, access logs, listener certificates as a separate
  resource, trust stores, and tags as a readable resource are not simulated.
- There is no CloudFormation support yet, so `AWS::ElasticLoadBalancingV2::*` resources in a template
  are not deployed.
