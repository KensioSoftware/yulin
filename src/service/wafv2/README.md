# Simulated WAFv2 implementation

This directory contains the simulated AWS WAFv2 implementation. It holds web ACLs, IP sets and
regex pattern sets, and it evaluates a request against a web ACL's rules to reach a decision.

A web ACL can be put in front of an API Gateway REST API stage. CloudFront distributions and
Cognito user pools come later.

## Entry points

- `sim-wafv2.ts` is the service facade for one Account and Region scope.
- `sim-wafv2-commands.ts` is the wiring behind it, held apart because the facade grows by one method
  per SDK operation and the two would otherwise compete for room in one file.
- `sim-wafv2-sets.ts` is the half of the facade holding the IP set and regex pattern set
  operations, for the same reason.
- `index.ts` exports the public WAFv2 simulator API for `@kensio/yulin/wafv2`.

The service is scoped to an Account and Region, and within that to `CLOUDFRONT` or `REGIONAL`. The
two scopes are separate namespaces (one name can be taken in both), and `CLOUDFRONT` is only
reachable from `us-east-1` because CloudFront is global and its web ACLs live there.

## The resource model

`resource/sim-waf-resource.ts` is what the three resource types share. Each is named within a scope,
carries a generated id that is part of its ARN, and is written through a lock token. WAFv2 changes
the token on every write and refuses a write made against a stale one. That is how two callers
editing the same rules find out about each other, and reproducing it means a caller that keeps a
token from an earlier read fails here the way it fails on AWS.

`resource/sim-waf-resource-store.ts` is generic over the resource type. Names are unique within a
scope, and a read takes the name and the id together, because a name can have belonged to more than
one resource over time.

`command/sim-wafv2-resource-lookup.ts` covers the reads, updates and deletes of all three types with
one function. Authorizing happens before the lookup. That keeps a denial and a missing resource
apart. A caller with no permission for a web ACL learns only about the permission.

## Rule evaluation

`web-acl/sim-waf-web-acl.ts` holds the loop, and it is short because everything it needs was worked
out when the web ACL was written. Rules run in ascending `Priority`. The first rule that matches and
carries a terminating action decides the request. A `Count` action records the match and lets the
next rule have a look. A request no rule terminates gets the ACL's `DefaultAction`.

`evaluate/sim-waf-decision.ts` is what comes back. It carries the action, the rule that decided, the
rules that counted, the headers to add to a forwarded request, and what to answer a blocked request
with. The counted rules matter because a `Count` action leaves the request as it found it. A test
staging a rule before turning it on asserts against that list.

`web-acl/sim-waf-custom-response.ts` keeps the two header readers apart, and the difference is
easy to get wrong. WAF prefixes an inserted request header with `x-amzn-waf-` as it adds it to what
it forwards. A custom response header keeps the name the rule gave it.

