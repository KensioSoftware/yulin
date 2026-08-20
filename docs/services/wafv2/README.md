# Simulated WAFv2

Yulin includes a simulated AWS WAFv2 for tests and local development. It holds web ACLs, IP sets and
regex pattern sets, and it evaluates a request against a web ACL's rules to reach a decision. A test
can assert that a request to `/admin` is blocked and one to `/` is allowed, without an AWS account
and without a distribution in front of anything.

Association comes separately. Putting a web ACL in front of a CloudFront distribution, an API
Gateway REST API stage or a Cognito user pool arrives later. Until then a test asks the web ACL
about a request itself.

WAFv2 specific types are imported from the `@kensio/yulin/wafv2` subpath.

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

Rules are evaluated in ascending `Priority` and not in the order the list was written. The first
rule that matches and carries a terminating action (`Allow` or `Block`) decides the request.

A `Count` action records the match and lets the next rule have a look. That is how a rule is staged
before it is turned on, and `countedRuleNames` is what a test asserts against.

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

A statement reads one part of the request, applies the rule's text transformations to it, and tests
what comes out.

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

Matching is case sensitive, as it is on AWS. A rule that means to ignore case says so with a
`LOWERCASE` transformation and a lower case search string.

WAF stops reading a body, a header set or a cookie set at 8 KB. The rule's `OversizeHandling` says
what content past that point counts as. `MATCH` and `NO_MATCH` settle the statement without looking,
and `CONTINUE` inspects as much as WAF would have read.

## Answering a blocked request

A `Block` action answers 403 with WAF's own body. A `CustomResponse` overrides the status and the
body, taking the body from the web ACL's `CustomResponseBodies` by key. Headers a rule names are
prefixed with `x-amzn-waf-`, as WAF prefixes them.

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
  response.headers.get("x-amzn-waf-rule"),
  await response.text(),
);
```

The default body is Yulin's own. Real WAF hands the blocking off to whatever the web ACL is in front
of, and each of those writes its own page. The status is 403 either way.

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

IP sets are created, read, listed and deleted the same way. No rule reads one, for the reason in
[Refusals](#refusals) below.

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

Every WAFv2 resource carries a lock token that changes on each write. `UpdateWebACL` and the deletes
take the token from the last read, and a write made against a stale one is refused with
`WAFOptimisticLockException`.

`CreateWebACL` reports the first token in its summary, and `GetWebACL` reports the current one.
`UpdateWebACL` answers with `NextLockToken` for the write after it.

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
configured for. See [the SDK docs](../../sdk/README.md) for how interception works.

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

These statement kinds are refused:

- `IPSetReferenceStatement`, `GeoMatchStatement` and `AsnMatchStatement`. Every request in this
  simulation reports a source address of `127.0.0.1`, and a rule on where a request came from would
  see one client for the whole simulation.
- `RateBasedStatement`. Counting requests over a time window against the simulated clock is
  feasible and is not part of this yet.
- `SqliMatchStatement` and `XssMatchStatement`. AWS publishes no description of the detection they
  run.
- `ManagedRuleGroupStatement`, `RuleGroupReferenceStatement` and `LabelMatchStatement`. The AWS
  managed rule groups are a body of rules Yulin would have to carry, and labels arrive with them.

`JsonBody`, `HeaderOrder`, `UriFragment`, `JA3Fingerprint` and `JA4Fingerprint` are refused as
fields to match. The `Captcha` and `Challenge` actions are refused, along with the `CaptchaConfig`,
`ChallengeConfig` and `TokenDomains` that configure them, because a browser has to answer them.

Tags, logging, sampled requests and CloudWatch metrics for a web ACL are not simulated.
`AssociationConfig`, `DataProtectionConfig`, `OnSourceDDoSProtectionConfig` and `ApplicationConfig`
are refused for the same reason, each naming what it would have configured.

## Simulated commands

`CreateWebACL`, `GetWebACL`, `UpdateWebACL`, `ListWebACLs`, `DeleteWebACL`, `CreateIPSet`,
`GetIPSet`, `ListIPSets`, `DeleteIPSet`, `CreateRegexPatternSet`, `GetRegexPatternSet`,
`ListRegexPatternSets` and `DeleteRegexPatternSet`.
