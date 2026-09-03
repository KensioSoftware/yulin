# Simulated WAFv2

Yulin simulates AWS WAFv2 web ACLs, IP sets and regex pattern sets for tests and local development.
You can evaluate a `Request` directly or associate a web ACL with a simulated API Gateway REST API,
Cognito user pool or CloudFront distribution. Each request is checked against the web ACL before
the protected service handles it.

Import WAFv2-specific types from `@kensio/yulin/wafv2`.

## Deciding what happens to a request

`evaluateRequest` puts one request through a web ACL. It takes the web ACL's ARN and an ordinary
`Request`, and answers with the decision.

```typescript sim-wafv2-evaluate
/**
 * Blocking requests to an admin path with a simulated web ACL.
 */

import { CreateWebACLCommand } from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";

const waf = new SimAws().wafV2();

const created = await waf.createWebAcl(
  new CreateWebACLCommand({
    Name: "api-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: {
      SampledRequestsEnabled: false,
      CloudWatchMetricsEnabled: false,
      MetricName: "api",
    },
    Rules: [
      {
        Name: "block-admin",
        Priority: 0,
        Action: { Block: {} },
        Statement: {
          ByteMatchStatement: {
            FieldToMatch: { UriPath: {} },
            PositionalConstraint: "STARTS_WITH",
            SearchString: Buffer.from("/admin"),
            TextTransformations: [{ Priority: 0, Type: "LOWERCASE" }],
          },
        },
        VisibilityConfig: {
          SampledRequestsEnabled: false,
          CloudWatchMetricsEnabled: false,
          MetricName: "block-admin",
        },
      },
    ],
  }),
);

const webAclArn = created.Summary!.ARN;

const blocked = waf.evaluateRequest({
  webAclArn,
  request: new Request("https://example.test/admin/users"),
});
const allowed = waf.evaluateRequest({
  webAclArn,
  request: new Request("https://example.test/"),
});

// "BLOCK" "block-admin" 403
console.log(
  blocked.action,
  blocked.terminatingRuleName,
  blocked.blocked?.statusCode,
);

// "ALLOW" undefined
console.log(allowed.action, allowed.terminatingRuleName);
```

The decision names the rule that reached it. A request no rule claims gets the web ACL's
`DefaultAction`, and `terminatingRuleName` is then absent.

`simWafBlockedHttpResponse` turns a blocked decision into the `Response` a client would receive,
carrying the status, the body and any headers the rule named.

## Rules run in priority order

Rules are evaluated by ascending `Priority`, regardless of their order in the input list. The first
matching rule with an `Allow` or `Block` action decides the request.

A `Count` action records the match and continues to the next rule. Tests can inspect
`countedRuleNames` before changing a rule to `Allow` or `Block`.

```typescript sim-wafv2-count
/**
 * Staging a rule in count mode before turning it on.
 */

import { CreateWebACLCommand } from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";

const waf = new SimAws().wafV2();

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "api",
};

const created = await waf.createWebAcl(
  new CreateWebACLCommand({
    Name: "api-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: visibility,
    Rules: [
      {
        Name: "watch-uploads",
        Priority: 0,
        Action: { Count: {} },
        Statement: {
          SizeConstraintStatement: {
            FieldToMatch: { Body: { OversizeHandling: "CONTINUE" } },
            ComparisonOperator: "GT",
            Size: 1024,
            TextTransformations: [{ Priority: 0, Type: "NONE" }],
          },
        },
        VisibilityConfig: visibility,
      },
    ],
  }),
);

const decision = waf.evaluateRequest({
  webAclArn: created.Summary!.ARN,
  request: new Request("https://example.test/upload", { method: "POST" }),
  body: new TextEncoder().encode("x".repeat(2048)),
});

// "ALLOW" [ 'watch-uploads' ]
console.log(decision.action, decision.countedRuleNames);
```

The body is passed in already read. A request body is a stream that cannot be consumed twice, and
whatever serves the request has usually read it by the time WAF gets a look.

## What a statement can inspect

A statement selects part of the request, applies its text transformations, and then tests the
result.

The parts a statement can be pointed at are `UriPath`, `QueryString`, `SingleQueryArgument`,
`AllQueryArguments`, `SingleHeader`, `Headers`, `Cookies`, `Method` and `Body`. `Headers` and
`Cookies` take a `MatchPattern` selecting which of them to read and a `MatchScope` of `KEY`, `VALUE`
or `ALL`.

The transformations are `NONE`, `LOWERCASE`, `URL_DECODE`, `COMPRESS_WHITE_SPACE` and
`HTML_ENTITY_DECODE`. They run in ascending `Priority`, so lowercasing after decoding is a different
rule from decoding after lowercasing.

The tests are `ByteMatchStatement` (with `EXACTLY`, `STARTS_WITH`, `ENDS_WITH`, `CONTAINS` and
`CONTAINS_WORD`), `RegexMatchStatement`, `RegexPatternSetReferenceStatement` and
`SizeConstraintStatement`. `AndStatement`, `OrStatement` and `NotStatement` join and negate them,
and they nest.

An `AndStatement` or an `OrStatement` needs at least two statements to join. Real WAF answers a web
ACL holding one that joins fewer with `OR_STATEMENT` and a minimum threshold, refusing the whole
resource, and `CreateWebACL` here refuses it too.

Matching is case sensitive, as it is on AWS. A rule that means to ignore case says so with a
`LOWERCASE` transformation and a lower case search string.

WAF stops reading a body, a header set or a cookie set at 8 KB. The rule's `OversizeHandling` says
what content past that point counts as. `MATCH` and `NO_MATCH` settle the statement without looking,
and `CONTINUE` inspects as much as WAF would have read.

## Rate limiting

