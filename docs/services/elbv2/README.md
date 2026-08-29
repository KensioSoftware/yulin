# Simulated Elastic Load Balancing

Yulin includes a simulated Application Load Balancer for tests and local development. Load
balancers, target groups, listeners and listener rules are held in memory and every operation is
authorized by simulated IAM. ELBv2-specific types are imported from the `@kensio/yulin/elbv2`
subpath.

A load balancer created here has a DNS name of the shape real ELB issues, and a
[Route53](https://yulinsim.dev/services/route53/) record pointing at that name resolves to it. A request made to your own
hostname reaches the load balancer as it would deployed. A request is matched to a listener by port
and then to one of that listener's rules, and a `forward` action sends it to a target group, where a
registered [Lambda](https://yulinsim.dev/services/lambda/) function is invoked with the request and its response becomes the
HTTP response.

Only the application load balancer is simulated. A network or gateway load balancer routes below
HTTP, which nothing here speaks, and `Type: "network"` is refused outright.

No TLS is performed anywhere in this. An HTTPS listener holds a certificate and is checked against
simulated ACM, and everything travels in the clear. See
[HTTPS listeners and certificates](#https-listeners-and-certificates) for what that leaves a test
able to conclude.

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
for a few minutes first. A name is unique within one account and region. The same name can be used
in another region, and the two stay separate.

An internal load balancer's host name carries the `internal-` prefix real ELB gives it. That is also
why a load balancer cannot be named starting with `internal-`.

## Target groups hold functions or addresses

A target group names what it holds through its `TargetType`, and that decides the rest. It sets how
many targets the group takes, what a target's `Id` has to look like, and whether the group carries a
protocol and port at all.

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

A `lambda` target group takes exactly one function, as real ELB does, and registering a second is
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

`TargetType: "instance"` is refused outright, because there are no EC2 instances here for it to mean
anything about. A group created as one would look configured and route nowhere. A request naming no
target type at all is refused for the same reason, since real ELB defaults it to `instance`.

## Listeners and the rules on them

A listener answers on a port and holds the default actions for a request no rule claims. Rules carry
a priority, and that is what decides which of several matching rules claims a request. Two rules on
one listener cannot hold the same priority.

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
could match something. The field has to be one of those two, and it has to have values to compare
against. A forward action naming a target group that was never created is refused for the same
reason. The other four condition fields real ELB has are refused at write time, ahead of any
request. [Matching a request against the rules](#matching-a-request-against-the-rules) covers how
the values are compared.

`ModifyRule` changes a rule's conditions and actions but not its priority, as on real ELB. Moving
rules about is `SetRulePriorities`, which reorders a whole listener. It judges a request against the
order it would leave behind, and two rules can therefore swap places in one request.

## HTTPS listeners and certificates

A listener on `HTTPS` carries a certificate from simulated ACM. The certificate has to be one that
exists and has been issued, and one in the load balancer's own account and region, or the listener
is refused with the reason. That refusal is the point of connecting the two simulations. A test can
prove that a stack's certificate and its listener line up, ahead of the deploy that would otherwise
find out.

**No TLS is performed here.** Everything travels in the clear, with no handshake and no certificate
presented to anything. What is simulated is the configuration relationship between a listener and a
certificate, and the protocol a request is treated as having arrived on.

```typescript sim-elbv2-https-listener
/**
 * An HTTPS listener holding a certificate simulated ACM issued.
 *
 * No TLS is performed: the certificate is checked and held, and nothing is
 * encrypted or presented to a client.
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

A certificate that is still `PENDING_VALIDATION` is refused the same way, since a listener
presenting one could serve nothing. That is what makes a test of the whole issuance path worth
writing. The certificate has to have been validated for the listener that uses it to be created.

An HTTPS listener with no certificate at all is refused, and so is a listener that names a
certificate and speaks something other than HTTPS, which would otherwise look configured for HTTPS
while answering plain HTTP. Moving a listener to HTTP without naming a certificate drops the ones it
was carrying, since only an HTTPS listener presents a certificate.

### The certificate list

A listener's default certificate is the one `CreateListener` and `ModifyListener` name, and it is
the one a described listener reports. The rest of the list is `AddListenerCertificates`,
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

The default certificate cannot be removed this way. Replacing it is `ModifyListener`, as on real
ELB, and trying to remove it is refused, naming it.

### Serving a request over HTTPS

A request to `https://<dns-name>/orders` reaches the listener on port 443, and from there it is the
same request as any other. The same rules are evaluated in the same order, and the same target
groups answer. The listener's protocol is what the target is told the request arrived on, and a
function behind an HTTPS listener sees `x-forwarded-proto: https` and `x-forwarded-port: 443`.

Because no TLS happens, the URL scheme goes unchecked against the listener it reaches. What decides
the listener is the port, and what decides the protocol in the event is the listener. A test can
therefore conclude that a request treated as arriving over HTTPS is routed and forwarded the way the
configuration says. Certificates, ciphers and handshakes stay out of reach.

## Carrying a request to a Lambda function

`simElbV2Fetch` sends a request to whichever load balancer its host name names, in process and
without a socket. The port in the URL is the listener's, and `http://<dns-name>/orders` reaches the
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
exactly one, and both compare the pattern against the whole value. Neither looks for the pattern
inside a longer value. That last part is the one worth knowing, because a pattern can read as though
it covers more than it does:

- `/api/*` claims `/api/orders` and `/api/v1/orders`, and leaves `/api` alone. The pattern has a
  slash the bare path lacks. Real ELB behaves the same way, and a rule meant to cover both is
  written as `["/api", "/api/*"]`.
- `*.example.com` claims `admin.example.com` and `a.b.example.com`, and leaves `example.com` alone,
  for the same reason.
- `*` covers slashes and dots, so `/api/*` claims paths any number of segments deep.

A path pattern is compared with regard to case and a host name without, as on real ELB. A path
pattern is compared against the path alone, and a query string plays no part in it.

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

A `host-header` condition is matched against the request's Host header, falling back to the host
name in the URL when the request carries none. On real AWS those are the same thing, since DNS is
what brought the request to the load balancer. Here a request reaches one at its own DNS name, so
sending a Host header is how a test says which name the client asked for. Any port in the header is
left out of the comparison, since a condition value cannot carry one.

### Answering without a target

A `fixed-response` action answers with the status, content type and body it holds, and a `redirect`
action answers with a status and a `Location`. Neither touches a target group, and a listener
holding one serves with nothing registered behind it.

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

A redirect keeps every component it leaves unnamed, and the five reserved keywords put a component
back where one is named. They are `#{protocol}`, `#{host}`, `#{port}`, `#{path}` and `#{query}`.
`#{path}` comes without its leading slash, and a redirect keeping the path writes it as `/#{path}`.
`#{query}` comes without its leading question mark, which the load balancer adds. A redirect that
changes none of the protocol, host, port or path is refused when it is written, since it would
redirect to the request's own URI.

The port is always in the `Location`, including when it is the protocol's own. A redirect to HTTPS
on 443 therefore answers with a `Location` ending `:443`, as real ELB sends it.

### The event and the response

The event is ELB's own shape, distinct from both API Gateway payload formats. A handler can tell
them apart by the request context. An ALB event's request context holds one `elb` block, carrying
the target group ARN.

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

Every field is always there. A request with no query string carries an empty
`queryStringParameters`, and one with no body carries an empty `body`. Cookies stay in the `cookie`
header they arrived in, and never move into a field of their own. Query string values arrive as they
were sent, since real ELB leaves percent escapes for the function to decode.

The load balancer writes `host`, `x-amzn-trace-id`, `x-forwarded-port` and `x-forwarded-proto`
itself, and overwrites whatever a client sent under those names. `x-forwarded-for` is the exception.
The client's address is appended to what the request already carried. That is what makes that header
a chain of proxies.

A body is passed through as text for `text/*`, `application/json`, `application/javascript` and
`application/xml`, and base64 encoded otherwise, with `isBase64Encoded` saying which happened. A
request carrying a `content-encoding` header is always base64. That list is shorter than API
Gateway's, and a form post is text to API Gateway and base64 to a load balancer. A body called text
that turns out to be invalid UTF-8 fails the invocation, ahead of any handler seeing replacement
characters.

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

A 503 means there was no target to send the request to, such as an empty target group.

A 502 means there was a target and it failed to produce a response. A missing invoke permission, a
function that was never created, a handler that threw, a result with no usable `statusCode`, and a
response over 1 MB are all 502, as they are on real ELB, where the difference between them shows up
only in the load balancer's own logs. The response limit is on the whole response document, and a
base64 body counts at its encoded size.

A request body over 1 MB is a 413, the limit on what real ELB sends to a Lambda target.

A host name no load balancer answers on, and a port no listener holds, both throw a
`SimElbV2ConnectionRefusedError`. Neither reaches a load balancer on real AWS either. One resolves
to nothing and the other refuses the connection, and there is no status for either.

### The invoke permission

A load balancer invokes a Lambda function through the function's resource-based policy, exactly as
real ELB does. The grant names `elasticloadbalancing.amazonaws.com` as the principal and the target
group as the source ARN, and the load balancer supplies the target group's own Account as the source
Account. A policy written with the `aws:SourceAccount` condition the ELB documentation recommends
therefore matches.

Forgetting the grant is a common way to end up with a load balancer that looks configured and serves
nothing but 502s. Real ELB refuses to register a Lambda target at all until the permission is there.
Here the permission is checked when the request arrives. A target group can be built in any order,
and a policy that is later removed stops the requests.

## Carrying a request to an ECS service

An `ip` target group is answered by the simulated [ECS](https://yulinsim.dev/services/ecs/) service registered into it. A
service declares `loadBalancers` naming a target group, a container and a container port. Each task
it keeps running is registered into that group as an address, and a request forwarded there reaches
the handler bound to the service's container.

That is the whole path an application takes. A client asks for a name, Route53 resolves it to the
load balancer, a rule picks the target group, and the container's own code answers. This is a stack
deployed from a template, which is how one usually arrives.

```typescript sim-elbv2-serve-ecs-service
/**
 * A request reaching an ECS service's container through a load balancer.
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

import { SimSdk } from "@kensio/yulin/sdk";
import { SimAwsHttp } from "@kensio/yulin/serve";

using simSdk = new SimSdk();
const { simAws } = simSdk;

// The application's own SDK clients, intercepted as they would be in any test.
simSdk.intercept(DynamoDBClient);

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders",
  template: {
    Resources: {
      OrdersTable: {
        Type: "AWS::DynamoDB::Table",
        Properties: {
          TableName: "orders",
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [
            { AttributeName: "orderId", AttributeType: "S" },
          ],
          KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
        },
      },
      OrdersTaskRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "OrdersTaskRole",
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "ecs-tasks.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          },
          Policies: [
            {
              PolicyName: "ReadWriteOrders",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: ["dynamodb:PutItem", "dynamodb:GetItem"],
                    Resource: { "Fn::GetAtt": ["OrdersTable", "Arn"] },
                  },
                ],
              },
            },
          ],
        },
      },
      OrdersAlb: {
        Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
        Properties: { Name: "orders-alb", Scheme: "internet-facing" },
      },
      OrdersTargetGroup: {
        Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
        Properties: {
          Name: "orders-tg",
          TargetType: "ip",
          Protocol: "HTTP",
          Port: 80,
        },
      },
      HttpListener: {
        Type: "AWS::ElasticLoadBalancingV2::Listener",
        Properties: {
          LoadBalancerArn: { Ref: "OrdersAlb" },
          Protocol: "HTTP",
          Port: 80,
          DefaultActions: [
            { Type: "forward", TargetGroupArn: { Ref: "OrdersTargetGroup" } },
          ],
        },
      },
      OrdersZone: {
        Type: "AWS::Route53::HostedZone",
        Properties: { Name: "example.test" },
      },
      OrdersRecord: {
        Type: "AWS::Route53::RecordSet",
        Properties: {
          HostedZoneId: { Ref: "OrdersZone" },
          Name: "orders.example.test",
          Type: "A",
          AliasTarget: {
            DNSName: { "Fn::GetAtt": ["OrdersAlb", "DNSName"] },
            HostedZoneId: {
              "Fn::GetAtt": ["OrdersAlb", "CanonicalHostedZoneID"],
            },
          },
        },
      },
      OrdersCluster: {
        Type: "AWS::ECS::Cluster",
        Properties: { ClusterName: "orders" },
      },
      OrdersTaskDefinition: {
        Type: "AWS::ECS::TaskDefinition",
        Properties: {
          Family: "orders-api",
          NetworkMode: "awsvpc",
          TaskRoleArn: { "Fn::GetAtt": ["OrdersTaskRole", "Arn"] },
          ContainerDefinitions: [
            // The proxy the service registers, which Yulin has nothing to run.
            {
              Name: "nginx",
              Image: "public.ecr.aws/nginx/nginx:1.27",
              PortMappings: [{ ContainerPort: 80 }],
            },
            {
              Name: "app",
              Image: "example.dkr.ecr.eu-west-2.amazonaws.com/orders-api:1",
              PortMappings: [{ ContainerPort: 8080 }],
              Environment: [{ Name: "ORDERS_TABLE", Value: "orders" }],
            },
          ],
        },
      },
      OrdersService: {
        Type: "AWS::ECS::Service",
        Properties: {
          ServiceName: "orders-api",
          Cluster: { Ref: "OrdersCluster" },
          TaskDefinition: { Ref: "OrdersTaskDefinition" },
          DesiredCount: 2,
          LaunchType: "FARGATE",
          LoadBalancers: [
            {
              TargetGroupArn: { Ref: "OrdersTargetGroup" },
              ContainerName: "nginx",
              ContainerPort: 80,
            },
          ],
        },
      },
    },
  },
  bindings: [
    {
      logicalId: "OrdersTaskDefinition",
      containerName: "app",
      http: async (request: Request): Promise<Response> => {
        const dynamoDb = new DynamoDBClient({});
        const orderId = new URL(request.url).pathname.split("/").at(-1) ?? "";

        if (request.method === "POST") {
          await dynamoDb.send(
            new PutItemCommand({
              TableName: process.env["ORDERS_TABLE"],
              Item: { orderId: { S: orderId }, item: { S: "flat white" } },
            }),
          );

          return new Response("", { status: 201 });
        }

        const read = await dynamoDb.send(
          new GetItemCommand({
            TableName: process.env["ORDERS_TABLE"],
            Key: { orderId: { S: orderId } },
          }),
        );

        return Response.json({ item: read.Item?.["item"]?.S ?? null });
      },
    },
  ],
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();

// The name Route53 answers for, reached in process rather than over a socket.
const client = new SimAwsHttp({ simAws });
const url = "http://orders.example.test.sim-aws.localhost:52341/orders/42";

const placed = await client.fetch(url, { method: "POST" });

console.log(placed.status); // 201

const read = await client.fetch(url);

console.log(await read.json()); // { item: "flat white" }
```

The container's own AWS calls are authorized as the task role the task definition declared. A policy
that would break the deployed service breaks the test. Everything in the handler is ordinary
application code, with an SDK client, `process.env`, a route and a response.

### What the container is given

The request is the one the client made, with the headers a load balancer writes in front of a
target. Those are the `host` the client asked for, `x-forwarded-for`, `x-forwarded-proto`,
`x-forwarded-port` and `x-amzn-trace-id`. Its URL is the AWS-facing one, carrying the listener's
scheme and port. A container reading `request.url` sees the name a client asked for, and never the
localhost one a served request arrived at. A Lambda target behind the same listener gets the same
values in its event, since both are written by the same rules.

### Which container answers, and what a 503 means

Which container of a task a request reaches is a deliberate divergence, documented in full under
[the ECS service docs](https://yulinsim.dev/services/ecs/#which-container-of-a-task-answers). In short, real ECS routes to the
container the registration names on the port it names, the common real task puts an unsimulated
proxy on that port, and the request here goes to a container that is bound.

Three things are all the same 503 real ELB answers when no target is in service:

- a target group with nothing registered in it
- a target group whose registered service has no container bound to an HTTP handler
- an address registered by hand, since only an ECS service registration puts something behind an
  address in this simulation

A container whose handler throws is a 502, as a Lambda target that throws is, and so is one
answering with something other than a `Response`. The error goes no further than the load balancer,
as it goes no further on real AWS.

## Reaching a load balancer by name

A load balancer's DNS name resolves through simulated [Route53](https://yulinsim.dev/services/route53/), and a record pointing
at it reaches its listeners and rules. An alias record is the usual way, and a CNAME below the apex
works too, the same as on real AWS. The record's value is `DNSName` exactly as a describe reported
it.

A `host-header` condition then sees the name the request was made to, and never the load balancer's
own. A rule on `api.example.test` claims a request that a Route53 record for `api.example.test`
brought to the load balancer. Host-based routing and DNS agree, and a stack with one load balancer
behind several names behaves here as it does deployed.

Under `serveSimAws` the same name is served over real localhost HTTP, and a DNS lookup for it
answers with the address the local server listens on. A request made under the Yulin-local suffix
reaches the listener on port 80, since the port such a request carries belongs to the local server
and not to a client's choice.

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

A name pointing at a load balancer that has since been deleted fails. Nothing holds that host name
any more, and the failure names it. A DNS lookup for the name still answers, because the shape of a
load balancer host name is what a lookup recognises, in the same way a lookup for a deleted bucket's
website name does.

## Deleting

Deleting a load balancer takes its listeners and their rules with it, and leaves its target groups
where they are, as real ELB does. A target group is a resource in its own right, and a replacement
load balancer's listeners forward to the same ones. A target group a listener or rule still forwards
to cannot be deleted until that forward has gone.

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

## Deploying a load balancer from CloudFormation

`AWS::ElasticLoadBalancingV2::LoadBalancer`, `TargetGroup`, `Listener` and `ListenerRule` create
their simulated counterparts, and a test can start from the stack the routing is actually defined
in. Each one goes through the same command an SDK caller would use. A template's listener rule
matches requests the way the same rule created by hand does, and a declaration real ELB would refuse
fails the deployment.

`Ref` returns the ARN of all four, and that is what a listener's `LoadBalancerArn`, a rule's
`ListenerArn` and a forward action's `TargetGroupArn` each take. `Fn::GetAtt` answers with:

- `DNSName`, `LoadBalancerArn`, `LoadBalancerName`, `LoadBalancerFullName` and
  `CanonicalHostedZoneID` on a load balancer
- `TargetGroupArn`, `TargetGroupName` and `TargetGroupFullName` on a target group
- `ListenerArn` on a listener, and `RuleArn` and `IsDefault` on a rule

An unnamed load balancer or target group is named after the stack, the logical ID and a tail derived
from both, trimmed to the 32 characters ELB allows. The tail takes 13 of those, which leaves nine
characters for the stack name and nine for the logical ID once a name has to be trimmed.
[the CloudFormation docs](https://yulinsim.dev/services/cloudformation/#names-cloudformation-generates "Names CloudFormation generates")
cover the rule. A target group declaring `Targets` has them registered as part of creating
it, and the group routes as soon as the stack has deployed.

```typescript sim-elbv2-cloudformation
/**
 * Deploying a load balancer, target group, listener and rule from a template.
 */

import { SimAws } from "@kensio/yulin";
import type { SimElbV2Event, SimElbV2Result } from "@kensio/yulin/elbv2";
import { simElbV2Fetch } from "@kensio/yulin/elbv2";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "shop",
  template: {
    Resources: {
      CheckoutFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "checkout",
          Role: "arn:aws:iam::888888888888:role/CheckoutRole",
        },
      },
      ShopAlb: {
        Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
        Properties: {
          Name: "shop-alb",
          Scheme: "internet-facing",
          // Accepted and left out: there is no VPC here to place one in.
          Subnets: ["subnet-1111", "subnet-2222"],
        },
      },
      CheckoutTargets: {
        Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
        Properties: {
          Name: "checkout-tg",
          TargetType: "lambda",
          // Registered at deploy time, so the group routes straight away.
          Targets: [{ Id: { "Fn::GetAtt": ["CheckoutFunction", "Arn"] } }],
        },
      },
      InvokePermission: {
        Type: "AWS::Lambda::Permission",
        Properties: {
          FunctionName: { Ref: "CheckoutFunction" },
          Action: "lambda:InvokeFunction",
          Principal: "elasticloadbalancing.amazonaws.com",
          SourceArn: { Ref: "CheckoutTargets" },
        },
      },
      HttpListener: {
        Type: "AWS::ElasticLoadBalancingV2::Listener",
        Properties: {
          LoadBalancerArn: { Ref: "ShopAlb" },
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
        },
      },
      CheckoutRule: {
        Type: "AWS::ElasticLoadBalancingV2::ListenerRule",
        Properties: {
          ListenerArn: { Ref: "HttpListener" },
          Priority: 10,
          Conditions: [{ Field: "path-pattern", Values: ["/checkout*"] }],
          Actions: [
            { Type: "forward", TargetGroupArn: { Ref: "CheckoutTargets" } },
          ],
        },
      },
    },
    Outputs: {
      DnsName: { Value: { "Fn::GetAtt": ["ShopAlb", "DNSName"] } },
      FullName: {
        Value: { "Fn::GetAtt": ["ShopAlb", "LoadBalancerFullName"] },
      },
    },
  },
  bindings: [
    {
      logicalId: "CheckoutFunction",
      handler: (event: SimElbV2Event): SimElbV2Result => ({
        statusCode: 200,
        statusDescription: "200 OK",
        headers: { "content-type": "text/plain" },
        body: `checkout ${event.path}`,
        isBase64Encoded: false,
      }),
    },
  ],
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();

const dnsName = stack.output("DnsName");

console.log(dnsName); // "shop-alb-0000000001.us-east-1.elb.amazonaws.com"
console.log(stack.output("FullName"));
// "app/shop-alb/0000000001"

const claimed = await simElbV2Fetch(simAws, `http://${dnsName}/checkout/42`);

console.log(claimed.status); // 200
console.log(await claimed.text()); // "checkout /checkout/42"

// A request no rule claims falls through to the listener's default action.
const unclaimed = await simElbV2Fetch(simAws, `http://${dnsName}/other`);

console.log(unclaimed.status); // 404
```

A listener's `Certificates` resolves against simulated [ACM](https://yulinsim.dev/services/acm/), and a stack that creates a
certificate and attaches it to an HTTPS listener works end to end. A certificate that was never
issued, or that belongs to another account or region, fails the deployment outright. A `Fn::GetAtt`
on `DNSName` is a name a Route53 alias in the same stack can point at and reach.

```typescript sim-elbv2-cloudformation-certificate
/**
 * An HTTPS listener holding a certificate the same stack created.
 */

import { DescribeListenersCommand } from "@aws-sdk/client-elastic-load-balancing-v2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "shop",
  template: {
    Resources: {
      ShopZone: {
        Type: "AWS::Route53::HostedZone",
        Properties: { Name: "example.test" },
      },
      SiteCertificate: {
        Type: "AWS::CertificateManager::Certificate",
        Properties: {
          DomainName: "shop.example.test",
          ValidationMethod: "DNS",
        },
      },
      ShopAlb: {
        Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
        Properties: { Name: "shop-alb" },
      },
      HttpsListener: {
        Type: "AWS::ElasticLoadBalancingV2::Listener",
        Properties: {
          LoadBalancerArn: { Ref: "ShopAlb" },
          Protocol: "HTTPS",
          Port: 443,
          Certificates: [{ CertificateArn: { Ref: "SiteCertificate" } }],
          DefaultActions: [
            {
              Type: "fixed-response",
              FixedResponseConfig: {
                StatusCode: "200",
                ContentType: "text/plain",
                MessageBody: "shop",
              },
            },
          ],
        },
      },
      ShopRecord: {
        Type: "AWS::Route53::RecordSet",
        Properties: {
          HostedZoneId: { Ref: "ShopZone" },
          Name: "shop.example.test",
          Type: "A",
          AliasTarget: {
            DNSName: { "Fn::GetAtt": ["ShopAlb", "DNSName"] },
            HostedZoneId: {
              "Fn::GetAtt": ["ShopAlb", "CanonicalHostedZoneID"],
            },
          },
        },
      },
    },
    Outputs: {
      ListenerArn: { Value: { Ref: "HttpsListener" } },
    },
  },
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();

const listenerArn = stack.output("ListenerArn");

const described = await simAws
  .elbV2()
  .describeListeners(
    new DescribeListenersCommand({ ListenerArns: [listenerArn] }),
  );

const listener = described.Listeners?.[0];

console.log(listener?.Certificates[0]?.CertificateArn);
// the ARN of the certificate the stack created

console.log(listener?.SslPolicy); // "ELBSecurityPolicy-2016-08"
```

Properties Yulin has no use for are read and left out, and the stack still deploys. Subnets,
security groups, load balancer and target group attributes, listener attributes, mutual
authentication and health check configuration are all in that group. Each one is recorded on the
Resource, where a reader can see which parts of the deployed load balancer are inert:

```typescript
const ignored = stack.getResource("ShopAlb")?.ignoredProperties;
```

Tearing the stack down removes all four in reverse dependency order. A rule comes down before its
listener, a listener before its load balancer, and a target group after everything forwarding to it.

## IAM authorization

Every operation is authorized by simulated [IAM](https://yulinsim.dev/services/iam/) as the caller making it, against the
`elasticloadbalancing:` action and the ARN of whatever it names. An operation that names no existing
resource, such as `CreateLoadBalancer` or a describe, is authorized against `*`, and only a policy
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
without being handed a simulator object. See [AWS SDK interception](https://yulinsim.dev/sdk/) for how that works.

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
- An HTTPS listener's default certificate resolved against simulated ACM, refusing a missing one,
  one whose status falls short of `ISSUED`, and one outside the load balancer's own account and
  region.
- `AddListenerCertificates`, `RemoveListenerCertificates` and `DescribeListenerCertificates`, with
  the default certificate reported first and refused removal.
- `CreateRule`, `DescribeRules`, `ModifyRule`, `DeleteRule` and `SetRulePriorities`, with priorities
  unique within a listener and the listener's default rule reported last.
- `forward`, `fixed-response` and `redirect` actions, and `host-header` and `path-pattern`
  conditions. A condition is read through its own field's configuration, so one carrying another
  field's is refused.
- Paged describes with `PageSize` and `Marker`.
- Carrying a request through `simElbV2Fetch`, with a listener matched by port, its rules evaluated
  in priority order with the first match winning, and a fall through to the default action.
- Resolving a load balancer's DNS name through sim Route53, where an alias record or a CNAME
  pointing at it reaches its listeners and rules, and a `host-header` condition sees the name the
  request was made to.
- Serving a load balancer under `serveSimAws`, over real localhost HTTP and with a DNS lookup for
  the name answering with the address the local server listens on.
- `host-header` and `path-pattern` matching with ELB's own wildcard semantics, and a rule claiming a
  request only when all of its conditions hold.
- `forward` to a `lambda` target group, which invokes its function with an ALB-shaped event, and the
  `fixed-response` and `redirect` actions, which the load balancer answers itself.
- `forward` to an `ip` target group, which reaches the container of the simulated ECS service
  registered into it, with the request carrying the forwarding headers a load balancer writes.
- The load balancer's own 503, 502 and 413, and the invoke permission the function's resource policy
  has to grant `elasticloadbalancing.amazonaws.com`.
- Deploying `AWS::ElasticLoadBalancingV2::LoadBalancer`, `TargetGroup`, `Listener` and
  `ListenerRule` from a CloudFormation template, with `Ref` returning ARNs, `Fn::GetAtt` answering
  `DNSName`, `LoadBalancerFullName` and `TargetGroupFullName` among others, a listener's
  `Certificates` resolved against simulated ACM, and a target group's `Targets` registered at deploy
  time.
- IAM authorization against the ARN of whatever an operation names.
- SDK interception of `ElasticLoadBalancingV2Client`.

## Limitations

- Only `host-header` and `path-pattern` conditions exist. The `http-header`, `http-request-method`,
  `query-string` and `source-ip` fields real ELB has are refused when the rule is written. Storing
  them would leave a rule that looks configured while claiming no request at all. Regular expression
  condition values, which real ELB takes in `RegexValues`, go unmatched too.
- A `host-header` condition is matched against the request's Host header, falling back to the host
  name in the URL. On real AWS those are the same thing, because DNS is what brought the request to
  the load balancer. A request served under the Yulin-local suffix is matched against the name
  inside that suffix, so `api.example.test.sim-aws.localhost` is matched as `api.example.test`.
- A `ForwardConfig` naming several target groups by weight is refused when the request arrives.
  Nothing here reads the weights, and which group takes a request is a question this cannot answer.
- An `ip` target group is answered by the simulated ECS service registered into it, and by that
  alone. An address registered by hand is a 503, since only an ECS service registration puts
  something behind an address here.
- Requests are never shared between the targets of a group. An ECS service's desired count is state
  and not concurrency, and a group holding three targets calls one container handler.
- Which container of an ECS task a request reaches diverges from real ECS on purpose, and is
  documented under [the ECS docs](https://yulinsim.dev/services/ecs/#which-container-of-a-task-answers).
- A redirect goes unchecked against the listener it is on, and redirecting HTTPS to HTTP is accepted
  where real ELB refuses it. Nothing here performs TLS, and the listener's protocol says nothing
  about what a request really arrived over.
- No TLS is performed on an HTTPS listener. Everything travels in the clear, with no handshake and
  no certificate presented to a client. What a test can conclude is that a listener's certificate
  exists, was issued, and is in the load balancer's account and region, and that a request treated
  as arriving over HTTPS is routed and forwarded the way the configuration says. Out of reach are a
  client trusting the certificate, expiry, protocol versions and ciphers, and whether a request
  really arrived over a secure connection.
- The URL scheme a request is written with goes unchecked against the listener it reaches. The port
  decides the listener, and the listener decides the protocol the event and the forwarding headers
  report. So `http://<dns-name>:443/` reaching an HTTPS listener is served as an HTTPS request,
  where a real handshake would have failed.
- SNI certificate selection by host name is absent. The certificates beyond the default are held and
  reported, and nothing chooses between them when a request arrives, since there is no handshake to
  choose in. The default certificate is the one every request is served under.
- Security policies and cipher suites are accepted and ignored. A listener that names no `SslPolicy`
  is given the one real ELB defaults to, the value is reported back, and nothing acts on it.
- `IsDefault` is ignored on `AddListenerCertificates`, as real ELB documents that it should not be
  set there. The default certificate is replaced with `ModifyListener`, which drops the certificate
  that was the default instead of moving it into the rest of the list.
- A certificate is only ever an ACM one. `ImportCertificate`, IAM server certificates and mutual TLS
  are all absent, and there is no trust store to give a listener.
- The length limits real ELB puts on a fixed response's message body and a redirect's components go
  unenforced. A condition value is held to ELB's own 128 characters.
- A request served under the Yulin-local suffix reaches the listener on port 80, or on 443 for an
  `https:` URL. The port such a request carries belongs to the local server, and cannot say which
  listener it is for. To reach a listener on another port over localhost, serve on that port and
  request the hostname without the suffix, which needs a resolver pointed at the simulator as
  described in [Route53](https://yulinsim.dev/services/route53/#ports).
- A DNS lookup for a name pointing at a load balancer that has been deleted still answers with the
  local server address, because a load balancer host name is recognised by its shape. The request
  that follows is the thing that fails, naming the host name nothing answers on.
- The invoke permission is checked when the request arrives, where real ELB checks it when a Lambda
  target is registered and refuses `RegisterTargets` without it. A target naming a function in
  another Account or Region is registered here and then answers 502, where real ELB refuses the
  registration.
- Multi-value headers are absent. `lambda.multi_value_headers.enabled` cannot be set, because target
  group attributes are absent too, and the event and the accepted response always use the
  single-value `headers` and `queryStringParameters` fields. A repeated query string key keeps its
  last value, as real ELB does with the attribute off, while repeated request headers arrive already
  joined with commas.
- Health check requests never reach a target. A Lambda function or a container here will never see
  the `ELB-HealthChecker/2.0` request real ELB sends when health checks are enabled.
- Network and gateway load balancers are absent. `Type: "network"` and `"gateway"` are refused, as
  are the `TCP`, `TLS`, `UDP`, `TCP_UDP` and `GENEVE` protocols.
- `TargetType: "instance"` and `"alb"` are refused outright, and so is a target group naming no
  target type at all, where real ELB defaults it to `instance`.
- Health checks never run. Health check settings are held and reported, and every registered target
  is `healthy` however it is configured, so a test cannot watch a deployment come up.
- A load balancer is `active` immediately, where real ELB spends minutes in `provisioning`, and
  deregistration is immediate, where real ELB drains connections first.
- Subnets, security groups, availability zones and cross-zone configuration are accepted and left
  out of a describe, and `AvailabilityZones` and `SecurityGroups` are therefore absent from a
  described load balancer.
- `CanonicalHostedZoneId` is one value everywhere, where the real one varies by region. Simulated
  Route53 resolves an alias by looking its target up, so only the shape is load-bearing, and copying
  this value into a real template would be copying the wrong one.
- ARN ids and DNS name suffixes count from one, where real ones are random, and a test can therefore
  assert on an ARN it never captured. The shape is the one real ELB issues either way.
- `authenticate-oidc` and `authenticate-cognito` actions are refused. Nothing here performs that
  exchange, and treating one as a plain forward would quietly skip authentication. Since those are
  the only actions that may precede a routing action, a listener or rule takes exactly one action
  here and a longer list is refused.
- Load balancer and target group attributes, access logs, and tags as a readable resource are all
  absent.
- `AWS::ElasticLoadBalancingV2::TrustStore`, `TrustStoreRevocation` and `ListenerCertificate` are
  never deployed, and a stack declaring one records it as unsupported and carries on. The first two
  have nothing to attach to, with mutual TLS absent, and a listener's additional certificates are
  added with `AddListenerCertificates`.
- `Fn::GetAtt` `SecurityGroups` on a load balancer and `LoadBalancerArns` on a target group are both
  refused. Nothing places a simulated load balancer behind a security group, and a target group
  keeps no record of which load balancers forward to it, which `DescribeTargetGroups` reads back out
  of the listeners instead.
- Sim CloudFormation has no in-place resource update. A changed load balancer, target group,
  listener or rule is deleted and created again, and everything naming it is replaced too. A
  replaced load balancer gets a new DNS name.
