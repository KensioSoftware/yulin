# Simulated Elastic Load Balancing

Yulin includes a simulated Application Load Balancer for tests and local development. Load
balancers, target groups, listeners and listener rules are held in memory and every operation is
authorized by simulated IAM. ELBv2-specific types are imported from the `@kensio/yulin/elbv2`
subpath.

A load balancer created here has a DNS name of the shape real ELB issues, and a
[Route53](../route53/) record pointing at that name resolves to it, so a request made to your own
hostname reaches the load balancer as it would deployed. A request is matched to a listener by port
and then to one of that listener's rules, and a `forward` action sends it to a target group, where a
registered [Lambda](../lambda/) function is invoked with the request and its response becomes the
HTTP response.

Only the application load balancer is simulated. A network or gateway load balancer routes below
HTTP, which nothing here speaks, so `Type: "network"` is refused rather than created as an
application load balancer in disguise.

## Creating a load balancer

```typescript sim-elbv2-create-load-balancer
/**
 * Creating a load balancer and reading the DNS name it is issued.
 *
 * That name is what a Route53 record points at, and what a request addressed
 * to the load balancer directly names. A request that a Route53 record brought
 * here names the record instead.
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

## HTTPS listeners and certificates

A listener on `HTTPS` carries a certificate from simulated ACM. The certificate has to be one that
exists and has been issued, and one in the load balancer's own account and region, or the listener is
refused with the reason. That refusal is the point of connecting the two simulations: a test can
prove that a stack's certificate and its listener line up, rather than the stack finding out at
deploy time.

**No TLS is performed here.** Nothing is encrypted, no handshake happens, and no certificate is
presented to anything. What is simulated is the configuration relationship between a listener and a
certificate, and the protocol a request is treated as having arrived on.

```typescript sim-elbv2-https-listener
/**
 * An HTTPS listener presenting a certificate simulated ACM issued.
 */