`RateBasedStatement` counts the requests one client makes and applies the rule's action once the
count goes past `Limit`. A test sends requests until the rule trips, then moves the simulated clock
past the window to watch it let go again.

```typescript sim-wafv2-rate-limit
/**
 * Limiting how often one client may ask to create an account.
 */

import { CreateWebACLCommand } from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const waf = simAws.wafV2();

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "pool",
};

const created = await waf.createWebAcl(
  new CreateWebACLCommand({
    Name: "pool-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: visibility,
    Rules: [
      {
        Name: "sign-up-rate",
        Priority: 0,
        Action: { Block: {} },
        Statement: {
          RateBasedStatement: {
            Limit: 10,
            EvaluationWindowSec: 300,
            AggregateKeyType: "IP",
            ScopeDownStatement: {
              ByteMatchStatement: {
                FieldToMatch: { UriPath: {} },
                PositionalConstraint: "STARTS_WITH",
                SearchString: Buffer.from("/signup"),
                TextTransformations: [{ Priority: 0, Type: "LOWERCASE" }],
              },
            },
          },
        },
        VisibilityConfig: { ...visibility, MetricName: "sign-up-rate" },
      },
    ],
  }),
);

const webAclArn = created.Summary!.ARN;

const signUp = (): string =>
  waf.evaluateRequest({
    webAclArn,
    request: new Request("https://pool.example.test/signup"),
  }).action;

const decisions = Array.from({ length: 11 }, signUp);

// "ALLOW" "BLOCK"
console.log(decisions[9], decisions[10]);

const login = waf.evaluateRequest({
  webAclArn,
  request: new Request("https://pool.example.test/login"),
});

// "ALLOW"
console.log(login.action);

await simAws.clock().advanceBy({ minutes: 6 });

// "ALLOW"
console.log(signUp());
```

`Limit` is how many requests one aggregation instance may make inside the window. AWS holds it
between 10 and 2,000,000,000. The request that takes the count past the limit gets the rule's
action, and the ones under it carry on to the next rule. A `Count` action records the match and
lets evaluation continue, the way it does for every other statement kind.

