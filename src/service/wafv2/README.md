# Simulated WAFv2 implementation

This directory contains the simulated AWS WAFv2 implementation. It holds web ACLs, IP sets and
regex pattern sets, and it evaluates a request against a web ACL's rules to reach a decision. Three
of the AWS managed rule groups are carried here, approximated to a tier each rule declares.

`SimWafV2.evaluateRequest` is the entry point a fronting service calls once it has a web ACL ARN to
hand. An API Gateway REST API stage and a Cognito user pool both reach it through
`AssociateWebACL`. Simulated CloudFront calls it in `cloudfront/controller/web-acl/`, for every
request to a distribution whose `WebACLId` names one.

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

`evaluate/sim-waf-evaluate-rules.ts` holds the loop, and it is short because everything it needs was
worked out when the web ACL was written. Rules run in ascending `Priority`. The first rule that
matches and carries a terminating action decides the request. A `Count` action records the match and
lets the next rule have a look. A request no rule terminates gets the ACL's `DefaultAction`, which
is the one thing the loop leaves to `web-acl/sim-waf-web-acl.ts`.

`web-acl/sim-waf-rule.ts` answers with the action a rule applies, or with nothing when the rule does
not claim the request. Most rules answer with the action they were written with. A rule naming a
managed rule group answers with the action of whichever rule inside the group claimed the request,
and that is the whole reason a rule answers with an action at all.

`evaluate/sim-waf-decision.ts` is what comes back. It carries the action, the rule that decided, the
rules that counted, the labels the request picked up, the headers to add to a forwarded request, and
what to answer a blocked request with. The counted rules matter because a `Count` action leaves the
request as it found it. A test staging a rule before turning it on asserts against that list.