`evaluate/sim-waf-blocked-response.ts` holds the default 403 body. Real WAF hands the blocking off
to whatever the web ACL is in front of, and each of those writes its own page (CloudFront's error
page, API Gateway's `{"message":"Forbidden"}`). A blocked request to a protected stage gets this
body here, which is documented as a divergence in `docs/services/wafv2`.

## Association

`association/` holds the web ACLs this scope has in front of things, and what an association may
name:

```text
SimWafAssociations              resource ARN to web ACL, and what a fronting service asks it
├── SimWafProtectedResource     what an association ARN names, read from the ARN
│   └── SimWafRestApiStage      the one resource type so far
├── SimWafProtectedResources    the port asking whether that resource is there
└── SimWafProtection            the port a fronting service takes
```

The store holds the web ACL itself rather than its ARN. A request reaching a protected stage is then
evaluated without a second lookup, and `DeleteWebACL` refuses a web ACL something still points at.
Deleting the web ACL out from under a stage would leave the stage protected by rules nothing holds.

Two ports run in opposite directions, and both are needed. `SimWafProtectedResources` is how
WAFv2 asks whether a stage ARN names anything, since WAFv2 holds no API Gateway state of its own.
`SimWafProtection` is how a simulated API Gateway reaches the web ACL in front of a stage it is
about to serve, and how it lets go of one when the stage is deleted.
`SimAwsWafProtectedResources` is the implementation reading a simulated AWS instance, and a
standalone `SimWafV2` gets `SimWafNoProtectedResources`, which finds nothing. A standalone
`SimApiGateway` gets `SimWafNoProtection` and serves every request the way it did before web ACLs.

`sim-waf-protected-resource.ts` reads an ARN for what it names. The three refusals in it mean
different things. An HTTP API stage is refused because AWS WAF protects no HTTP API, and an
association accepted here would let a test cover protection AWS never applies. A load balancer and
the other four resource types AWS does protect are refused as unsimulated. Anything else is refused
as an ARN. A second target type joins the union and gains a branch in the reader, and everything
holding an association goes on addressing a resource by its ARN.

## Compiling a statement

`statement/sim-waf-statement.ts` turns a statement into a matcher when the web ACL is written. That
is the decision the whole directory is arranged around. A rule Yulin cannot evaluate is refused by
`CreateWebACL` and `UpdateWebACL`, at the point where the rule was written. Every rule a request
meets has already been compiled into something that can answer about it.

The pieces underneath it each answer one question about a statement:

- `sim-waf-field-to-match.ts` and `sim-waf-set-field.ts` read the part of the request the statement
  inspects. A field can hold more than one string (all the query arguments, the headers a pattern
  selected), and a statement matches when any of them does.
- `sim-waf-text-transformation.ts` applies the rule's transformations in ascending `Priority`. WAF
  orders them by priority and not by how the list was written. Lowercasing after decoding is a
  different rule from decoding after lowercasing. `sim-waf-url-decode.ts` is the one of them worth
  its own file, because a run of percent escapes has to be decoded together for a non-ASCII
  character to come out of it.
- `sim-waf-match-pattern.ts` reads which headers or cookies a rule selects.
- `sim-waf-byte-match.ts`, `sim-waf-regex-match.ts` and `sim-waf-size-constraint.ts` are the three
  tests a field is put through.
- `sim-waf-logical-statement.ts` joins and negates the others.

`sim-waf-field-content.ts` is where the inspection limit lives. WAF stops reading a body, a header
set or a cookie set at 8 KB, and the rule says what content past that point counts as. `MATCH` and
`NO_MATCH` settle the statement without looking. `CONTINUE` inspects as much as WAF would have
read.

Matching is case sensitive throughout, as it is on AWS. A rule that means to ignore case says so
with a `LOWERCASE` transformation and a lower case search string.

## Refusals

Three files hold them, one per level.

- `statement/sim-waf-unsimulated-statement.ts` for the statement kinds.
- `statement/sim-waf-unsimulated-field.ts` for the field-to-match kinds.
- `web-acl/sim-waf-rule-input.ts` and `command/web-acl/sim-wafv2-unsimulated-web-acl-input.ts` for
  the members of a rule and of a web ACL.

Every refusal names the rule and what in it was refused, because a web ACL is a list of rules that
all look alike from the outside and the name is the only thing that says which one to go and look
at.

The reasons are worth knowing. `IPSetReferenceStatement`, `GeoMatchStatement` and
`AsnMatchStatement` are refused because every request in this simulation reports a source address of
`127.0.0.1` (`simAwsProxiedSourceIp`), and a rule on where a request came from would see one client
for the whole simulation. `SqliMatchStatement` and `XssMatchStatement` are refused because AWS
publishes no description of the detection they run. `RateBasedStatement` needs request counting over
a window against the simulated clock (feasible, and not part of this). The rule group
statements and `LabelMatchStatement` arrive with the AWS managed rule groups.

An IP set is held and reported, and no rule reads one, for the same reason
`IPSetReferenceStatement` is refused. A stack that creates one still deploys, and a test can read
back what it created.

## Authorization

`command/authorize/sim-wafv2-authorizer.ts` authorizes an operation on one resource against that
resource's ARN. The id in the ARN is generated. A policy that names a resource therefore ends in a
wildcard where the id goes, as WAFv2 policies do on AWS
(`arn:aws:wafv2:us-east-1:111111111111:regional/webacl/api-acl/*`).

The three listings have no resource type on real WAFv2. They authorize against `*`, and a policy
scoped to web ACL ARNs allows none of them, however broadly those ARNs are written.

## Testing

Tests are colocated with the code they exercise. `sim-wafv2.fixture.ts` holds two helpers, and both
exist for the same reason. `createSimWafWebAcl` reads the summary a create reported, holding the
id, the ARN and the first lock token. `simWafStatementMatches` puts one statement behind a blocking
rule and answers with a predicate over requests. That predicate is the whole of what a test about a
statement kind wants to say.

`web-acl/sim-waf-rule.factory.ts` and `command/web-acl/sim-waf-create-web-acl.factory.ts` build the
two shapes a test writes over and over. Overrides are merged into the defaults, and `Statement` and
`Action` each hold one kind at a time, and a test replaces those whole. Merging two statement kinds
onto one statement produces a rule WAF would refuse, and the factory says as much.