`EvaluationWindowSec` is 60, 120, 300 or 600 seconds. A statement naming none counts over 300. The
window is measured against [simulated time](https://yulinsim.dev/time/), so `advanceBy` past it drops
what the rule counted.

`AggregateKeyType` is `IP` or `CONSTANT`. `IP` counts each client address on its own. Every request
in this simulation reports `127.0.0.1`, leaving a web ACL with one client for the whole simulation.
That is the case a rate limiting test is written about anyway (one client, sending until the rule
trips), and it behaves here as it does on AWS. `CONSTANT` counts every request the statement sees
together, and AWS requires a `ScopeDownStatement` alongside it to say which requests those are.

A `ScopeDownStatement` narrows what the rule counts. Every statement kind in
[What a statement can inspect](#what-a-statement-can-inspect) nests inside one. A request the
scope-down statement leaves alone is neither counted nor limited. That is what keeps a limit on
`/signup` off the rest of a site.

The counts belong to the rule. Writing a new set of rules over a web ACL with `UpdateWebACL` starts
them from nothing, as it does on AWS.

A rate limit is the whole of a rule's statement, as it is on real WAFv2. A rule naming another
statement kind beside it, and a rate limit nested inside an `AndStatement` or a `NotStatement`, are
both refused where the rule is written.

## The AWS managed rule groups

Three of the AWS managed rule groups are simulated, so a stack that turns them on deploys and its
traffic can be tested against them.

- `AWSManagedRulesCommonRuleSet`, the core rule set, 22 rules.
- `AWSManagedRulesKnownBadInputsRuleSet`, 11 rules.
- `AWSManagedRulesAdminProtectionRuleSet`, one rule.

A group evaluates its rules in the order AWS documents them, adds the documented
`awswaf:managed:aws:*` label to a request a rule claims, and blocks by that rule's action. The
labels are on the decision, and they are what says which rule inside a group claimed the request.

```typescript sim-wafv2-managed-rule-group
/**
 * Running the AWS core rule set over an application's own traffic.
 */

import { CreateWebACLCommand } from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";

const waf = new SimAws().wafV2();

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "api",
};

const created = await waf.createWebAcl(
  new CreateWebACLCommand({
    Name: "api-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: visibility,
    Rules: [
      {
        Name: "core-rule-set",
        Priority: 0,
        OverrideAction: { None: {} },
        Statement: {
          ManagedRuleGroupStatement: {
            VendorName: "AWS",
            Name: "AWSManagedRulesCommonRuleSet",
            RuleActionOverrides: [
              { Name: "NoUserAgent_HEADER", ActionToUse: { Count: {} } },
            ],
          },
        },
        VisibilityConfig: visibility,
      },
    ],
  }),
);

const webAclArn = created.Summary!.ARN;

const healthCheck = waf.evaluateRequest({
  webAclArn,
  request: new Request("https://example.test/health"),
});
const traversal = waf.evaluateRequest({
  webAclArn,
  request: new Request(
    "https://example.test/read?file=..%2F..%2Fetc%2Fpasswd",
    {
      headers: { "user-agent": "curl/8.5.0" },
    },
  ),
});

// "ALLOW" ["awswaf:managed:aws:core-rule-set:NoUserAgent_Header"]
console.log(healthCheck.action, healthCheck.labels);

// "BLOCK" "core-rule-set"
console.log(traversal.action, traversal.terminatingRuleName);
```

The health check sends no User-Agent header, which `NoUserAgent_HEADER` claims. The override sets
that rule to `Count`, so the request goes through carrying the label.

`RuleActionOverrides`, `ScopeDownStatement` and `OverrideAction` behave as AWS documents them. An
`OverrideAction` of `Count` holds the whole group to counting whatever its rules were set to. A
`ScopeDownStatement` decides which requests the group sees at all, and a request it does not claim
picks up no label from the group.

`DescribeManagedRuleGroup` reports the rules of a group and the labels they add. An override names a
rule in the spelling that reports.

## How closely the managed rules match

AWS publishes every rule name, every default action, every label and the size limits. It holds back
the pattern set behind each rule, and says so. Each rule here declares how closely it follows the
AWS rule it stands for, and `managedRules().rules()` reports the tier of every one.

- **exact** matches where the AWS rule matches. The four `SizeRestrictions_*` rules at their
  documented limits (2,048 bytes for the query string, 10,240 for the cookie header, 8,192 for the
  body and 1,024 for the URI path), along with `NoUserAgent_HEADER`, `PROPFIND_METHOD` and
  `Host_localhost_HEADER`.
- **documented** matches the patterns AWS published and nothing beyond them. `Log4JRCE_*`,
  `EC2MetaDataSSRF_*`, `GenericLFI_*`, `GenericRFI_*`, `RestrictedExtensions_*`,
  `ExploitablePaths_URIPATH`, `AdminProtection_URIPATH`, `JavaDeserializationRCE_*` and
  `UserAgent_BadBots_HEADER`.
- **declared** detects nothing at all. The four `CrossSiteScripting_*` rules run AWS's own
  detection, and AWS documents none of it.

The tiers under-detect against AWS and never over-detect. The usual reason to put WAF in a test is
to find out whether an application's own traffic still gets through with the core rule set on. A
rule that blocked more than AWS blocks would fail that test for a request AWS allows, and send
somebody off to work around a rule that does not exist. A rule that blocks less is invisible to that
test and right on AWS too.

`AdminProtection_URIPATH` is the one to know about. AWS gives `sqlmanager` as its example pattern
and nothing else, so an application's own `/admin` paths reach it here. On AWS they may not.

The reverse test, asserting that an attack payload is blocked, is covered by declaring the match.
`onRequest` says which rules claim a request to one path, matched exactly.

```typescript sim-wafv2-managed-declared-match
/**
 * Declaring the cross-site scripting match AWS does not document.
 */

import { SimAws } from "@kensio/yulin";

const waf = new SimAws().wafV2();

waf.managedRules().onRequest("/search", {
  matches: ["CrossSiteScripting_QUERYARGUMENTS"],
});

// "declared"
console.log(waf.managedRules().tierOf("CrossSiteScripting_QUERYARGUMENTS"));

// "exact"
console.log(waf.managedRules().tierOf("SizeRestrictions_BODY"));
```

A request to `/search` is then claimed by that rule, which labels it, blocks it and takes any
override written for it, as a rule that detected the payload itself would.

A match names the rule, in the spelling `RuleActionOverrides` and `DescribeManagedRuleGroup` use
(`CrossSiteScripting_QUERYARGUMENTS`), and not the label the rule adds
(`CrossSiteScripting_QueryArguments`). A name no simulated group holds is refused where it was
written.

Anything outside the three groups is refused by name, and the refusal says which are simulated. The
IP reputation and anonymous IP groups decide by caller address, and every request in this simulation
comes from one client. Bot Control and the account takeover groups decide by behaviour across
requests. The SQL injection group is undocumented in the way the cross-site scripting rules are.

## Labels

A rule adds its labels to a request when it matches, and the rules that run after it can match on
them with a `LabelMatchStatement`. A `LABEL` scope matches one fully qualified label and a
`NAMESPACE` scope matches every label under a prefix.

This is how a managed rule group is tuned. Run the group in count mode, and block on the label of
the rule that matters.

```typescript sim-wafv2-label-match
/**
 * Blocking on a label the core rule set left behind.
 */

import { CreateWebACLCommand } from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";

const waf = new SimAws().wafV2();

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "api",
};

const created = await waf.createWebAcl(
  new CreateWebACLCommand({
    Name: "api-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: visibility,
    Rules: [
      {
        Name: "core-rule-set",
        Priority: 0,
        OverrideAction: { Count: {} },
        Statement: {
          ManagedRuleGroupStatement: {
            VendorName: "AWS",
            Name: "AWSManagedRulesCommonRuleSet",
          },
        },
        VisibilityConfig: visibility,
      },
      {
        Name: "block-restricted-files",
        Priority: 1,
        Action: { Block: {} },
        Statement: {
          LabelMatchStatement: {
            Scope: "LABEL",
            Key: "awswaf:managed:aws:core-rule-set:RestrictedExtensions_URIPath",
          },
        },
        VisibilityConfig: visibility,
      },
    ],
  }),
);

const decision = waf.evaluateRequest({
  webAclArn: created.Summary!.ARN,
  request: new Request("https://example.test/app.ini", {
    headers: { "user-agent": "curl/8.5.0" },
  }),
});

// "BLOCK" "block-restricted-files"
console.log(decision.action, decision.terminatingRuleName);
```

A rule of the web ACL's own adds a label under the name it gave it, with no prefix. A label from a
managed rule group is qualified by the group it came from. That is the
`awswaf:managed:aws:core-rule-set:` on the front of the key above.

## Answering a blocked request

A `Block` action answers 403 with WAF's own body, and so does a request a protected REST API stage
blocked. Real API Gateway writes `{"message":"Forbidden"}` there. A `CustomResponse` overrides the
status and the
body, taking the body from the web ACL's `CustomResponseBodies` by key. It carries a `ResponseCode`
of its own, from 200 to 599, and any response headers it names reach the client under the names it
gave them.

The `x-amzn-waf-` prefix belongs to the other direction. WAF puts it on the headers an `Allow` or
`Count` action inserts into the request it forwards, which is what tells a rule's header apart from
one the client sent.

```typescript sim-wafv2-custom-response
/**
 * Answering a blocked request with a body the web ACL holds.
 */

import { CreateWebACLCommand } from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";
import { simWafBlockedHttpResponse } from "@kensio/yulin/wafv2";

const waf = new SimAws().wafV2();

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "api",
};

const created = await waf.createWebAcl(
  new CreateWebACLCommand({
    Name: "api-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: visibility,
    CustomResponseBodies: {
      "not-here": {
        ContentType: "APPLICATION_JSON",
        Content: '{"message":"Not found"}',
      },
    },
    Rules: [
      {
        Name: "hide-admin",
        Priority: 0,
        Action: {
          Block: {
            CustomResponse: {
              ResponseCode: 404,
              CustomResponseBodyKey: "not-here",
              ResponseHeaders: [{ Name: "rule", Value: "hide-admin" }],
            },
          },
        },
        Statement: {
          ByteMatchStatement: {
            FieldToMatch: { UriPath: {} },
            PositionalConstraint: "STARTS_WITH",
            SearchString: Buffer.from("/admin"),
            TextTransformations: [{ Priority: 0, Type: "NONE" }],
          },
        },
        VisibilityConfig: visibility,
      },
    ],
  }),
);

const decision = waf.evaluateRequest({
  webAclArn: created.Summary!.ARN,
  request: new Request("https://example.test/admin"),
});
const response = simWafBlockedHttpResponse(decision.blocked!);

// 404 "hide-admin" '{"message":"Not found"}'
console.log(
  response.status,
  response.headers.get("rule"),
  await response.text(),
);
```

The default body is Yulin's own. Real WAF hands the blocking off to whatever the web ACL is in front
of, and each of those writes its own page. The status is 403 either way.

## Protecting an API Gateway REST API stage

`AssociateWebACL` puts a `REGIONAL` web ACL in front of a simulated REST API stage, named by the
stage's ARN. `SimRestApi.stageArn` builds that ARN, of the form
`arn:aws:apigateway:<region>::/restapis/<api-id>/stages/<stage-name>`.

The stage then puts every request through the web ACL before it matches the method and before any
authorizer runs. That is the order real API Gateway evaluates in, ahead of resource policies, IAM,
Lambda authorizers and Cognito authorizers alike. A blocked request gets 403 with WAF's body, and
neither the authorizer nor the integration behind the method sees it. An allowed request carries on,
with the headers an `Allow` rule inserted added to what the integration receives.

```typescript sim-wafv2-api-gateway-stage
/**
 * Blocking a request to a REST API stage with a web ACL in front of it.
 */

import {
  AssociateWebACLCommand,
  CreateWebACLCommand,
} from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";
import { simRestApiLambdaProxyFactory } from "@kensio/yulin/apigateway";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const waf = simAws.wafV2();

const restApi = await simRestApiLambdaProxyFactory.make(
  { handler: () => ({ statusCode: 200, body: "orders" }) },
  simAws,
);

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "api",
};

const created = await waf.createWebAcl(
  new CreateWebACLCommand({
    Name: "api-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: visibility,
    Rules: [
      {
        Name: "block-admin",
        Priority: 0,
        Action: { Block: {} },
        Statement: {
          ByteMatchStatement: {
            FieldToMatch: { UriPath: {} },
            PositionalConstraint: "CONTAINS",
            SearchString: Buffer.from("/admin"),
            TextTransformations: [{ Priority: 0, Type: "NONE" }],
          },
        },
        VisibilityConfig: { ...visibility, MetricName: "block-admin" },
      },
    ],
  }),
);

await waf.associateWebAcl(
  new AssociateWebACLCommand({
    WebACLArn: created.Summary?.ARN,
    ResourceArn: restApi.stageArn("prod"),
  }),
);

const srv = await serveSimAws({ simAws });

const blocked = await fetch(
  srv.localUrl(`${restApi.invokeUrl("prod")}/admin/users`),
);
const allowed = await fetch(
  srv.localUrl(`${restApi.invokeUrl("prod")}/orders`),
);

console.log(blocked.status, allowed.status);
// 403 200

await srv.close();
```

`DisassociateWebACL` takes the web ACL back off. `GetWebACLForResource` reports the web ACL one
stage carries, and `ListResourcesForWebACL` reports the stages one web ACL protects. That listing
takes a `ResourceType` of `API_GATEWAY`. Real WAFv2 lists `APPLICATION_LOAD_BALANCER` for a request
that names no type. Load balancers are outside this simulation, and a listing that names no type is
refused.

Deleting the stage or the whole API takes the association with it. A stage deployed again under the
same name carries no web ACL. A web ACL that is still in front of a stage cannot be deleted, and
`DeleteWebACL` names the stages still pointing at it.

The web ACL and the stage belong to one Account and Region. A `CLOUDFRONT` scope web ACL is refused,
because a distribution takes its web ACL from the distribution and not from `AssociateWebACL`. A web
ACL from another Region or another Account is refused, as it is on AWS.

An API Gateway HTTP API stage is refused. AWS WAF has no resource type for one, and an association
accepted here would let a test cover protection AWS never applies. Application Load Balancer,
AppSync, App Runner, Amplify and Verified Access resources are refused as unsimulated, each naming
what it would have protected.

## Protecting a Cognito user pool

`AssociateWebACL` puts a `REGIONAL` web ACL in front of a simulated user pool, named by the pool's
ARN. That ARN takes the form `arn:aws:cognito-idp:<region>:<account>:userpool/<pool-id>`, and
`SimCognitoIdentityProvider.userPool(id).arn.value` is where to read it from.

The pool's endpoints then go through the web ACL before the one a request named runs. Those are the
hosted domain (the authorize and token endpoints, `/logout`, and the managed login pages at
`/signup`, `/confirm`, `/forgotPassword` and `/confirmForgotPassword`) and the two documents the
pool publishes at `/<pool-id>/.well-known/jwks.json` and
`/<pool-id>/.well-known/openid-configuration`. The `/<pool-id>/messages` listing is Yulin's own and
sits outside the web ACL, as [below](#the-request-body-is-withheld-at-a-hosted-domain) says. A
blocked request gets 403 with WAF's body, whatever method it used. A blocked sign-up creates no user
and records no message.

The pages are usually the point. `/signup`, `/confirm` and `/forgotPassword` are the ones that
create an account or send an email, and a real web ACL on a user pool is usually written for them.

```typescript sim-wafv2-cognito-user-pool
/**
 * Blocking a request to a pool's hosted domain with a web ACL in front of it.
 */

import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  CreateUserPoolDomainCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  AssociateWebACLCommand,
  CreateWebACLCommand,
} from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
const cognito = simAws.cognitoIdentityProvider();
const waf = simAws.wafV2();

const created = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const userPoolId = created.UserPool!.Id!;

await cognito.createUserPoolDomain(
  new CreateUserPoolDomainCommand({
    UserPoolId: userPoolId,
    Domain: "myapp-login",
  }),
);

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    AllowedOAuthFlowsUserPoolClient: true,
    AllowedOAuthFlows: ["code"],
    AllowedOAuthScopes: ["openid"],
    CallbackURLs: ["https://www.example.com/user/callback"],
    SupportedIdentityProviders: ["COGNITO"],
  }),
);

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "pool",
};

const webAcl = await waf.createWebAcl(
  new CreateWebACLCommand({
    Name: "pool-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: visibility,
    Rules: [
      {
        Name: "block-scraper",
        Priority: 0,
        Action: { Block: {} },
        Statement: {
          ByteMatchStatement: {
            FieldToMatch: { SingleHeader: { Name: "user-agent" } },
            PositionalConstraint: "CONTAINS",
            SearchString: Buffer.from("scraper"),
            TextTransformations: [{ Priority: 0, Type: "NONE" }],
          },
        },
        VisibilityConfig: { ...visibility, MetricName: "block-scraper" },
      },
    ],
  }),
);

await waf.associateWebAcl(
  new AssociateWebACLCommand({
    WebACLArn: webAcl.Summary?.ARN,
    ResourceArn: cognito.userPool(userPoolId).arn.value,
  }),
);

const srv = await serveSimAws({ simAws });
const parameters = new URLSearchParams({
  response_type: "code",
  client_id: appClient.UserPoolClient!.ClientId!,
  redirect_uri: "https://www.example.com/user/callback",
  scope: "openid",
});
const signInUrl = srv.localUrl(
  `https://myapp-login.auth.eu-west-2.amazoncognito.com/oauth2/authorize?${parameters.toString()}`,
);

const blocked = await fetch(signInUrl, {
  headers: { "user-agent": "scraper/1.0" },
});
const allowed = await fetch(signInUrl);

console.log(blocked.status, allowed.status);
// 403 200

await srv.close();
```

`DisassociateWebACL` takes the web ACL back off. `GetWebACLForResource` reports the web ACL one pool
carries, and `ListResourcesForWebACL` reports the pools one web ACL protects under a `ResourceType`
of `COGNITO_USER_POOL`. Deleting the pool takes the association with it, and a web ACL still in
front of a pool cannot be deleted.

The web ACL and the pool belong to one Account and Region. A `CLOUDFRONT` scope web ACL is refused,
because a distribution takes its web ACL from the distribution. A pool in another Account or another
Region is refused as well.

AWS also refuses a web ACL carrying `AWSManagedRulesATPRuleSet`, and it refuses the whole web ACL
over the one rule group. Yulin turns that group away earlier, at `CreateWebACL`, along with every
managed rule group outside the [three that are simulated](#the-aws-managed-rule-groups).

### The request body is withheld at a hosted domain

Cognito sends AWS WAF the headers and the path of a managed login request and none of its body. A
`ByteMatchStatement`, `RegexMatchStatement` or `SizeConstraintStatement` on `Body` therefore
inspects an empty field at a hosted domain, however well formed the rule is. Keying a rule on a
username or a password is out for the same reason. Yulin withholds the body the same way. A rule
written against it fails here as it fails on AWS.

Real WAF does read the body of a user pool API request such as `SignUp` or `InitiateAuth`. Those
reach Yulin as SDK Commands and carry no HTTP request for a rule to read. No web ACL is evaluated
for them at all. A test covering an API operation should reach for
[`evaluateRequest`](#deciding-what-happens-to-a-request) with a request of its own.

Two paths are outside what the web ACL sees. `/<pool-id>/messages` is Yulin's own listing of the
messages a pool would have sent, and real Cognito has no such endpoint. Managed login branding and
its assets are outside the simulation.

## Protecting a CloudFront distribution

A simulated CloudFront distribution names its web ACL in `WebACLId` on its `DistributionConfig`,
and evaluates it against every request that reaches the distribution. A blocked request gets 403
before a cache behaviour, a viewer-request CloudFront Function or the origin sees it.

CloudFront is associated this way and not through `AssociateWebACL`, which real WAF keeps for the
regional resource types. The ARN has to name a `CLOUDFRONT` [scope](#scopes) web ACL. See
[web ACLs in the CloudFront docs](https://yulinsim.dev/services/cloudfront/#web-acls) for the whole example.

CloudFront has no association Resource, so in a template the reference is a property of the
distribution itself. A `WebACLId` naming a web ACL from outside this simulation is left out and
recorded on `stack.ignoredProperties`, and the distribution deploys and serves every request. The
alternative would take a whole site down over a firewall, which is a worse answer than serving the
site unprotected and saying so.

## Regex pattern sets

A rule can point at a regex pattern set by ARN, and matches when any expression in the set matches.
The set is resolved when the rule is written. An ARN naming nothing is refused by `CreateWebACL`
the way real WAF refuses it.

```typescript sim-wafv2-regex-pattern-set
/**
 * Blocking a set of user agents held in a regex pattern set.
 */

import {
  CreateRegexPatternSetCommand,
  CreateWebACLCommand,
} from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";

const waf = new SimAws().wafV2();

const patternSet = await waf.createRegexPatternSet(
  new CreateRegexPatternSetCommand({
    Name: "scanners",
    Scope: "REGIONAL",
    RegularExpressionList: [
      { RegexString: "sqlmap" },
      { RegexString: "nikto" },
    ],
  }),
);

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "api",
};

const created = await waf.createWebAcl(
  new CreateWebACLCommand({
    Name: "api-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: visibility,
    Rules: [
      {
        Name: "block-scanners",
        Priority: 0,
        Action: { Block: {} },
        Statement: {
          RegexPatternSetReferenceStatement: {
            ARN: patternSet.Summary!.ARN,
            FieldToMatch: { SingleHeader: { Name: "user-agent" } },
            TextTransformations: [{ Priority: 0, Type: "LOWERCASE" }],
          },
        },
        VisibilityConfig: visibility,
      },
    ],
  }),
);

const decision = waf.evaluateRequest({
  webAclArn: created.Summary!.ARN,
  request: new Request("https://example.test/", {
    headers: { "user-agent": "sqlmap/1.7" },
  }),
});

// "BLOCK"
console.log(decision.action);
```

An update to a pattern set reaches the rules pointing at it. A reference resolves to the set when
the rule is written and reads its expressions when a request arrives, as it does on AWS.

IP sets are created, read, updated, listed and deleted the same way. No rule reads one, for the
reason in [Refusals](#refusals) below.

## Deploying web ACLs with CloudFormation

`AWS::WAFv2::WebACL`, `AWS::WAFv2::WebACLAssociation`, `AWS::WAFv2::IPSet` and
`AWS::WAFv2::RegexPatternSet` deploy into simulated WAFv2. CDK ships no L2 construct for WAFv2. A
project protecting an API writes `CfnWebACL` and `CfnWebACLAssociation` by hand, and the template
those synthesize to is the one that deploys here.

```typescript sim-wafv2-cloudformation
/**
 * Deploying a web ACL from a CloudFormation template.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "orders",
};

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders",
  template: {
    Resources: {
      OrdersAcl: {
        Type: "AWS::WAFv2::WebACL",
        Properties: {
          Name: "orders-acl",
          Scope: "REGIONAL",
          DefaultAction: { Allow: {} },
          VisibilityConfig: visibility,
          Rules: [
            {
              Name: "block-admin",
              Priority: 0,
              Action: { Block: {} },
              Statement: {
                ByteMatchStatement: {
                  FieldToMatch: { UriPath: {} },
                  PositionalConstraint: "CONTAINS",
                  SearchString: "/admin",
                  TextTransformations: [{ Priority: 0, Type: "NONE" }],
                },
              },
              VisibilityConfig: { ...visibility, MetricName: "block-admin" },
            },
          ],
        },
      },
    },
    Outputs: { AclArn: { Value: { "Fn::GetAtt": ["OrdersAcl", "Arn"] } } },
  },
});

const decision = simAws.wafV2().evaluateRequest({
  webAclArn: stack.outputs.get("AclArn")!.value as string,
  request: new Request("https://orders.example.test/admin/users"),
});

// "BLOCK"
console.log(decision.action);
```

A template spells a web ACL the way the API spells it, with two exceptions. A `SearchString` is
plain text in a template where the SDK takes bytes, and a `RegularExpressionList` is a list of
strings where the SDK takes a list of `RegexString` objects. Both are read here the way
CloudFormation writes them.

Every rule is compiled while the stack deploys. A rule this simulator will not evaluate (see
[Refusals](#refusals)) is left out of the web ACL, and the web ACL deploys with the rules that are
left. The rule that went missing is recorded on `stack.ignoredProperties`, under the logical ID that
declared it, and the reason is the one `CreateWebACL` gives an SDK caller.

```typescript
const [dropped] = stack.ignoredProperties;

// "OrdersAcl Rules.block-countries"
console.log(`${dropped.logicalId} ${dropped.path}`);

// "Rule block-countries uses the statement kind GeoMatchStatement, which
//  Yulin does not simulate: ..."
console.log(dropped.reason);
```

The web ACL is then real, and thinner than the one the template describes. Requests the dropped rule
would have blocked are served by whatever the web ACL is in front of. That is the size of what a
test loses, and `stack.ignoredProperties` is where to read it. An SDK caller writing the same rule
is refused outright, because a request that was answered and then quietly emptied is a worse answer
than a refusal.

The same goes for a web ACL member with no behaviour behind it, such as `CaptchaConfig`. The web ACL
deploys without it and the member is recorded.

A web ACL nothing coherent could be deployed from still fails the stack. A `Scope` outside
`REGIONAL` and `CLOUDFRONT`, a `Rules` written as an object, a `Name` written as a number. The
failure names the logical ID.

`Name` is optional on all three named types. An unnamed resource is named after the stack, the
logical ID and a tail derived from both, as real CloudFormation names one. The web ACL above sets a
`Name` and keeps `orders-acl`. With that property left out it would have deployed as
`orders-OrdersAcl-5615bd3c857f`, and [the CloudFormation docs](https://yulinsim.dev/services/cloudformation/#names-cloudformation-generates "Names CloudFormation generates")
cover where the tail comes from.

### Putting a deployed web ACL in front of something

`AWS::WAFv2::WebACLAssociation` associates a web ACL with whatever its `ResourceArn` names, which
covers an API Gateway REST API stage and a Cognito user pool. It goes through `AssociateWebACL` and
inherits that command's answers. An ARN naming an HTTP API stage fails the deployment, because AWS
WAF protects no HTTP API and neither does real CloudFormation. An ARN naming a load balancer or an
AppSync API skips the association. AWS WAF protects both, and Yulin simulates a web ACL in front of
neither.

An association naming a web ACL from outside this simulation is skipped too, which covers a template
naming one from a real account and one whose web ACL is in another Region. The stage or the pool
deploys and serves, unprotected, and the association is the only Resource that goes missing.
`skippedReason` names the ARN.

```json
{
  "OrdersAclAssociation": {
    "Type": "AWS::WAFv2::WebACLAssociation",
    "Properties": {
      "ResourceArn": {
        "Fn::Join": [
          "",
          [
            "arn:aws:apigateway:",
            { "Ref": "AWS::Region" },
            "::/restapis/",
            { "Ref": "Api" },
            "/stages/",
            { "Ref": "Stage" }
          ]
        ]
      },
      "WebACLArn": { "Fn::GetAtt": ["OrdersAcl", "Arn"] }
    }
  }
}
```

That `Fn::Join` is what CDK's `api.deploymentStage.stageArn` synthesizes to. Deleting the
association disassociates, and deleting the stack takes the association down before the web ACL it
names.

A CloudFront distribution is associated through the distribution. `WebACLId` on
`AWS::CloudFront::Distribution` holds a `CLOUDFRONT` [scope](#scopes) web ACL's ARN, usually as an
`Fn::GetAtt` on a `CfnWebACL` in the same template. See
[Protecting a CloudFront distribution](#protecting-a-cloudfront-distribution).

### Attributes and Ref

`Fn::GetAtt` on a web ACL answers `Arn`, `Id`, `Capacity` and `LabelNamespace`. `Arn` is the one a
template usually wants, since an association and a distribution both name a web ACL by ARN. The two
sets answer `Arn` and `Id`.

`Capacity` adds up what AWS publishes for each rule. A byte match costs 2 or 10 depending on the
match it makes, a regex match 3, a pattern set reference 25, a size constraint 1 and a label match
1, with 10 more for reading every query argument and 10 for each text transformation other than
`NONE`. A managed rule group costs the fixed capacity its owner gave it.

The sum is an upper bound on the number AWS reports. Real WAF charges a web ACL the sum of its rules
minus whatever work it can share between them, and publishes no description of when it shares any.
Nothing here enforces the 5,000 unit maximum on a web ACL or the 1,500 units the base price covers.
`GetWebACL` reports the same number.

`Ref` answers the physical ID, which WAFv2 spells in three parts (`orders-acl|<id>|REGIONAL`). It
reads oddly beside every other service, and it is what AWS answers. WAFv2 resources carry a
composite primary identifier of name, ID and scope. An association's physical ID is the resource ARN
and the web ACL ARN joined by a pipe, and it publishes no attributes.

`AWS::WAFv2::RuleGroup` and `AWS::WAFv2::LoggingConfiguration` are recorded as unsupported and
stepped over. A rule naming a rule group is refused anyway, and there is no log here to write to.

## Scopes

A web ACL is created in `CLOUDFRONT` or `REGIONAL` scope. The two are separate namespaces, and one
name can be taken in both.

`CLOUDFRONT` scope resources live in `us-east-1`, because CloudFront is global. A `CLOUDFRONT`
request made anywhere else is refused, as real WAFv2 refuses it.

```typescript sim-wafv2-cloudfront-scope
/**
 * Creating a web ACL for a CloudFront distribution.
 */

import { CreateWebACLCommand } from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const waf = simAws
  .accountRegionScope(simAws.defaultAccountId, "us-east-1")
  .wafV2();

const created = await waf.createWebAcl(
  new CreateWebACLCommand({
    Name: "site-acl",
    Scope: "CLOUDFRONT",
    DefaultAction: { Allow: {} },
    VisibilityConfig: {
      SampledRequestsEnabled: false,
      CloudWatchMetricsEnabled: false,
      MetricName: "site",
    },
  }),
);

// arn:aws:wafv2:us-east-1:...:global/webacl/site-acl/...
console.log(created.Summary?.ARN);
```

## Lock tokens

Every WAFv2 resource carries a lock token that changes on each write. The updates and the deletes
take the token from the last read, and a write made against a stale one is refused with
`WAFOptimisticLockException`.

`CreateWebACL` reports the first token in its summary, and `GetWebACL` reports the current one.
`UpdateWebACL` answers with `NextLockToken` for the write after it.

## Descriptions

A web ACL, an IP set and a regex pattern set each take an optional `Description`. WAFv2 holds it to
between 1 and 256 characters, and to a pattern of word characters, spaces and `+=:#@/-,.` with
neither end a space. The shortest description it matches is three characters long.

Both checks run on `CreateWebACL`, `UpdateWebACL`, `CreateIPSet`, `UpdateIPSet`,
`CreateRegexPatternSet` and `UpdateRegexPatternSet`. A description outside either one is refused
with `ValidationException`, naming every constraint it failed the way AWS names them. A write that
leaves `Description` out is taken, and the resource keeps no description.

The empty string is the case worth knowing about. Code that reads a web ACL, replaces the rules and
writes every other field back hands the description straight through, because `UpdateWebACL` clears
whatever a write leaves out. AWS answers `Description: ""` for some web ACLs nobody has described,
and refuses the write that gives it back:

```text
ValidationException: 2 validation errors detected:
Value '' at 'description' failed to satisfy constraint: Member must have length greater than or equal to 1;
Value '' at 'description' failed to satisfy constraint: Member must satisfy regular expression pattern: ^[\w+=:#@/\-,\.][\w+=:#@/\-,\.\s]+[\w+=:#@/\-,\.]$
```

Yulin leaves the field undefined for a web ACL nobody has described, and that difference stands. It
is observed from one ACL and AWS documents nothing about it.

## Permissions

Every command goes through simulated IAM. An operation on one resource authorizes against that
resource's ARN. The id in the ARN is generated. A policy that names a resource therefore ends in a
wildcard where the id goes.

`ListWebACLs`, `ListIPSets` and `ListRegexPatternSets` have no resource type on real WAFv2. They
authorize against `*`, and a policy scoped to web ACL ARNs allows none of them, however broadly
those ARNs are written.

```typescript sim-wafv2-permissions
/**
 * Reading a web ACL as a Role, with a policy naming it.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateWebACLCommand, GetWebACLCommand } from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "111111111111" });
const roleArn = "arn:aws:iam::111111111111:role/FirewallReaderRole";

await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "FirewallReaderRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "FirewallReaderRole",
    PolicyName: "ReadApiAcl",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "wafv2:GetWebACL",
          Resource:
            "arn:aws:wafv2:us-east-1:111111111111:regional/webacl/api-acl/*",
        },
      ],
    }),
  }),
);

const waf = simAws.wafV2();
const created = await waf.createWebAcl(
  new CreateWebACLCommand({
    Name: "api-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: {
      SampledRequestsEnabled: false,
      CloudWatchMetricsEnabled: false,
      MetricName: "api",
    },
  }),
);

const read = await waf.getWebAcl(
  new GetWebACLCommand({
    Name: "api-acl",
    Scope: "REGIONAL",
    Id: created.Summary?.Id,
  }),
  { caller: { kind: "arn", arn: roleArn } },
);

// "api-acl"
console.log(read.WebACL?.Name);
```

## SDK interception

An intercepted `WAFV2Client` routes to the simulated WAFv2 in the Account and Region the client was
configured for. See [the SDK docs](https://yulinsim.dev/sdk/) for how interception works.

```typescript sim-wafv2-sdk-interception
/**
 * Routing an intercepted WAFv2 SDK client to the simulator.
 */

import { CreateWebACLCommand, WAFV2Client } from "@aws-sdk/client-wafv2";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();

simSdk.intercept(WAFV2Client);

const client = new WAFV2Client({ region: "eu-west-2" });

await client.send(
  new CreateWebACLCommand({
    Name: "api-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: {
      SampledRequestsEnabled: false,
      CloudWatchMetricsEnabled: false,
      MetricName: "api",
    },
  }),
);

const scoped = simSdk.simAws.accountRegionScope(
  simSdk.simAws.defaultAccountId,
  "eu-west-2",
);

// "api-acl"
console.log(scoped.wafV2().allWebAcls("REGIONAL")[0]?.name);
```

## Refusals

A rule Yulin cannot evaluate is refused by `CreateWebACL` and `UpdateWebACL`, naming the rule and
what in it was refused. A web ACL that accepted such a rule would allow a request AWS blocks, and a
silent hole in a security layer is worse than a missing one.

A template carrying one of these keeps the caution and drops the blast radius. The rule is left out,
the web ACL deploys with the rest of them, and the omission is recorded. See
[Deploying web ACLs with CloudFormation](#deploying-web-acls-with-cloudformation).

These statement kinds are refused:

- `IPSetReferenceStatement`, `GeoMatchStatement` and `AsnMatchStatement`. Every request in this
  simulation reports a source address of `127.0.0.1`, and a rule on where a request came from would
  see one client for the whole simulation.
- `SqliMatchStatement` and `XssMatchStatement`. AWS publishes no description of the detection they
  run.
- `RuleGroupReferenceStatement`. A rule group of your own is a resource in its own right, and none
  is simulated. The three simulated AWS managed rule groups are named in a statement rather than
  created.

A `RateBasedStatement` is evaluated (see [Rate limiting](#rate-limiting)). Two of its aggregation
key types are refused. `FORWARDED_IP` and `ForwardedIPConfig` read the address from a forwarding
header, which needs the source address variety an IP set is waiting on. `CUSTOM_KEYS` and
`CustomKeys` aggregate on headers, cookies and query arguments, and are feasible and not part of
this yet. `GetRateBasedStatementManagedKeys` is not simulated.

`JsonBody`, `HeaderOrder`, `UriFragment`, `JA3Fingerprint` and `JA4Fingerprint` are refused as
fields to match. The `Captcha` and `Challenge` actions are refused, along with the `CaptchaConfig`,
`ChallengeConfig` and `TokenDomains` that configure them, because a browser has to answer them.

Tags, logging, sampled requests and CloudWatch metrics for a web ACL are not simulated.
`AssociationConfig`, `DataProtectionConfig`, `OnSourceDDoSProtectionConfig` and `ApplicationConfig`
are refused for the same reason, each naming what it would have configured.

## Supported operations

`CreateWebACL`, `GetWebACL`, `UpdateWebACL`, `ListWebACLs`, `DeleteWebACL`, `CreateIPSet`,
`GetIPSet`, `UpdateIPSet`, `ListIPSets`, `DeleteIPSet`, `CreateRegexPatternSet`,
`GetRegexPatternSet`, `UpdateRegexPatternSet`, `ListRegexPatternSets`, `DeleteRegexPatternSet`,
`DescribeManagedRuleGroup`, `AssociateWebACL`, `DisassociateWebACL`, `GetWebACLForResource` and
`ListResourcesForWebACL`.