`evaluate/sim-waf-request-labels.ts` is the labels one request collected. They belong to the request
being evaluated because that is where AWS puts them. A rule adds its labels when it matches, and the
rules after it can match on them. `statement/sim-waf-label-match.ts` is the reading side, and
`web-acl/sim-waf-rule-labels.ts` is a rule's own labels. A label added by a rule of the web ACL's
own carries no prefix, where a label from a rule group is qualified by the group it came from.

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
│   ├── SimWafRestApiStage      an API Gateway REST API stage
│   └── SimWafUserPool          a Cognito user pool
├── SimWafProtectedResources    the port asking whether that resource is there
├── SimWafProtection            the port a fronting service takes
└── SimWafRequestInspection     the serving half, shared by both fronting services
```

The store holds the web ACL itself rather than its ARN. A request reaching a protected resource is
then evaluated without a second lookup, and `DeleteWebACL` refuses a web ACL something still points
at. Deleting the web ACL out from under a stage would leave the stage protected by rules nothing
holds. Each association records the resource type alongside the web ACL, because
`ListResourcesForWebACL` lists one type at a time and the ARN would otherwise have to be read again
to say which type it named.

Two ports run in opposite directions, and both are needed. `SimWafProtectedResources` is how
WAFv2 asks whether a resource ARN names anything, since WAFv2 holds no API Gateway or Cognito state
of its own. `SimWafProtection` is how a fronting service reaches the web ACL in front of the
resource it is about to serve, and how it lets go of one when the resource is deleted.
`SimAwsWafProtectedResources` is the implementation reading a simulated AWS instance, and a
standalone `SimWafV2` gets `SimWafNoProtectedResources`, which finds nothing. A standalone
`SimApiGateway` or `SimCognitoIdentityProvider` gets `SimWafNoProtection` and serves every request
the way it did before web ACLs.

`association/sim-waf-request-inspection.ts` is the serving half both fronting services share. It
short-circuits on an unprotected resource, evaluates the rules, turns a block into the 403 response
and adds an `Allow` rule's inserted headers to what is forwarded. Two things differ between the
services and are asked for there. Where the resource ARN comes from, and whether the body is
forwarded. API Gateway forwards it. Cognito forwards it for the user pool API and withholds it for
managed login. `forwardBody` is `false` on the Cognito path, which leaves a `ByteMatchStatement` on
`Body` inspecting an empty field at a hosted domain, as it inspects one on AWS.

`sim-waf-protected-resource.ts` reads an ARN for what it names. The three refusals in it mean
different things. An HTTP API stage is refused because AWS WAF protects no HTTP API, and an
association accepted here would let a test cover protection AWS never applies. A load balancer and
the other three resource types AWS does protect are refused as unsimulated. Anything else is refused
as an ARN. A third target type joins the union and gains a branch in the reader, and everything
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

## The AWS managed rule groups

`managed/` carries `AWSManagedRulesCommonRuleSet`, `AWSManagedRulesKnownBadInputsRuleSet` and
`AWSManagedRulesAdminProtectionRuleSet`. AWS publishes every rule name, every default action, every
label and the size limits, and holds back the pattern set behind each rule. What is here follows
from that split.

`managed/group/` holds the three groups, each an ordered list of rules. The order is AWS's own and
it decides which of two matching rules blocks a request and whose label the request carries. The
core rule set is split across two files (`sim-waf-core-request-rules.ts` and
`sim-waf-core-payload-rules.ts`) because 22 rules in one file scores over the FTA threshold, and the
join between them is where AWS's order goes from reading the request to looking inside it.

Every rule declares a tier, in `managed/sim-waf-managed-rule.type.ts`.

- `exact` matches where the AWS rule matches. The four `SizeRestrictions_*` rules at their
  documented limits, `NoUserAgent_HEADER`, `PROPFIND_METHOD` and `Host_localhost_HEADER`.
- `documented` matches the patterns AWS published for the rule and nothing beyond them.
- `declared` detects nothing and matches a request a test declared a match for. The four
  `CrossSiteScripting_*` rules run detection AWS documents none of.

The tiers under-detect against AWS and never over-detect. The reason is what a test with the core
rule set on is usually asking. A rule that blocked more than AWS blocks would fail that test for a
request AWS allows, and send somebody off to work around a rule that does not exist. A rule that
blocks less is invisible to it and right on AWS too. So `managed/detect/sim-waf-managed-patterns.ts`
carries a pattern only where AWS published one, and the reverse test is covered by declaring a
match.

`Host_localhost_HEADER` is the one rule the simulation had to think about twice. It blocks a request
whose Host header holds `localhost`, and Yulin serves every simulated endpoint under
`*.sim-aws.localhost`. It reads `SimWafInspectedRequest.host`, which is the AWS-facing hostname with
the Yulin-local suffix taken off, so it claims a request addressed to localhost and leaves the ones
addressed to a simulated endpoint alone.

`managed/sim-waf-managed-rules.ts` is the accessor behind `SimWafV2.managedRules()`. It holds the
declared matches, keyed by URI path and matched exactly as simulated Rekognition matches the name of
an image a result was declared for, and it reports the tier of every rule.

`managed/sim-waf-managed-group-statement.ts` compiles a rule that names a group. The two overrides
stack in one direction. `RuleActionOverrides` sets what a named rule does, and an `OverrideAction`
of `Count` then holds the whole group to counting whatever its rules were set to. A
`ScopeDownStatement` decides whether the group sees the request at all, and a request it does not
claim picks up no label.

`command/managed-rule-group/` is `DescribeManagedRuleGroup`, which reports the rules of a group and
the labels they add. It is the only WAFv2 operation these groups have of their own, and it
authorizes against `*` as the listings do.

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
a window against the simulated clock (feasible, and not part of this).
`RuleGroupReferenceStatement` is refused because a rule group of the reader's own is a resource in
its own right, and none is simulated.

`managed/sim-waf-managed-group-input.ts` refuses a managed rule group outside the three, naming the
ones that are simulated. It also refuses `Version`, `ExcludedRules` and `ManagedRuleGroupConfigs`.

An IP set is held and reported, and no rule reads one, for the same reason
`IPSetReferenceStatement` is refused. A stack that creates one still deploys, and a test can read
back what it created.

## CloudFormation

`cfn/` builds the four `AWS::WAFv2::*` Resource types this simulation deploys. The arrangement is
the one every other service uses. A factory dispatches on the Resource type name, and each type has
a directory holding its creator and the config that reads its properties.

```text
SimWafCfnResourceFactory        create, dispatching on the Resource type name
├── SimCfnWafResourceDeleter    delete, held apart to keep the factory under the FTA threshold
├── SimCfnWafResourceConfig     name, scope and description, shared by the three named types
├── web-acl/                    AWS::WAFv2::WebACL
├── association/                AWS::WAFv2::WebACLAssociation
├── ip-set/                     AWS::WAFv2::IPSet
└── regex-pattern-set/          AWS::WAFv2::RegexPatternSet
```

Every Resource is created through the ordinary WAFv2 command for it. A template gets the same
compilation of every rule that an SDK caller gets, and the same refusals.
`sim-cfn-waf-resource-error.ts` catches a `SimWafError` on the way out and names the Resource in it,
because a deployment failing on `Rule block-admin uses the statement kind SqliMatchStatement` says
which rule and not which of a template's web ACLs declared it.

The same file sorts the two kinds of refusal. A template and an SDK caller part company there. A
`SimWafUnsimulatedInputException` skips the Resource, worded so sim CloudFormation records it and
steps over it (see `resource/unsupported/sim-cfn-unsupported-resource.ts`). Every other
`SimWafError` fails the stack, because the template asked for something WAFv2 itself will not
take.

Issue #823 is the reasoning behind that split, and #391 is the principle it comes from. A web ACL
that accepted a rule it cannot evaluate would allow a request AWS blocks, and a web ACL that is
missing allows exactly what a stack that never deployed allows. The caution was right and the blast
radius was the mistake. One rate limiting rule used to take a user pool, a table, a secret and two
functions down with it.

The association hands `ResourceArn` straight to `AssociateWebACL`. What a web ACL may be put in
front of is decided once, in `association/sim-waf-protected-resource.ts`, and the CloudFormation
layer inherits every answer in it. The same split runs through it. An HTTP API stage fails the
stack, and a load balancer skips the association. Deleting the association tolerates a resource that
has gone already, which is what a REST API stage in one stack and the association in another leaves
behind.

`cfn/sim-cfn-waf-skipped-web-acl.ts` catches the case the split leaves open. A skipped Resource
reaches CREATE_COMPLETE and answers `Fn::GetAtt` with a stand-in, so an association naming a skipped
web ACL would hand that stand-in to `AssociateWebACL` and fail the stack on a web ACL that does not
exist. The association is skipped alongside it.

The match is on the resolved `WebACLArn` rather than on the Resources the association depends on.
`dependencies()` covers `DependsOn` and every `Ref` and `Fn::GetAtt` in the Resource, and an
association that waits on one web ACL and associates another is made.

CloudFront reads the same file, from `cfn/distro/sim-cfn-cf-distro-web-acl-skip.ts`, for the
Distribution that names a web ACL in its own `WebACLId`.

Two shapes differ between a template and the API. `SearchString` is plain text in a template and
bytes in the SDK, and `RegularExpressionList` is a list of strings in a template and a list of
`RegexString` objects in the SDK. The first needs no work, since `sim-waf-byte-match.ts` already
reads either. The second is wrapped in `regex-pattern-set/sim-cfn-waf-regex-set-config.ts`.

`SimWafWebAcl` gained `capacity` and `labelNamespace` for the attributes `Fn::GetAtt` publishes, and
`GetWebACL` reports both. `web-acl/sim-waf-web-acl-capacity.ts` walks the rules and
`web-acl/sim-waf-statement-capacity.ts` holds the costs, which are AWS's published base cost per
statement kind plus the surcharges for reading every query argument and for each text
transformation. It sums where real WAF discounts whatever two rules can share, leaving the
number an upper bound on what AWS reports. A CloudFront distribution is associated through its
own `WebACLId` and reaches nothing here.

## Authorization

`command/authorize/sim-wafv2-authorizer.ts` authorizes an operation on one resource against that
resource's ARN. The id in the ARN is generated. A policy that names a resource therefore ends in a
wildcard where the id goes, as WAFv2 policies do on AWS
(`arn:aws:wafv2:us-east-1:111111111111:regional/webacl/api-acl/*`).

The three listings have no resource type on real WAFv2. They authorize against `*`, and a policy
scoped to web ACL ARNs allows none of them, however broadly those ARNs are written.

## Testing

Tests are colocated with the code they exercise. `sim-wafv2.fixture.ts` holds the helpers a test
about a web ACL is built from. `createSimWafWebAcl` reads the summary a create reported, holding the
id, the ARN and the first lock token. `simWafStatementMatches` puts one statement behind a blocking
rule and answers with a predicate over requests. That predicate is the whole of what a test about a
statement kind wants to say.

`simWafWebAclDecisions` is `simWafStatementMatches` for a test that wants the whole decision rather
than whether one statement claimed the request. `simWafBrowserRequest` sends a User-Agent header,
because `NoUserAgent_HEADER` claims a request without one and a test about any other rule would
otherwise never reach it.

`web-acl/sim-waf-rule.factory.ts` and `command/web-acl/sim-waf-create-web-acl.factory.ts` build the
two shapes a test writes over and over. `simWafManagedRuleFactory` is the third, for a rule that
names the core rule set. Overrides are merged into the defaults, and `Statement` and
`Action` each hold one kind at a time, and a test replaces those whole. Merging two statement kinds
onto one statement produces a rule WAF would refuse, and the factory says as much.