import { RequestCertificateCommand } from "@aws-sdk/client-acm";
import {
  type Action,
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateTargetGroupCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const elbV2 = simAws.elbV2();

const certificate = await simAws
  .acm()
  .requestCertificate(
    new RequestCertificateCommand({ DomainName: "shop.example.com" }),
  );

// A certificate no hosted zone covers issues on its own, once the simulation's
// background work has run.
await simAws.backgroundTasksComplete();

const loadBalancer = await elbV2.createLoadBalancer(
  new CreateLoadBalancerCommand({ Name: "shop-alb" }),
);
const targetGroup = await elbV2.createTargetGroup(
  new CreateTargetGroupCommand({ Name: "checkout-tg", TargetType: "lambda" }),
);

const loadBalancerArn = loadBalancer.LoadBalancers?.[0]?.LoadBalancerArn;
const forward: Action = {
  Type: "forward",
  TargetGroupArn: targetGroup.TargetGroups?.[0]?.TargetGroupArn,
};

const listener = await elbV2.createListener(
  new CreateListenerCommand({
    LoadBalancerArn: loadBalancerArn,
    Protocol: "HTTPS",
    Port: 443,
    Certificates: [{ CertificateArn: certificate.CertificateArn }],
    DefaultActions: [forward],
  }),
);

// A listener that named no security policy gets the one real ELB gives it.
console.log(listener.Listeners?.[0]?.SslPolicy); // "ELBSecurityPolicy-2016-08"

try {
  await elbV2.createListener(
    new CreateListenerCommand({
      LoadBalancerArn: loadBalancerArn,
      Protocol: "HTTPS",
      Port: 8443,
      Certificates: [
        {
          CertificateArn:
            "arn:aws:acm:us-east-1:888888888888:certificate/00000009",
        },
      ],
      DefaultActions: [forward],
    }),
  );
} catch (error) {
  // Certificate arn:aws:acm:us-east-1:888888888888:certificate/00000009 was
  // not found in simulated ACM
  console.log((error as Error).message);
}
```

A certificate that is still `PENDING_VALIDATION` is refused the same way, since a listener presenting
one could serve nothing. That is what makes a test of the whole issuance path worth writing: the
certificate has to have been validated for the listener that uses it to be created.

An HTTPS listener with no certificate at all is refused, and so is a listener that names a
certificate and speaks something other than HTTPS, which would otherwise look configured for HTTPS
while answering plain HTTP. Moving a listener to HTTP without naming a certificate drops the ones it
was carrying, since nothing would present them.

### The certificate list

A listener's default certificate is the one `CreateListener` and `ModifyListener` name, and it is the
one a described listener reports. The rest of the list is `AddListenerCertificates`,
`RemoveListenerCertificates` and `DescribeListenerCertificates`, which are the certificates a real
listener would choose between by the host name a client asked for.

```typescript sim-elbv2-listener-certificates
/**
 * The certificates a listener carries beyond its default one.
 */

import { RequestCertificateCommand } from "@aws-sdk/client-acm";
import {
  AddListenerCertificatesCommand,
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateTargetGroupCommand,
  DescribeListenerCertificatesCommand,
  RemoveListenerCertificatesCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const acm = simAws.acm();
const elbV2 = simAws.elbV2();

async function issuedCertificateArn(domainName: string): Promise<string> {
  const requested = await acm.requestCertificate(
    new RequestCertificateCommand({ DomainName: domainName }),
  );

  await simAws.backgroundTasksComplete();

  return requested.CertificateArn ?? "";
}

const shop = await issuedCertificateArn("shop.example.com");
const admin = await issuedCertificateArn("admin.example.com");

const loadBalancer = await elbV2.createLoadBalancer(
  new CreateLoadBalancerCommand({ Name: "shop-alb" }),
);
const targetGroup = await elbV2.createTargetGroup(
  new CreateTargetGroupCommand({ Name: "checkout-tg", TargetType: "lambda" }),
);

const listener = await elbV2.createListener(
  new CreateListenerCommand({
    LoadBalancerArn: loadBalancer.LoadBalancers?.[0]?.LoadBalancerArn,
    Protocol: "HTTPS",
    Port: 443,
    Certificates: [{ CertificateArn: shop }],
    DefaultActions: [
      {
        Type: "forward",
        TargetGroupArn: targetGroup.TargetGroups?.[0]?.TargetGroupArn,
      },
    ],
  }),
);

const listenerArn = listener.Listeners?.[0]?.ListenerArn;

await elbV2.addListenerCertificates(
  new AddListenerCertificatesCommand({
    ListenerArn: listenerArn,
    Certificates: [{ CertificateArn: admin }],
  }),
);

const carried = await elbV2.describeListenerCertificates(
  new DescribeListenerCertificatesCommand({ ListenerArn: listenerArn }),
);

// The default certificate comes first and is the only one flagged as such.
console.log(carried.Certificates?.map((each) => each.IsDefault)); // [true, false]

await elbV2.removeListenerCertificates(
  new RemoveListenerCertificatesCommand({
    ListenerArn: listenerArn,
    Certificates: [{ CertificateArn: admin }],
  }),
);
```

The default certificate cannot be removed this way. Replacing it is `ModifyListener`, as on real ELB,
and trying to remove it is refused with that named.

### Serving a request over HTTPS

A request to `https://<dns-name>/orders` reaches the listener on port 443, and from there it is the
same request as any other: the same rules are evaluated in the same order, and the same target groups
answer. The listener's protocol is what the target is told the request arrived on, so a function
behind an HTTPS listener sees `x-forwarded-proto: https` and `x-forwarded-port: 443`.

Because no TLS happens, the URL scheme is not checked against the listener it reaches. What decides
the listener is the port, and what decides the protocol in the event is the listener. A test can
therefore conclude that a request treated as arriving over HTTPS is routed and forwarded the way the
configuration says, and cannot conclude anything about certificates, ciphers or a handshake.

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

## Reaching a load balancer by name

A load balancer's DNS name resolves through simulated [Route53](../route53/), so a record pointing at
it reaches its listeners and rules. An alias record is the usual way, and a CNAME below the apex
works too, the same as on real AWS. The record's value is `DNSName` exactly as a describe reported
it, with nothing to rewrite.

A `host-header` condition then sees the name the request was made to, rather than the load balancer's
own, so a rule on `api.example.test` claims a request that a Route53 record for `api.example.test`
brought to the load balancer. Host-based routing and DNS agree, which is what makes a stack with one
load balancer behind several names behave here as it does deployed.

Under `serveSimAws` the same name is served over real localhost HTTP, and a DNS lookup for it answers
with the address the local server listens on. A request made under the Yulin-local suffix reaches the
listener on port 80, since the port such a request carries is the local server's rather than one a
client chose.

```typescript sim-elbv2-route53-alias
/**
 * Reaching a load balancer through the Route53 name pointing at it.
 */

import {
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateRuleCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const elbV2 = simAws.elbV2();

const created = await elbV2.createLoadBalancer(
  new CreateLoadBalancerCommand({ Name: "shop-alb" }),
);

const loadBalancerArn = created.LoadBalancers?.[0]?.LoadBalancerArn;
const dnsName = created.LoadBalancers?.[0]?.DNSName;

const listener = await elbV2.createListener(
  new CreateListenerCommand({
    LoadBalancerArn: loadBalancerArn,
    Protocol: "HTTP",
    Port: 80,
    DefaultActions: [
      {
        Type: "fixed-response",
        FixedResponseConfig: {
          StatusCode: "404",
          ContentType: "text/plain",
          MessageBody: "no such site",
        },
      },
    ],
  }),
);

// The rule matches on the name a client asks for, not on the load balancer's.
await elbV2.createRule(
  new CreateRuleCommand({
    ListenerArn: listener.Listeners?.[0]?.ListenerArn,
    Priority: 10,
    Conditions: [{ Field: "host-header", Values: ["api.example.test"] }],
    Actions: [
      {
        Type: "fixed-response",
        FixedResponseConfig: {
          StatusCode: "200",
          ContentType: "text/plain",
          MessageBody: "orders",
        },
      },
    ],
  }),
);

const zone = await simAws.route53().createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "shop-zone",
  }),
);

await simAws.route53().changeResourceRecordSets(
  new ChangeResourceRecordSetsCommand({
    HostedZoneId: zone.HostedZone?.Id,
    ChangeBatch: {
      Changes: [
        {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "api.example.test",
            Type: "A",
            AliasTarget: {
              DNSName: dnsName,
              // The load balancer's CanonicalHostedZoneId, which sim Route53
              // does not resolve by.
              HostedZoneId: "Z0000000000000",
              EvaluateTargetHealth: false,
            },
          },
        },
      ],
    },
  }),
);

await simAws.backgroundTasksComplete();

const srv = await serveSimAws({ simAws });

try {
  const response = await fetch(srv.localUrl("http://api.example.test/orders"));

  console.log(response.status); // 200
  console.log(await response.text()); // "orders"

  // The same name answers a DNS lookup with the address serving it.
  console.log(`dig @127.0.0.1 -p ${srv.dnsPort} api.example.test`);
} finally {
  await srv.close();
}
```

A name pointing at a load balancer that has since been deleted fails rather than answering: nothing
holds that host name any more, and the failure names it. A DNS lookup for the name still answers,
because the shape of a load balancer host name is what a lookup recognises, in the same way a lookup
for a deleted bucket's website name does.

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
- An HTTPS listener's default certificate resolved against simulated ACM, refusing one that does not
  exist, one that is not `ISSUED`, and one outside the load balancer's own account and region.
- `AddListenerCertificates`, `RemoveListenerCertificates` and `DescribeListenerCertificates`, with
  the default certificate reported first and refused removal.
- `CreateRule`, `DescribeRules`, `ModifyRule`, `DeleteRule` and `SetRulePriorities`, with priorities
  unique within a listener and the listener's default rule reported last.
- `forward`, `fixed-response` and `redirect` actions, and `host-header` and `path-pattern`
  conditions. A condition is read through its own field's configuration, so one carrying another
  field's is refused.
- Paged describes with `PageSize` and `Marker`.
- Carrying a request through `simElbV2Fetch`: a listener matched by port, its rules evaluated in
  priority order with the first match winning, and a fall through to the default action.
- Resolving a load balancer's DNS name through sim Route53, so an alias record or a CNAME pointing at
  it reaches its listeners and rules, and a `host-header` condition sees the name the request was
  made to.
- Serving a load balancer under `serveSimAws`, over real localhost HTTP and with a DNS lookup for the
  name answering with the address the local server listens on.
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
  the load balancer. A request served under the Yulin-local suffix is matched against the name inside
  that suffix, so `api.example.test.sim-aws.localhost` is matched as `api.example.test`.
- A `forward` action is carried out only to a `lambda` target group. An `ip` target group and a
  `ForwardConfig` naming several target groups by weight are each refused when the request arrives
  rather than answered with something else.
- A redirect is not checked against the listener it is on, so redirecting HTTPS to HTTP is accepted
  where real ELB refuses it. Nothing here performs TLS, so the listener's protocol is not something a
  request can be trusted to have arrived over.
- No TLS is performed on an HTTPS listener. Nothing is encrypted, no handshake happens, and no
  certificate is presented to a client. What a test can conclude is that a listener's certificate
  exists, was issued, and is in the load balancer's account and region, and that a request treated as
  arriving over HTTPS is routed and forwarded the way the configuration says. What it cannot conclude
  is anything about a client trusting the certificate, about expiry, about protocol versions or
  ciphers, or about a request having really arrived over a secure connection.
- The URL scheme a request is written with is not checked against the listener it reaches. The port
  decides the listener, and the listener decides the protocol the event and the forwarding headers
  report, so `http://<dns-name>:443/` reaching an HTTPS listener is served as an HTTPS request rather
  than refused as a failed handshake.
- SNI certificate selection by host name is not simulated. The certificates beyond the default are
  held and reported, and nothing chooses between them when a request arrives, since there is no
  handshake to choose in. The default certificate is the one every request is served under.
- Security policies and cipher suites are accepted and ignored. A listener that names no `SslPolicy`
  is given the one real ELB defaults to, the value is reported back, and nothing acts on it.
- `IsDefault` is ignored on `AddListenerCertificates`, as real ELB documents that it should not be
  set there. The default certificate is replaced with `ModifyListener`, which drops the certificate
  that was the default rather than moving it into the rest of the list.
- A certificate is only ever an ACM one. `ImportCertificate` and IAM server certificates are not
  simulated, and neither is mutual TLS, so there is no trust store to give a listener.
- The length limits real ELB puts on a fixed response's message body and a redirect's components are
  not enforced. A condition value is held to ELB's own 128 characters.
- A request served under the Yulin-local suffix reaches the listener on port 80, or on 443 for an
  `https:` URL. The port such a request carries is the local server's rather than one a client chose,
  so it cannot say which listener it is for. To reach a listener on another port over localhost,
  serve on that port and request the hostname without the suffix, which needs a resolver pointed at
  the simulator as described in [Route53](../route53/README.md#ports).
- A DNS lookup for a name pointing at a load balancer that has been deleted still answers with the
  local server address, because a load balancer host name is recognised by its shape. The request
  that follows is the thing that fails, naming the host name nothing answers on.
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
- Load balancer and target group attributes, access logs, and tags as a readable resource are not
  simulated.
- There is no CloudFormation support yet, so `AWS::ElasticLoadBalancingV2::*` resources in a template
  are not deployed.
