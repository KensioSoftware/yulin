# Simulated IAM

Yulin simulates IAM users, roles, policies and authorization decisions for tests and local
development. Other simulated services use IAM to authorize requests, simulated STS uses it to issue
temporary role sessions, and simulated CloudFormation can create IAM resources from templates.

Use IAM through `SimAws` when it should share state with other services. Use `SimIam` directly when
you need an isolated policy evaluator.

## Basic usage

Create a simulated AWS environment, get simulated IAM, create a Role with an inline policy, and
authorize an action as that Role.

```typescript sim-iam-role-authorization
/**
 * Creating a simulated IAM Role and authorizing an action.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simIam = simAws.account("123456789012").iam();

const roleCreation = await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "ReportReaderRole",
    Description: "Allows reading report objects",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::123456789012:root" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simIam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ReportReaderRole",
    PolicyName: "ReadReports",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::reports-bucket/*",
      },
    }),
  }),
);

const decision = simIam.authorize({
  action: "s3:GetObject",
  resource: "arn:aws:s3:::reports-bucket/2026/summary.csv",
  caller: { kind: "arn", arn: roleCreation.Role.Arn },
});

console.log(decision.isAllowed);
```

`CreateRoleCommand` validates the trust policy document and stores the Role with an AWS-shaped ARN,
Role ID, and creation date. Roles can be inspected with `GetRoleCommand` and `ListRolesCommand`.

A trust policy alone grants no permissions. A Role with no inline or attached policies is implicitly
denied for every action.

## Authorization decisions

`authorize(...)` returns an authorization decision without throwing when access is denied. Tests
can inspect why the request was allowed or denied. The evaluator applies these rules:

- A matching explicit `Deny` statement in any evaluated policy wins
- Otherwise, within one Account, a matching `Allow` in an identity policy or resource policy allows
  the request
- Across Accounts, a matching `Allow` is needed from each side. See
  [Cross-Account requests](#cross-account-requests)
- Otherwise the request is implicitly denied

The decision's `value` is `"Allow"`, `"ExplicitDeny"` or `"ImplicitDeny"`. Convenience flags expose
the same result as `isAllowed`, `isDenied`, `isExplicitDeny` and `isImplicitDeny`. The decision also
contains the resolved `caller` and the matching allow and deny statements. For cross-account
requests, inspect `identityAllowStatements` and `resourceAllowStatements` to see which side did not
grant access. Unsupported statements appear in `unevaluatedStatements`, covered under
[Statements left unevaluated](#statements-left-unevaluated).

If the caller is omitted, authorization defaults to the simulation's own
[default caller](#name-the-caller-a-simulation-uses-by-default), and to the root principal of the
Account owning the sim IAM instance where the simulation has none. That root principal is allowed
within its own Account, subject to any service control policy over that Account. An explicit
`{ kind: "anonymous" }` caller suppresses both fallbacks and is
evaluated without identity policies.

Resource policies live with the service that owns the target resource, such as an S3 Bucket policy,
and are supplied with the authorization request.

```typescript sim-iam-authorization-decisions
/**
 * Inspecting simulated IAM authorization decisions.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simIam = simAws.account("123456789012").iam();

const bucketPolicy = {
  document: {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: "*",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::example-bucket/*",
      },
      {
        Effect: "Deny",
        Principal: "*",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::example-bucket/private/*",
      },
    ],
  },
} as const;

const publicDecision = simIam.authorize({
  action: "s3:GetObject",
  resource: "arn:aws:s3:::example-bucket/public/index.html",
  caller: { kind: "anonymous" },
  resourcePolicies: [bucketPolicy],
});

const privateDecision = simIam.authorize({
  action: "s3:GetObject",
  resource: "arn:aws:s3:::example-bucket/private/secrets.txt",
  caller: { kind: "anonymous" },
  resourcePolicies: [bucketPolicy],
});

console.log(publicDecision.value);
console.log(privateDecision.value);
console.log(privateDecision.explicitDenyStatements.length);
```

## Managed Policies

Create standalone managed Policies with `CreatePolicyCommand` and attach them to Roles with
`AttachRolePolicyCommand`. A managed Policy only grants permissions once it is attached.

```typescript sim-iam-managed-policy
/**
 * Creating and attaching a simulated IAM managed Policy.
 */

import {
  AttachRolePolicyCommand,
  CreatePolicyCommand,
  CreateRoleCommand,
} from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simIam = simAws.account("123456789012").iam();

const policyCreation = await simIam.createPolicy(
  new CreatePolicyCommand({
    PolicyName: "ReadOnlyReports",
    Path: "/service-role/",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::reports-bucket/*",
      },
    }),
  }),
);

const roleCreation = await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "ReportingRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::123456789012:root" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simIam.attachRolePolicy(
  new AttachRolePolicyCommand({
    RoleName: "ReportingRole",
    PolicyArn: policyCreation.Policy.Arn,
  }),
);

const decision = simIam.authorize({
  action: "s3:GetObject",
  resource: "arn:aws:s3:::reports-bucket/2026/summary.csv",
  caller: { kind: "arn", arn: roleCreation.Role.Arn },
});

console.log(policyCreation.Policy.Arn);
console.log(decision.isAllowed);
```

Policy paths are normalised into the Policy ARN. A Policy named `ReadOnlyReports` with path
`/service-role/` gets the ARN `arn:aws:iam::123456789012:policy/service-role/ReadOnlyReports`.
Creating a duplicate Policy name in the same path throws an error, while the same name in different
paths is allowed. Stored Policies can be inspected with `GetPolicyCommand` and
`ListPoliciesCommand`. `AttachmentCount` counts the Roles, Users and groups a policy is attached
to, and `PermissionsBoundaryUsageCount` the Roles and Users it is the boundary of.

`ListPoliciesCommand` lists the Account's own policies and the [AWS-managed
catalogue](#aws-managed-policies) together. `Scope: "Local"` lists only the Account's own, and
`Scope: "AWS"` only the catalogue.

### Policy versions

A customer managed policy holds up to five versions. `CreatePolicyVersionCommand` adds one, and
`SetAsDefault: true` makes it the default as it is created. `SetDefaultPolicyVersionCommand` makes an
existing version the default. Authorization reads the default version only, so a change of default
changes what every Role, User and group the policy is attached to may do, from the next request.

```typescript sim-iam-policy-versions
/**
 * Rolling a managed policy forward to a new version.
 */

import {
  AttachUserPolicyCommand,
  CreatePolicyCommand,
  CreatePolicyVersionCommand,
  CreateUserCommand,
  ListPolicyVersionsCommand,
} from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simIam = new SimAws().account("123456789012").iam();

const { Policy } = await simIam.createPolicy(
  new CreatePolicyCommand({
    PolicyName: "Reports",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "s3:GetObject", Resource: "*" },
    }),
  }),
);
await simIam.createUser(new CreateUserCommand({ UserName: "analyst" }));
await simIam.attachUserPolicy(
  new AttachUserPolicyCommand({ UserName: "analyst", PolicyArn: Policy.Arn }),
);

// Version 2 allows writes as well, and becomes the default
await simIam.createPolicyVersion(
  new CreatePolicyVersionCommand({
    PolicyArn: Policy.Arn,
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: ["s3:GetObject", "s3:PutObject"],
        Resource: "*",
      },
    }),
    SetAsDefault: true,
  }),
);

const versions = await simIam.listPolicyVersions(
  new ListPolicyVersionsCommand({ PolicyArn: Policy.Arn }),
);
const decision = simIam.authorize({
  action: "s3:PutObject",
  resource: "arn:aws:s3:::reports-bucket/summary.csv",
  caller: { kind: "arn", arn: "arn:aws:iam::123456789012:user/analyst" },
});

console.log(versions.Versions.map((version) => version.VersionId)); // ["v2", "v1"]
console.log(decision.isAllowed); // true
```

`ListPolicyVersionsCommand` lists the versions newest first, and `GetPolicyVersionCommand` reads any
of them. `DeletePolicyVersionCommand` removes a version other than the default. Versions are numbered
upwards and a deleted number is never reused, so the version after `v5` is `v6` whatever was deleted
between. A sixth version is refused with `LimitExceeded`, and `DeletePolicyCommand` refuses a policy
still holding versions other than its default with `DeleteConflict`.

## AWS-managed policies

An ARN under `arn:aws:iam::aws:policy/` names a policy AWS manages. Yulin carries a catalogue of
these policies, each with the document AWS publishes for its default version. Attaching a catalogued
ARN grants what that document allows. This holds for `AttachRolePolicyCommand`,
`AttachUserPolicyCommand`, and `ManagedPolicyArns` on an `AWS::IAM::Role` or `AWS::IAM::User`. The
partition can be any of them, so the `Fn::Join` over `AWS::Partition` that CDK writes resolves to
the same policy.

```typescript sim-iam-aws-managed-policy
/**
 * Attaching an AWS-managed policy to a simulated IAM Role.
 */

import {
  AttachRolePolicyCommand,
  CreateRoleCommand,
  GetPolicyVersionCommand,
  ListAttachedRolePoliciesCommand,
} from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simIam = new SimAws().iam();

const roleCreation = await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "OrdersHandler",
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

const policyArn =
  "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole";

await simIam.attachRolePolicy(
  new AttachRolePolicyCommand({
    RoleName: "OrdersHandler",
    PolicyArn: policyArn,
  }),
);

const decision = simIam.authorize({
  action: "logs:PutLogEvents",
  resource:
    "arn:aws:logs:eu-west-2:123456789012:log-group:/aws/lambda/orders:*",
  caller: { kind: "arn", arn: roleCreation.Role.Arn },
});

const attached = await simIam.listAttachedRolePolicies(
  new ListAttachedRolePoliciesCommand({ RoleName: "OrdersHandler" }),
);

const version = await simIam.getPolicyVersion(
  new GetPolicyVersionCommand({ PolicyArn: policyArn, VersionId: "v1" }),
);

console.log(decision.isAllowed);
console.log(attached.AttachedPolicies.map((policy) => policy.PolicyName));
console.log(decodeURIComponent(version.PolicyVersion.Document ?? ""));
```

`GetPolicyCommand` describes a catalogued policy with its name, path, description, dates and default
version ID. The policy ID is derived from the ARN (AWS's own IDs are absent from the reference the
catalogue is read from). `GetPolicyVersionCommand` returns the document URL-encoded, as IAM does.

The catalogue covers the policies CDK and SAM apps commonly attach for services Yulin simulates:

- `AdministratorAccess`, `PowerUserAccess` and `ReadOnlyAccess`
- The Lambda execution roles under `service-role/` (`AWSLambdaBasicExecutionRole`,
  `AWSLambdaVPCAccessExecutionRole`, `AWSLambdaSQSQueueExecutionRole`,
  `AWSLambdaKinesisExecutionRole`, `AWSLambdaDynamoDBExecutionRole` and `AWSLambdaRole`), plus
  `AWSLambdaExecute`, `AWSLambda_FullAccess` and `AWSLambda_ReadOnlyAccess`
- The read-only and full-access policies for S3, DynamoDB (including `AmazonDynamoDBFullAccess_v2`),
  SQS, SNS, Kinesis, SES, EventBridge and Step Functions
- `service-role/AmazonECSTaskExecutionRolePolicy` and `AmazonEC2ContainerRegistryReadOnly`
- `CloudWatchLogsFullAccess`, `CloudWatchLogsReadOnlyAccess`, `CloudWatchReadOnlyAccess` and
  `CloudWatchFullAccessV2`
- `AWSXRayDaemonWriteAccess` and `AWSXrayWriteOnlyAccess`, which SAM attaches for tracing
- `SecretsManagerReadWrite`, `AmazonSSMReadOnlyAccess`, `AmazonAPIGatewayInvokeFullAccess`,
  `AmazonCognitoReadOnly` and `AmazonCognitoPowerUser`

AWS publishes over a thousand managed policies, and most of them grant access to services Yulin does
not simulate. Those stay out of the catalogue. An AWS-managed ARN outside it still attaches, from
the SDK and from a template alike, and contributes no statements to a decision. `GetPolicyCommand`
and `GetPolicyVersionCommand` refuse it with `NoSuchEntity`, and `ListAttachedRolePoliciesCommand`
lists it. AWS refuses to attach an ARN that names no policy, and Yulin cannot tell that case apart
from a real policy it lacks. Refusing would fail templates that deploy on AWS.

The catalogue is a snapshot of the
[AWS Managed Policy Reference Guide](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/policy-list.html),
and each document matches the IAM API's copy of the version it names. The guide can trail IAM by a
version on a policy AWS revises often, such as `ReadOnlyAccess`. `pnpm run iam:aws-managed-policies`
reads the guide again and rewrites the snapshot.

## Policy document character limits

IAM caps a policy document by where it is going. A managed policy version takes 6,144 characters,
and a Role trust policy takes 2,048. Inline policies are capped as a total for each entity, summed
across every inline policy it holds: 10,240 characters for a Role, 5,120 for a group and 2,048 for a
User. `CreatePolicy`, `CreatePolicyVersion`, `PutRolePolicy`, `PutUserPolicy`, `PutGroupPolicy`,
`CreateRole` and `UpdateAssumeRolePolicy` refuse a document past the cap with `LimitExceeded`, in
IAM's own wording. Replacing an inline policy measures the new document in place of the old one. An
`AWS::IAM::ManagedPolicy` or an `AWS::IAM::Policy` carrying one fails its Resource.

IAM leaves whitespace out of the count, and so does the check here. A document indented for a
reader measures the same as the one line `JSON.stringify` writes.

A policy that has outgrown its cap cannot be deployed. The account keeps whichever version last
fit, and the permission the policy was grown to grant goes missing weeks later, against a
repository that still says it is there.

## Quotas

IAM refuses the following with `LimitExceeded`, at the defaults a new account carries:

| Limit                                   | Default | Message                                                         |
| --------------------------------------- | ------- | --------------------------------------------------------------- |
| Managed policies attached to a Role     | 20      | `Cannot exceed quota for PoliciesPerRole: 20`                   |
| Managed policies attached to a User     | 10      | `Cannot exceed quota for PoliciesPerUser: 10`                   |
| Managed policies attached to a group    | 10      | `Cannot exceed quota for PoliciesPerGroup: 10`                  |
| Access keys on a User, active or not    | 2       | `Cannot exceed quota for AccessKeysPerUser: 2`                  |
| Groups a User is in                     | 10      | `Cannot exceed quota for GroupsPerUser: 10`                     |
| Versions of a managed policy            | 5       | `A managed policy can have up to 5 versions...`                 |
| Roles in an instance profile            | 1       | `Cannot exceed quota for InstanceSessionsPerInstanceProfile: 1` |
| Roles in an Account                     | 1,000   | `Cannot exceed quota for RolesPerAccount: 1000`                 |
| Users in an Account                     | 5,000   | `Cannot exceed quota for UsersPerAccount: 5000`                 |
| Groups in an Account                    | 300     | `Cannot exceed quota for GroupsPerAccount: 300`                 |
| Customer managed policies in an Account | 1,500   | `Cannot exceed quota for PoliciesPerAccount: 1500`              |
| Instance profiles in an Account         | 1,000   | `Cannot exceed quota for InstanceProfilesPerAccount: 1000`      |

Attaching a policy an entity already carries, or adding a User to a group it is already in, counts
nothing. Several of these quotas can be raised in a real account. The simulation holds the
defaults.

`GetAccountSummaryCommand` reports what the Account holds against its quotas, in a `SummaryMap`
under IAM's own keys (`Roles` and `RolesQuota`, `Policies` and `PoliciesQuota`, and so on). MFA
devices, server certificates and the other things the simulator leaves out count zero.

A name is unique in the Account for each kind of entity, and IAM holds names apart regardless of
case. `CreateRoleCommand` refuses `worker` beside a Role named `Worker` with `EntityAlreadyExists`,
and the same goes for Users, groups and instance profiles. A customer managed policy name is unique
whatever path the policy sits at.

## Policy conditions

Policy statements can carry `Condition` blocks. Sim IAM evaluates every condition operator IAM
documents:

- `StringEquals`, `StringNotEquals`, `StringEqualsIgnoreCase`, `StringNotEqualsIgnoreCase`,
  `StringLike` and `StringNotLike`
- `NumericEquals`, `NumericNotEquals`, `NumericLessThan`, `NumericLessThanEquals`,
  `NumericGreaterThan` and `NumericGreaterThanEquals`
- `DateEquals`, `DateNotEquals`, `DateLessThan`, `DateLessThanEquals`, `DateGreaterThan` and
  `DateGreaterThanEquals`
- `Bool`, `BinaryEquals`, `IpAddress` and `NotIpAddress`
- `ArnEquals`, `ArnLike`, `ArnNotEquals` and `ArnNotLike`
- `Null`

Each of them except `Null` also takes the `ForAnyValue:` and `ForAllValues:` set qualifiers and the
`IfExists` suffix, so `ForAllValues:StringLikeIfExists` is evaluated too.

`Bool` reads `"true"` and `"false"` in either case, as well as JSON booleans, on both sides. A
request carrying no value for the key matches nothing, so `"aws:SecureTransport": "false"` belongs
in a `Deny`.

The negated operators `StringNotEquals`, `StringNotLike`, `ArnNotEquals` and `ArnNotLike` are
supported too, each unqualified and in both set forms. A list of policy values under a negated
operator is an AND (the request value has to differ from every one of them), where the same list
under a positive operator is an OR. A service control policy writes its carve-outs this way, hanging
`ArnNotLike` on `aws:PrincipalArn` to deny an action to every principal outside a named set of
roles.

The numeric operators read JSON numbers and numeric strings alike. The date operators read the W3C
forms of ISO 8601 (`2027-01-01T00:00:00Z`, `2027-01-01` for midnight UTC, or `2027-01` for the first
of the month) and epoch seconds, and compare the instants they name. A time written with an offset
compares correctly with one written in UTC. A date the calendar lacks, such as `2026-02-30`, is a
value the operator cannot read.
`IpAddress` takes CIDR ranges in IPv4 and IPv6, and reads an address with no prefix as a range of one.
`BinaryEquals` compares the bytes two base64 values encode.

A value an operator cannot read, such as a word under a numeric operator or a malformed CIDR range,
makes the condition fail. It fails under a negated operator too, so `NotIpAddress` given a range it
cannot read matches nothing.

`ArnLike` and `ArnEquals` behave identically, as AWS documents them doing. Both compare the six
colon-delimited components of an ARN separately, and both accept `*` and `?` wildcards in any of
them. A wildcard stays inside the component it is written in. `arn:aws:s3:*` matches nothing,
because a pattern needs as many components as the ARN it is matched against. `ArnNotEquals` and
`ArnNotLike` compare an ARN the same way and answer the opposite.

Condition context values are supplied by the service handling the simulated request, such as S3
object tags. Sim IAM automatically derives the global values it can work out itself. `aws:PrincipalArn` comes
from the resolved caller, `aws:RequestedRegion` from the Region the request was made in, and
`aws:CurrentTime` and `aws:EpochTime` from the simulation's clock. The caller also brings the keys
that describe it, which [Tags and principal keys](#tags-and-principal-keys) lists. A caller
whose Account is in the simulated organization also carries `aws:PrincipalOrgID` (see
[Organizations](https://yulinsim.dev/services/organizations/)). A value a service supplies under any
of those names is overwritten by the derived one. Context-key names are matched
case-insensitively, while string values remain case-sensitive.

IAM's own requests carry two service keys. A Role handed to a service carries
[`iam:PassedToService`](#passing-a-role-to-a-service), and a `CreateRole` request carries the
boundary it declares as
[`iam:PermissionsBoundary`](#creating-a-role-under-a-permissions-boundary).

The request time follows the simulated clock. A policy dated in the future starts to apply once a
test advances the clock past its date:

```typescript sim-iam-date-conditions
/**
 * Simulated IAM date conditions read the simulated clock.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
await simAws.clock().setTo(new Date("2026-12-31T23:00:00Z"));

simAws.organizations().attachServiceControlPolicy("123456789012", {
  Version: "2012-10-17",
  Statement: {
    Effect: "Deny",
    Action: "s3:CreateBucket",
    Resource: "*",
    Condition: {
      DateGreaterThanEquals: { "aws:CurrentTime": "2027-01-01T00:00:00Z" },
    },
  },
});

const iam = simAws.account("123456789012").iam();
const request = {
  action: "s3:CreateBucket",
  resource: "arn:aws:s3:::123456789012-reports",
};

console.log(iam.authorize(request).isAllowed); // true

await simAws.clock().advanceBy({ hours: 2 });

console.log(iam.authorize(request).isAllowed); // false
```

Every simulated service supplies its own Region. A policy conditioned on `aws:RequestedRegion`
therefore sees the Region of the service that handled the request, whichever Region the caller was
in, and a CloudFormation deployment carries the Region of the Stack it is deploying. IAM, CloudFront
and Route53 are global, with one endpoint between all Regions. Their requests carry `us-east-1`, as
they do on AWS (which is why a service control policy confining an Account to a list of Regions has
to leave the global services' actions out of the condition). A request made straight to
`simIam.authorize(...)` carries no Region unless it is given one, and a statement conditioned on the
key then matches nothing.

```typescript sim-iam-policy-conditions
/**
 * Simulated IAM policy conditions.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simIam = simAws.account("123456789012").iam();

const roleCreation = await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "FinanceReaderRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::123456789012:root" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simIam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "FinanceReaderRole",
    PolicyName: "ReadFinanceObjects",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::reports-bucket/*",
        Condition: {
          StringEquals: {
            "s3:ExistingObjectTag/department": "finance",
          },
        },
      },
    }),
  }),
);

const decision = simIam.authorize({
  action: "s3:GetObject",
  resource: "arn:aws:s3:::reports-bucket/2026/summary.csv",
  caller: { kind: "arn", arn: roleCreation.Role.Arn },
  conditionContext: {
    "s3:ExistingObjectTag/department": "finance",
  },
});

console.log(decision.isAllowed);
```

An unqualified positive operator naming a context key the request supplies no value for fails to
match, leaving the request implicitly denied unless another statement allows it. Its negated form
matches instead, as AWS documents. With no value in the request there is none for the policy value
to equal. A `ForAnyValue:` operator answers false for an absent key whatever it wraps, because no
request value is there to satisfy it.

A `ForAllValues:` operator answers true for an absent key, and for a key whose list of values is
empty, which is also AWS behaviour. Every value the request carries matches when it carries none. AWS warns that this leaves a `ForAllValues:`
`Allow` overly permissive, and asks for a `Null` check with a `false` value beside it. Write the
guard and sim IAM evaluates it.

An operator carrying the `IfExists` suffix answers true for an absent key, and compares a key the
request does carry as the operator without the suffix would. `StringLikeIfExists` on
`ec2:InstanceType` constrains the instance type where a request has one and passes over the requests
that have none.

`Null` asks whether the request carries a value for a context key rather than comparing one. `"true"`
matches where the key is absent and `"false"` where it is present. A key carrying an empty string or
an empty list of values counts as absent, which is the null dataset AWS describes. The two values
can also be written as JSON booleans. Any other policy value leaves the condition matching nothing.

```json
"Condition": {
  "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["ORDER#*"] },
  "Null": { "dynamodb:LeadingKeys": "false" }
}
```

### Statements left unevaluated

A keyword IAM does not define, such as a misspelt operator or `ForAnyValue:Null`, fails closed. IAM
refuses such a policy when it is written. A resource policy handed straight to `authorize`, or a
service control policy, can still carry one into the simulator. The statement holding it matches nothing, and a `Deny` written that
way stops nothing. The request then goes through on whatever else allows it,
which is how a guardrail comes to report a healthy Allow. `decision.unevaluatedStatements` reports
each of those statements, with the policy it came from (`policy`), how that policy reached the
request (`sourceType`), the statement as its document declared it (`statement`), and the operator
the simulator could not evaluate (`reason`).

Every operator in a condition block is read, and an unsupported one leaves the rest of the block
evaluated as usual. A statement reaches the list once everything else about it has matched. Its
Principal, Action and Resource applied to the request, and the unsupported operator was the only
thing standing between the statement and the request. A decision reached over policies the
simulator read in full reports an empty list, and a test asserting on a guardrail can say so.

```typescript sim-iam-unevaluated-statements
/**
 * Reporting simulated IAM statements that could not be evaluated.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

simAws.organizations().attachServiceControlPolicy(
  "123456789012",
  {
    Version: "2012-10-17",
    Statement: {
      Sid: "DenyBucketCreationAfterFreeze",
      Effect: "Deny",
      Action: "s3:CreateBucket",
      Resource: "*",
      Condition: {
        DateAfter: { "aws:CurrentTime": "2026-01-01T00:00:00Z" },
      },
    },
  },
  { policyName: "BucketGuardrail" },
);

const decision = simAws.account("123456789012").iam().authorize({
  action: "s3:CreateBucket",
  resource: "arn:aws:s3:::123456789012-reports",
});

const [unevaluated] = decision.unevaluatedStatements;

console.log(decision.isAllowed); // true
console.log(unevaluated?.policy); // "BucketGuardrail"
console.log(unevaluated?.reason); // "unsupported condition operator DateAfter"
```

## Users and access keys

Create Users with `CreateUserCommand`, give them inline policies with `PutUserPolicyCommand`, and
issue access keys with `CreateAccessKeyCommand`. Access keys are registered with the Account's
credential registry. Credentials can then be supplied as the caller of an authorization attempt,
and are authenticated before policy evaluation.

`DeleteUserCommand` removes a User. IAM refuses it with `DeleteConflict` while the User still holds
an inline or attached policy, an access key, a login profile or a group membership, and answers
`NoSuchEntity` for a name the Account does not hold. Take each off first with the commands below.

```typescript sim-iam-user-access-key
/**
 * Simulated IAM Users, inline policies, and access keys.
 */

import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simIam = simAws.account("123456789012").iam();

await simIam.createUser(
  new CreateUserCommand({
    UserName: "ApplicationUser",
    Path: "/application/",
  }),
);

await simIam.putUserPolicy(
  new PutUserPolicyCommand({
    UserName: "ApplicationUser",
    PolicyName: "ReadAssets",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::assets-bucket/*",
      },
    }),
  }),
);

const accessKeyCreation = await simIam.createAccessKey(
  new CreateAccessKeyCommand({
    UserName: "ApplicationUser",
  }),
);

const decision = simIam.authorize({
  action: "s3:GetObject",
  resource: "arn:aws:s3:::assets-bucket/images/logo.svg",
  caller: {
    kind: "credentials",
    credentials: {
      accessKeyId: accessKeyCreation.AccessKey.AccessKeyId,
      secretAccessKey: accessKeyCreation.AccessKey.SecretAccessKey,
    },
  },
});

console.log(decision.isAllowed);
console.log(decision.caller.arn);
```

Invalid credentials throw an AWS-like error before any policies are evaluated, with a diagnostic
reason such as an unknown access key, a secret access key mismatch, or an expired session.

`AttachUserPolicyCommand` attaches a managed Policy to a User by ARN, the way
`AttachRolePolicyCommand` does for a Role. `ListAttachedUserPoliciesCommand` lists what a User has
attached. An [AWS-managed policy](#aws-managed-policies) grants a User what it grants a Role.

`CreateLoginProfileCommand` gives a User a console password. The response describes the profile
without the password, which is how real IAM behaves. See
[CloudFormation Users](#users) for reading the password back out of the simulator.
`GetLoginProfileCommand` describes the profile the same way, and `DeleteLoginProfileCommand` removes
it.

`GetUserCommand` describes a User, and `ListUsersCommand` lists the Account's Users in name order
under an optional `PathPrefix`. `GetUserPolicyCommand` answers an inline policy's document
URL-encoded, as IAM sends it. `ListUserPoliciesCommand` lists the inline policy names.
`DeleteUserPolicyCommand` and `DetachUserPolicyCommand` take a policy off, and the grant goes with it
from the next request.

`ListAccessKeysCommand` lists a User's keys without their secrets. `UpdateAccessKeyCommand` makes a
key `Inactive` or `Active` again, and an inactive key authenticates nothing.
`DeleteAccessKeyCommand` removes a key, which fails authentication from then on. `GetUserCommand`,
`ListAccessKeysCommand` and the access key commands act on the calling User when the command leaves
`UserName` out. A caller that is no User of the Account, such as a Role session, gets
`ValidationError` and has to name one.

`UpdateUserCommand` renames a User with `NewUserName`, moves it with `NewPath`, or both. The User
keeps its ID, its policies, its groups and its access keys, and a request signed with one of its
keys is made as the User under its new name. The caller needs `iam:UpdateUser` on the User's ARN as
it is and as it will be.

## Groups

A group holds policies for the Users in it. A User gets the inline and managed policies of every
group it is in as well as its own, from its next request. A group is never a principal, so a policy
cannot name one and a group cannot make a request.

```typescript sim-iam-groups
/**
 * Granting a User what its group allows.
 */

import {
  AddUserToGroupCommand,
  AttachGroupPolicyCommand,
  CreateGroupCommand,
  CreateUserCommand,
  RemoveUserFromGroupCommand,
} from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simIam = new SimAws().account("123456789012").iam();

await simIam.createGroup(new CreateGroupCommand({ GroupName: "Readers" }));
await simIam.attachGroupPolicy(
  new AttachGroupPolicyCommand({
    GroupName: "Readers",
    PolicyArn: "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
  }),
);
await simIam.createUser(new CreateUserCommand({ UserName: "analyst" }));

const mayRead = (): boolean =>
  simIam.authorize({
    action: "s3:GetObject",
    resource: "arn:aws:s3:::reports-bucket/summary.csv",
    caller: { kind: "arn", arn: "arn:aws:iam::123456789012:user/analyst" },
  }).isAllowed;

const membership = { GroupName: "Readers", UserName: "analyst" };
await simIam.addUserToGroup(new AddUserToGroupCommand(membership));
console.log(mayRead()); // true

await simIam.removeUserFromGroup(new RemoveUserFromGroupCommand(membership));
console.log(mayRead()); // false
```

`CreateGroupCommand`, `GetGroupCommand` (which lists the members), `ListGroupsCommand`,
`ListGroupsForUserCommand` and `DeleteGroupCommand` manage the groups themselves. The inline and
managed policy commands match the Role and User ones: `PutGroupPolicyCommand`,
`GetGroupPolicyCommand`, `ListGroupPoliciesCommand`, `DeleteGroupPolicyCommand`,
`AttachGroupPolicyCommand`, `DetachGroupPolicyCommand` and `ListAttachedGroupPoliciesCommand`.
`DeleteGroupCommand` refuses a group that still has a member or a policy with `DeleteConflict`.
`UpdateGroupCommand` renames a group or moves it to another path, and its Users stay in it.

## Instance profiles

An instance profile is how EC2 hands a Role to an instance. It holds one Role at most, and adding a
Role needs `iam:PassRole` on it, with `iam:PassedToService` set to `ec2.amazonaws.com`. The simulator
runs no EC2 instances, and a profile holds its Role for whatever reads it back. A Role in a
profile cannot be deleted until it is taken out.

```typescript sim-iam-instance-profiles
/**
 * An instance profile holding a Role.
 */

import {
  AddRoleToInstanceProfileCommand,
  CreateInstanceProfileCommand,
  CreateRoleCommand,
  DeleteRoleCommand,
  GetInstanceProfileCommand,
} from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simIam = new SimAws().account("123456789012").iam();

await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "WebServer",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "ec2.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    }),
  }),
);
await simIam.createInstanceProfile(
  new CreateInstanceProfileCommand({ InstanceProfileName: "Web" }),
);
await simIam.addRoleToInstanceProfile(
  new AddRoleToInstanceProfileCommand({
    InstanceProfileName: "Web",
    RoleName: "WebServer",
  }),
);

const { InstanceProfile } = await simIam.getInstanceProfile(
  new GetInstanceProfileCommand({ InstanceProfileName: "Web" }),
);
console.log(InstanceProfile.Roles.map((role) => role.RoleName)); // ["WebServer"]

try {
  await simIam.deleteRole(new DeleteRoleCommand({ RoleName: "WebServer" }));
} catch (error) {
  console.log(error instanceof Error ? error.name : "unknown error");
  // "DeleteConflict"
}
```

`CreateInstanceProfileCommand` takes `Path` and `Tags` as well as the name. `GetInstanceProfileCommand`
and `ListInstanceProfilesCommand` describe each profile with the Role it holds, and
`ListInstanceProfilesForRoleCommand` lists the profiles holding one Role.
`RemoveRoleFromInstanceProfileCommand` takes the Role out, and `DeleteInstanceProfileCommand`
refuses a profile still holding one with `DeleteConflict`.

## Tags and principal keys

Roles and Users carry tags. `CreateRoleCommand` and `CreateUserCommand` take them as `Tags`, and
`TagRoleCommand`, `UntagRoleCommand` and `ListRoleTagsCommand` change and read a Role's tags
afterwards (with `TagUserCommand`, `UntagUserCommand` and `ListUserTagsCommand` for a User).
`GetRoleCommand` describes a Role's tags and leaves `Tags` out for an untagged Role, as IAM does. An
`AWS::IAM::Role` or `AWS::IAM::User` declaring `Tags` is created with them, so the tags CDK's
`Tags.of(...)` puts on a stack reach its Roles.

IAM's rules for a Role's or a User's tags apply. Keys compare without regard to case and keep the case
they were written in, so tagging a Role carrying `Department=finance` with `department=hr` replaces
the tag. A key under the reserved `aws:` prefix, or a request naming the same key twice, is refused
as `InvalidInput`. More than 50 tags is `LimitExceeded`. Untagging a key the entity does not carry
does nothing.

A Role's or a User's tags reach policies in three ways:

- A request the Role or User makes carries its tags as `aws:PrincipalTag/` and the tag key. A
  session of a Role carries the Role's tags
- A request acting on a Role or a User, such as `GetRole` or `PutRolePolicy`, carries its tags as
  both `iam:ResourceTag/` and `aws:ResourceTag/` and the tag key
- A request setting tags carries them as `aws:RequestTag/` and the tag key, with the keys together
  as `aws:TagKeys`. `UntagRole` and `UntagUser` carry the keys they remove as `aws:TagKeys`

Creating a Role with tags needs `iam:TagRole` as well as `iam:CreateRole`, and creating a User with
tags needs `iam:TagUser`, which is how IAM authorizes the request.

```typescript sim-iam-principal-tags
/**
 * Granting access by the tags of the Role making the request.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
const simIam = simAws.iam();

await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "ReportsReader",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::123456789012:root" },
        Action: "sts:AssumeRole",
      },
    }),
    Tags: [{ Key: "team", Value: "reports" }],
  }),
);

await simIam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ReportsReader",
    PolicyName: "ReadOwnTeamsObjects",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: "*",
        Condition: {
          StringEquals: {
            "s3:ExistingObjectTag/team": "reports",
            "aws:PrincipalTag/team": "reports",
          },
        },
      },
    }),
  }),
);

const decision = simIam.authorize({
  action: "s3:GetObject",
  resource: "arn:aws:s3:::reports-bucket/summary.csv",
  caller: {
    kind: "arn",
    arn: "arn:aws:iam::123456789012:role/ReportsReader",
  },
  conditionContext: { "s3:ExistingObjectTag/team": "reports" },
});

console.log(decision.isAllowed); // true
```

Every request also carries the keys AWS uses to describe its caller:

| Caller       | `aws:PrincipalType` | `aws:userid`                | `aws:username` |
| ------------ | ------------------- | --------------------------- | -------------- |
| Account root | `Account`           | the Account ID              | absent         |
| IAM User     | `User`              | the User's ID               | the User name  |
| Role session | `AssumedRole`       | the Role's ID, `:`, session | absent         |
| Anonymous    | `Anonymous`         | `anonymous`                 | absent         |

A caller with an ARN carries its Account as `aws:PrincipalAccount`, and an anonymous caller carries
`anonymous` there. `aws:PrincipalIsAWSService` is `true` for a service principal, which names itself
in `aws:PrincipalServiceName`, and `false` for any other signed request. An anonymous request carries
no `aws:PrincipalIsAWSService`. IAM supplies every one of these keys itself, and drops any a service
passes in its `conditionContext`. A caller named by a Role's own ARN stands for a session of that Role. It is described
as an `AssumedRole` carrying the Role's tags, without an `aws:userid`, because it has no session
name.

## Policy variables

A policy written in the `2012-10-17` language can name request values as variables, such as
`${aws:username}` or `${aws:PrincipalTag/team}`. Sim IAM replaces them from the request's condition
context in the places AWS does:

- The resource part of a `Resource` or `NotResource` ARN, after its fifth colon. A variable in the
  service, Region or Account stays literal text
- The values of the String and ARN condition operators. Under a Numeric, Date, Bool, Binary or IP
  address operator, `${...}` is literal text

A policy with no `Version`, or with `2008-10-17`, reads every `${...}` as literal text.

```typescript sim-iam-policy-variables
/**
 * Confining each User to its own prefix with one shared policy.
 */

import { CreateUserCommand, PutUserPolicyCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
const simIam = simAws.iam();

await simIam.createUser(new CreateUserCommand({ UserName: "analyst" }));

await simIam.putUserPolicy(
  new PutUserPolicyCommand({
    UserName: "analyst",
    PolicyName: "OwnHomePrefix",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:GetObject",
        // eslint-disable-next-line no-template-curly-in-string
        Resource: "arn:aws:s3:::homes-bucket/${aws:username}/*",
      },
    }),
  }),
);

const read = (key: string): boolean =>
  simIam.authorize({
    action: "s3:GetObject",
    resource: `arn:aws:s3:::homes-bucket/${key}`,
    caller: { kind: "arn", arn: "arn:aws:iam::123456789012:user/analyst" },
  }).isAllowed;

console.log(read("analyst/notes.txt")); // true
console.log(read("auditor/notes.txt")); // false
```

A variable names a context key without regard to case. It can give a default in single quotes after
a comma (`${aws:PrincipalTag/team, 'shared'}`), which stands in where the request carries no value
for the key. A list-valued key such as `aws:TagKeys` has no value as a variable.

A variable with no value and no default leaves its policy value with none. A `Resource` or
`NotResource` entry holding one matches no resource. Under a positive operator such as
`StringEquals` the value matches nothing, and under a negated one such as `StringNotEquals` it
matches every request value.

`${*}`, `${?}` and `${$}` stand for an asterisk, a question mark and a dollar sign. In a wildcard
pattern (`StringLike`, the ARN operators and `Resource`), the asterisk and question mark they give
match only themselves. So do any a replaced value carries.

## STS AssumeRole sessions

Simulated STS issues temporary credentials for IAM Roles with `AssumeRoleCommand`. The assume
request is evaluated against the Role's trust policy, and the returned credentials resolve to an
assumed-role session principal whose permissions come from the underlying Role's policies.

A session carries two ARNs, the session's own and the Role's, and a resource policy naming either
one applies to it. A Bucket policy naming a Role therefore covers every session of that Role, as it
does in AWS, and `aws:PrincipalArn` holds the Role's ARN throughout.

```typescript sim-iam-sts-assume-role
/**
 * Assuming a simulated IAM Role through simulated STS.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const account = simAws.account("123456789012");
const simIam = account.iam();

await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "DeploymentRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::123456789012:root" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simIam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "DeploymentRole",
    PolicyName: "PutDeploymentObjects",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:PutObject",
        Resource: "arn:aws:s3:::deployments-bucket/*",
      },
    }),
  }),
);

const assumeRoleOutput = await account.sts().assumeRole(
  new AssumeRoleCommand({
    RoleArn: "arn:aws:iam::123456789012:role/DeploymentRole",
    RoleSessionName: "deploy-session",
  }),
);

const credentials = assumeRoleOutput.Credentials!;

const decision = simIam.authorize({
  action: "s3:PutObject",
  resource: "arn:aws:s3:::deployments-bucket/release.zip",
  caller: {
    kind: "credentials",
    credentials: {
      accessKeyId: credentials.AccessKeyId!,
      secretAccessKey: credentials.SecretAccessKey!,
      sessionToken: credentials.SessionToken!,
    },
  },
});

console.log(decision.isAllowed);
console.log(decision.caller.arn);
```

The resolved caller ARN is the STS assumed-role session ARN, such as
`arn:aws:sts::123456789012:assumed-role/DeploymentRole/deploy-session`, while identity policies and
the derived `aws:PrincipalArn` come from the underlying Role. A caller that the trust policy does
not allow is denied the assume request, session credentials require their session token, and
expired sessions are rejected.

A session assumed with `Policy` or `PolicyArns` is capped by those session policies as well as by
the Role's own policies and [permissions boundary](#permissions-boundaries). The same principal
rules apply. A resource policy naming the session ARN allows the request past a session policy,
and one naming the Role is held back by it.
[Session policies in simulated STS](https://yulinsim.dev/services/sts/#session-policies "Simulated STS session policies usage docs")
covers the request side.

## Name the caller a simulation uses by default

Every simulated operation takes a `caller`, and a call that gives none is decided as the root
principal of the Account it reaches. `defaultCaller` on `SimAws` names a principal for those calls,
such as the Role an operator would be reading the account through.

```typescript sim-iam-default-caller
/**
 * Naming who a call that states no caller comes from.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({
  defaultAccountId: "123456789012",
  defaultCaller: {
    kind: "arn",
    arn: "arn:aws:iam::123456789012:role/Administrator",
  },
});

// The Role is created inside a run as the Account root. A simulation with a
// default caller attributes these commands to it, and it holds no policy until
// they are done.
const simIam = simAws.iam();

await simAws.runAs(simAws.account().rootPrincipal, async () => {
  await simIam.createRole(
    new CreateRoleCommand({
      RoleName: "Administrator",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: "arn:aws:iam::123456789012:root" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simIam.putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "Administrator",
      PolicyName: "Administer",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: { Effect: "Allow", Action: "*", Resource: "*" },
      }),
    }),
  );
});

const decision = simAws.iam().authorize({
  action: "s3:GetObject",
  resource: "arn:aws:s3:::reports-bucket/summary.csv",
});

console.log(decision.caller.arn); // "arn:aws:iam::123456789012:role/Administrator"
console.log(decision.isAllowed); // true
```

`defaultCaller` takes a principal or a caller resolved elsewhere, such as an assumed-role session
carrying the Role its policies come from. Credentials are the one caller it refuses. Only the
Account that issued a key can authenticate it, and a default is held for a whole simulation.

The default reaches a direct sim service call, an intercepted SDK Command, a CloudFormation
deployment and STS. Three things outrank it, each of them a caller stated for the request in hand.
An operation's own `caller` wins, as does the ambient caller of a `runAs` block (covered in
[Run a block of calls as one caller](#run-a-block-of-calls-as-one-caller)) and the `caller` a
deployment is given.

A simulation told no `defaultCaller` decides an unattributed call as the Account root, which is what
every simulation did before the option existed. The root keeps the identity access sim IAM gives it
either way, and a test about root behaviour reaches it as `simAws.account().rootPrincipal`. A
service control policy denying that root still overrides the access.

The reason to name one is a service control policy denying the Account root.
[Simulated Organizations](https://yulinsim.dev/services/organizations/) covers that case, where
every unattributed read is otherwise denied on a message about the root.

## Run a block of calls as one caller

`simAws.runAs(caller, run)` sets an ambient caller for the length of a run. Everything called during
the run is attributed to that principal, and the code being tested says nothing about it.

```typescript sim-iam-run-as
/**
 * Attributing a block of calls to one simulated caller.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
const simIam = simAws.iam();

await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "Reporter",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::123456789012:root" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simIam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "Reporter",
    PolicyName: "ReadParameters",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "ssm:GetParameter", Resource: "*" },
    }),
  }),
);

await simAws.ssm().putParameter({
  input: { Name: "/reports/last-run", Type: "String", Value: "done" },
});

const reporter = "arn:aws:iam::123456789012:role/Reporter";

await simAws.runAs({ kind: "arn", arn: reporter }, async () => {
  // The read is a direct sim service call, decided as the Reporter Role.
  const read = await simAws
    .ssm()
    .getParameter({ input: { Name: "/reports/last-run" } });

  const write = simIam.authorize({
    action: "ssm:PutParameter",
    resource: "*",
  });

  console.log(read.Parameter?.Value); // "done"
  console.log(write.caller.arn); // "arn:aws:iam::123456789012:role/Reporter"
  console.log(write.isDenied); // true
});
```

The ambient caller reaches a direct sim service call and an intercepted SDK Command. An operation's
own `caller` still wins, and `deployTemplate` and `deployCdkOut` take a `caller` of their own. Runs
nest, and the innermost caller applies.

A run belongs to the `SimAws` instance it was started on. Two simulations in one test file are two
simulated universes, and a run on one leaves the other's calls where they were.

Simulated Lambda and ECS set an ambient caller the same way. A Lambda handler runs as the function's
execution Role and an ECS container runs as its task Role. A direct sim service call from inside
either is decided as that Role, matching what the deployed code has credentials for.

This is also how a simulation bootstraps the principal its own `defaultCaller` names. That Role has
to be created before it can decide anything, and the creation therefore runs as something else.
Wrapping it in `runAs(simAws.account().rootPrincipal, ...)` is the shape for that, since sim IAM
gives the Account root unrestricted access.

## Callers of HTTP requests

An in-process SDK call can be told who its caller is. A request arriving over HTTP, through
`serveSimAws` or through `SimAwsHttp.fetch(...)` in the same process, carries no such thing. Sim IAM
works the caller out from the request itself, in a fixed order:

1. An `x-sim-aws-caller` header naming the principal directly.
2. An `Authorization: AWS4-HMAC-SHA256` header, verified as a SigV4 signature.
3. Failing both, **anonymous**.

Sim IAM treats an omitted in-process caller as the Account root with unrestricted access, a
convenience inside a test. Over HTTP the same default would make every unauthenticated request an
administrator. A served request that says nothing about who sent it is anonymous.

### Naming the caller directly

`x-sim-aws-caller` names the principal outright. It is the path for local development and for
tooling that will not sign requests. A curl one-liner can be a Role without holding any credentials.

```bash
curl -H 'x-sim-aws-caller: arn:aws:iam::111111111111:role/Reporter' \
  http://abc123.lambda-url.us-east-1.sim-aws.localhost:4566/
```

The value is one of three forms:

| Value            | Principal                                                    |
| ---------------- | ------------------------------------------------------------ |
| An ARN           | That IAM User, Role, or assumed-role session                 |
| `service:<name>` | An AWS service principal, such as `service:s3.amazonaws.com` |
| `anonymous`      | Explicitly anonymous                                         |

The header is always enabled and not configurable, and it takes precedence over a valid signature.
The ARN it names is taken as given, since naming a principal is a separate thing from claiming it
was created, exactly as `runAs` behaves. The header is stripped before the request reaches the
simulated service. A Lambda handler echoing `event.headers` sees none of the simulator's control
metadata.

`x-sim-aws-source-ip` is a control header of the same kind. It names the client address a request
comes from (one IPv4 or IPv6 address), and a request naming none comes from `127.0.0.1`. A web ACL
reads it (see
[where a request comes from](https://yulinsim.dev/services/wafv2/#where-a-request-comes-from)). IAM
policy evaluation does not read it.

```typescript sim-iam-served-request-caller
/**
 * Naming the caller of an HTTP request into simulated AWS.
 */

import {
  AddPermissionCommand,
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "reporter",
    Role: "arn:aws:iam::111111111111:role/ReporterRole",
    Code: { ZipFile: makeLambdaZipFileInput(() => ({ ok: true })) },
  }),
);

const urlConfig = await simAws.lambda().createFunctionUrlConfig(
  new CreateFunctionUrlConfigCommand({
    FunctionName: "reporter",
    AuthType: "NONE",
  }),
);

// The two grants a NONE URL needs before it serves anyone.
await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "reporter",
    StatementId: "FunctionURLAllowPublicAccess",
    Action: "lambda:InvokeFunctionUrl",
    Principal: "*",
    FunctionUrlAuthType: "NONE",
  }),
);
await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "reporter",
    StatementId: "FunctionURLInvokeAllowPublicAccess",
    Action: "lambda:InvokeFunction",
    Principal: "*",
    InvokedViaFunctionUrl: true,
  }),
);

const srv = await serveSimAws({ simAws });

try {
  const response = await fetch(srv.localUrl(urlConfig.FunctionUrl), {
    headers: { "x-sim-aws-caller": "arn:aws:iam::111111111111:role/Reporter" },
  });

  // arn:aws:iam::111111111111:role/Reporter
  console.log(response.headers.get("x-sim-aws-caller"));
  // caller-header
  console.log(response.headers.get("x-sim-aws-auth"));
} finally {
  await srv.close();
}
```

### Naming what the request is for

When one AWS service calls another it says which of your resources it is calling for, and IAM
supplies that as `aws:SourceArn` and `aws:SourceAccount`. A resource policy granting a service
principal is usually conditioned on them, so that a Bucket policy or a function's resource policy
admits one Distribution rather than every CloudFront customer. Two more headers say the same thing
over HTTP:

| Header                     | Condition key       |
| -------------------------- | ------------------- |
| `x-sim-aws-source-arn`     | `aws:SourceArn`     |
| `x-sim-aws-source-account` | `aws:SourceAccount` |

```bash
curl -H 'x-sim-aws-caller: service:cloudfront.amazonaws.com' \
  -H 'x-sim-aws-source-arn: arn:aws:cloudfront::111111111111:distribution/E1EXAMPLE12345' \
  http://abc123.lambda-url.us-east-1.sim-aws.localhost:4566/
```

A request that supplies neither header leaves both condition keys unset, and an unset key is a
different thing from an empty one. A statement conditioned on either key fails to match. Both
headers are stripped before the request reaches the simulated service, as the caller header is.

Sim CloudFront sends these itself when a Distribution reaches a custom Origin through an origin
access control. That is how an `AWS_IAM` Lambda Function URL behind CloudFront is admitted.
Simulated Lambda Function URLs are the only endpoint evaluating them so far.

### Signed requests

A request signed with credentials from `CreateAccessKeyCommand` or from an STS `AssumeRoleCommand`
session is verified as a SigV4 signature and resolves to the signing principal, with the same
identity `resolveCredentials` returns in process. For an assumed-role session that means the
request is attributed to the session while its permissions come from the Role behind it. A policy
on the Role applies to a request the session signed.

Sign the URL you actually call. Serving rewrites AWS endpoint hostnames to local ones, and a
Function URL is served at `<url-id>.lambda-url.<region>.sim-aws.localhost:<port>`. The `host` header
is part of what a signature covers. A signature made against the real AWS hostname fails against the
local one.

A signature whose credential scope names a different service or Region than the endpoint it reached
is refused before anything else is checked, and says so. The scope feeds the signing key. Without
that check the only symptom would be a bare signature mismatch.

### Presigned URLs

A URL carrying its signature in query parameters is verified the same way. `X-Amz-Algorithm` in the
query is what marks it, and the access key, credential scope, signed headers and signature all come
from the query string. A presigned URL also states its own lifetime in `X-Amz-Expires`, and that
_is_ enforced, against simulated time. A frozen clock keeps a URL usable, and advancing past the
window refuses it with `AccessDenied` and `Request has expired`.

URLs built by the real presigner, `getSignedUrl` from `@aws-sdk/s3-request-presigner`, verify here
without anything simulator-specific. See
[the sim S3 docs](https://yulinsim.dev/services/s3/#presigned-urls) for the whole path from presigning to fetching.

### What the simulator reports back

Every served response carries the simulator's own account of the request in headers, leaving the
response body the shape the real service returns. Which headers appear depends on whether the
request was accepted:

| Header                   | On an accepted request                                                                   | On a refused request                                |
| ------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `x-sim-aws-caller`       | The principal the request was attributed to, in the same form the request header accepts | Absent, as there is no principal to report          |
| `x-sim-aws-auth`         | How that was decided: `caller-header`, `sigv4`, or `none`                                | `rejected`                                          |
| `x-sim-aws-error`        | Absent                                                                                   | The AWS error code, such as `SignatureDoesNotMatch` |
| `x-sim-aws-error-detail` | Absent                                                                                   | What the simulator can say about why                |

A refused request is answered as real AWS answers it. A rejected signature gets `403` with
`{"Message":"Forbidden"}`. A signature too incomplete to parse, or an `x-sim-aws-caller` value that
names no principal form, gets `400`. Real AWS has nowhere in that body to explain itself, and this
follows it. The detail goes in `x-sim-aws-error-detail`, out of the way of a client parsing the
response.

## Authorizing other simulated services

Simulated services use sim IAM to authorize their own actions when used through `SimAws`. Route53
commands such as `CreateHostedZoneCommand`, `GetHostedZoneCommand`,
`ChangeResourceRecordSetsCommand`, `ListHostedZonesByNameCommand`, and
`ListResourceRecordSetsCommand` accept an optional caller, letting tests exercise real allow/deny
behaviour across services.

```typescript sim-iam-route53-authorization
/**
 * Simulated IAM authorization of Route53 actions.
 */

import { CreateRoleCommand } from "@aws-sdk/client-iam";
import { CreateHostedZoneCommand } from "@aws-sdk/client-route-53";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const account = simAws.account("123456789012");
const simIam = account.iam();
const simRoute53 = account.route53();

const roleCreation = await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "UnprivilegedRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::123456789012:root" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

try {
  await simRoute53.createHostedZone(
    new CreateHostedZoneCommand({
      Name: "denied.example.test",
      CallerReference: "denied-ref",
    }),
    {
      caller: { kind: "arn", arn: roleCreation.Role.Arn },
    },
  );
} catch (error) {
  console.error("Hosted Zone creation denied", error);
}

await simRoute53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "allowed.example.test",
    CallerReference: "allowed-ref",
  }),
);
```

A denied action throws an AWS-like access-denied error with a `403` status code and the attempted
action, resource, and caller for diagnostics, before the service mutates any state. Omitting the
caller defaults to the Account root. The Account root is allowed within its own Account, and a test
that never mentions IAM keeps working.

## Passing a Role to a service

A simulated service handed a Role keeps it and uses it later, under its own identity. AWS asks two
questions about that. The first is whether the caller may create the thing. The second is whether the
caller may hand that Role over, and its resource is the Role.

Six simulated services ask the second question. A caller allowed the create action and refused
`iam:PassRole` fails the request with an access-denied error naming the Role and the caller. A scoped
deployment role refused `iam:PassRole` is one of the commoner ways a real deployment stops, and a
deployment through
[simulated CloudFormation](https://yulinsim.dev/services/cloudformation/ "Simulated CloudFormation usage docs")
carries the same decision to every Resource it creates.

| Request                                                | The Role it hands over                   | `iam:PassedToService`     |
| ------------------------------------------------------ | ---------------------------------------- | ------------------------- |
| Lambda `CreateFunction`, `UpdateFunctionConfiguration` | `Role`                                   | `lambda.amazonaws.com`    |
| Scheduler `CreateSchedule`, `UpdateSchedule`           | `Target.RoleArn`                         | `scheduler.amazonaws.com` |
| EventBridge `PutTargets`                               | a target's `RoleArn`                     | `events.amazonaws.com`    |
| Step Functions `CreateStateMachine`                    | `roleArn`                                | `states.amazonaws.com`    |
| ECS `RegisterTaskDefinition`                           | `taskRoleArn` and `executionRoleArn`     | `ecs-tasks.amazonaws.com` |
| Firehose `CreateDeliveryStream`                        | the destination Role and the source Role | `firehose.amazonaws.com`  |

Each Role is a separate decision, so a caller allowed one of an ECS task definition's two Roles is
refused on the other. A request leaving an optional Role out passes nothing and is asked nothing.

The condition key `iam:PassedToService` carries the service principal the Role goes to. A
CDK-generated deployment policy commonly conditions its `iam:PassRole` statement on that key, and a
policy written that way matches here.

```typescript sim-iam-pass-role
/**
 * Authorizing the execution role a Lambda function is created with.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand } from "@aws-sdk/client-lambda";
import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
const simIam = simAws.iam();

const deployerCreation = await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "Deployer",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "cloudformation.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simIam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "Deployer",
    PolicyName: "DeployFunctions",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        { Effect: "Allow", Action: "lambda:CreateFunction", Resource: "*" },
        {
          Effect: "Allow",
          Action: "iam:PassRole",
          Resource: "arn:aws:iam::123456789012:role/ReportsExecutionRole",
          Condition: {
            StringEquals: { "iam:PassedToService": "lambda.amazonaws.com" },
          },
        },
      ],
    }),
  }),
);

const asDeployer = {
  caller: { kind: "arn", arn: deployerCreation.Role.Arn },
} as const;

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "reports",
    Role: "arn:aws:iam::123456789012:role/ReportsExecutionRole",
    Code: { ZipFile: makeLambdaZipFileInput(() => null) },
  }),
  asDeployer,
);

try {
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "invoices",
      Role: "arn:aws:iam::123456789012:role/AdminRole",
      Code: { ZipFile: makeLambdaZipFileInput(() => null) },
    }),
    asDeployer,
  );
} catch (error) {
  console.error("Passing AdminRole to Lambda was refused", error);
}

await simAws.backgroundTasksComplete();
```

A request naming no caller is decided as the Account root, which may pass any Role. A test that never
mentions IAM keeps working.

## Creating a Role under a permissions boundary

An account that requires every Role to carry a permissions boundary allows `iam:CreateRole` only
under `StringEquals` on `iam:PermissionsBoundary`. Its CloudFormation execution policy is written
that way, and the CDK `PermissionsBoundary.fromName(...)` aspect puts the boundary ARN on every Role
the app synthesizes. A `CreateRoleCommand` carrying `PermissionsBoundary` supplies the key, and
`AWS::IAM::Role` supplies it from the template property of the same name.

A request that leaves the property out leaves the key unset. A positive operator over an unset key
matches nothing, and the guard refuses the Role. A request naming some other policy is refused the
same way. A test can assert both refusals, and that is what makes the policy worth standing up as a
deploy Role.

`CreateRole` and `GetRole` then describe the boundary the Role carries, in the attachment shape IAM
answers with (`PermissionsBoundaryType` and `PermissionsBoundaryArn`). `ListRoles` leaves the field
out, as IAM does, and points a caller at `GetRole`. `CreateUser` checks and describes a User's
boundary the same way. What a boundary then allows is covered in
[Permissions boundaries](#permissions-boundaries).

```typescript sim-iam-permissions-boundary
/**
 * Deploying into an account that requires a permissions boundary.
 */

import { GetRoleCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
const boundaryArn = "arn:aws:iam::123456789012:policy/DeveloperBoundary";

const deployer = await simAws.iam().makeDeployRole({
  roleName: "cfn-exec",
  policyDocument: {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "iam:CreateRole",
        Resource: "*",
        Condition: {
          StringEquals: { "iam:PermissionsBoundary": boundaryArn },
        },
      },
      {
        Effect: "Allow",
        Action: ["cloudformation:*", "iam:PutRolePolicy", "iam:PassRole"],
        Resource: "*",
      },
    ],
  },
});

const jobRoleTrust = {
  Version: "2012-10-17",
  Statement: {
    Effect: "Allow",
    Action: "sts:AssumeRole",
    Principal: { Service: "lambda.amazonaws.com" },
  },
};

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "guarded-stack",
  template: {
    Resources: {
      JobRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "JobRole",
          PermissionsBoundary: boundaryArn,
          AssumeRolePolicyDocument: jobRoleTrust,
        },
      },
    },
  },
  caller: deployer,
});

// CREATE_COMPLETE
console.log(stack.getResource("JobRole")?.status);

const roleRead = await simAws
  .iam()
  .getRole(new GetRoleCommand({ RoleName: "JobRole" }));

// arn:aws:iam::123456789012:policy/DeveloperBoundary
console.log(roleRead.Role.PermissionsBoundary?.PermissionsBoundaryArn);

try {
  await simAws.cloudFormation().deployTemplate({
    stackName: "unguarded-stack",
    template: {
      Resources: {
        BareRole: {
          Type: "AWS::IAM::Role",
          Properties: {
            RoleName: "BareRole",
            AssumeRolePolicyDocument: jobRoleTrust,
          },
        },
      },
    },
    caller: deployer,
  });
} catch (error) {
  console.error("A Role declaring no boundary was refused", error);
}
```

## Permissions boundaries

A permissions boundary caps what a User's or a Role's identity policies can grant. Set one with
`PermissionsBoundary` on `CreateUserCommand` or `CreateRoleCommand`, or with the template property of
the same name on `AWS::IAM::User` and `AWS::IAM::Role`. `PutUserPermissionsBoundaryCommand` and
`PutRolePermissionsBoundaryCommand` set or replace one afterwards, and
`DeleteUserPermissionsBoundaryCommand` and `DeleteRolePermissionsBoundaryCommand` take it off. A
policy conditioned on `iam:PermissionsBoundary` is tested against the boundary being put. The
boundary is a managed policy, either one
the Account created or an AWS-managed one from the [catalogue](#aws-managed-policies). It grants
nothing itself.

A request goes ahead only where the boundary and an identity policy both allow it. A Deny statement
in the boundary denies the request outright, as a Deny anywhere else does. A boundary naming a
policy the simulation cannot find allows nothing. A session of a Role carries that Role's boundary.

```typescript sim-iam-permissions-boundary-evaluation
/**
 * Capping what a User's own policies grant with a permissions boundary.
 */

import {
  CreatePolicyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
const simIam = simAws.iam();

await simIam.createPolicy(
  new CreatePolicyCommand({
    PolicyName: "S3Only",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "s3:*", Resource: "*" },
    }),
  }),
);

await simIam.createUser(
  new CreateUserCommand({
    UserName: "analyst",
    PermissionsBoundary: "arn:aws:iam::123456789012:policy/S3Only",
  }),
);

await simIam.putUserPolicy(
  new PutUserPolicyCommand({
    UserName: "analyst",
    PolicyName: "Everything",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "*", Resource: "*" },
    }),
  }),
);

const caller = {
  kind: "arn" as const,
  arn: "arn:aws:iam::123456789012:user/analyst",
};

const read = simIam.authorize({
  action: "s3:GetObject",
  resource: "arn:aws:s3:::reports/q1.csv",
  caller,
});

console.log(read.isAllowed); // true

const send = simIam.authorize({
  action: "sqs:SendMessage",
  resource: "arn:aws:sqs:eu-west-2:123456789012:jobs",
  caller,
});

console.log(send.isAllowed); // false
// because no permissions boundary allows the sqs:SendMessage action
console.log(send.denialReason);
```

`denialReason` names the boundary where it is what stopped the request, in the words an AWS
AccessDenied message uses. `decision.principalLimits.permissionsBoundary` reports whether the caller
carries a boundary and which of its statements matched.

A resource policy can still allow what the boundary leaves out, depending on whom it names. AWS
draws the line by principal, and the simulator follows it:

- A statement naming the User, or an assumed-role session by its own ARN, allows the request past
  the boundary
- A statement whose principal is `*` does too
- A statement naming the Role behind a session, or the caller's Account, is held back by the
  boundary

A Deny in the boundary stops the request whatever a resource policy says. A caller from another
Account is capped by the boundary its own Account sets, and a cross-Account request needs that side
to allow it.

## A Role for a CloudFormation deployment

`makeDeployRole(...)` creates a Role from a policy document and hands back a caller. Pass it as
`caller` to `deployTemplate(...)`, `deployTemplateFile(...)` or `deployCdkOut(...)`, and every
resource the deployment creates is authorized against the document.

```typescript sim-iam-make-deploy-role
/**
 * Making a deploy Role from a policy document a project already holds.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

const deployer = await simAws.iam().makeDeployRole({
  roleName: "cdk-exec",
  policyDocument: {
    Version: "2012-10-17",
    Statement: {
      Effect: "Allow",
      Action: ["s3:*", "kms:*"],
      Resource: "*",
    },
  },
});

console.log(deployer.arn); // "arn:aws:iam::123456789012:role/cdk-exec"

await simAws
  .cloudFormation()
  .deployCdkOut({ directoryPath: "cdk.out", caller: deployer });
```

The Role trusts `cloudformation.amazonaws.com` and holds the document as an inline policy. A
deployment that asks for something the document leaves out fails the resource, with the Role's ARN in
the message.

`policyDocument` also takes the JSON a synthesized policy is carried as, and a list of documents for
a policy split in two to stay under IAM's size cap. Each document goes on the Role as its own inline
policy, and the Role is allowed the union of them.

```typescript sim-iam-deploy-role-documents
/**
 * A deploy Role from a policy split across two documents.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

const deployer = await simAws.iam().makeDeployRole({
  roleName: "cdk-exec",
  policyDocument: [
    JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "s3:*", Resource: "*" },
    }),
    {
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "kms:*", Resource: "*" },
    },
  ],
});

console.log(deployer.kind); // "arn"
```

Making the Role is two ordinary IAM commands. A simulation with a restrictive default caller has to
be allowed them, or the call wrapped in `simAws.runAs(...)`.

## CloudFormation IAM resources

Sim CloudFormation can create IAM resources from `AWS::IAM::Role`, `AWS::IAM::User`,
`AWS::IAM::Group`, `AWS::IAM::UserToGroupAddition`, `AWS::IAM::InstanceProfile`,
`AWS::IAM::ManagedPolicy` and `AWS::IAM::Policy`. An `AWS::IAM::Policy` puts its document onto each Role named in `Roles`, each
User named in `Users` and each group named in `Groups` as an inline policy. That is the shape CDK
grants such as `bucket.grantRead(fn)` and `bucket.grantRead(user)` synthesize as a "DefaultPolicy"
resource. Every entry names an entity in the Stack's Account. An entry naming no simulated entity
fails the resource, and so does a policy naming none at all.

A statement value of the wrong type fails the resource too. A `Ref` or an `Fn::GetAtt` naming a
Resource the template leaves out survives resolution and reaches IAM as an object where `Action` or
`Resource` takes a string. The put refuses it with `MalformedPolicyDocument`, naming the Role or
User, the policy and the statement holding it.

An `AWS::IAM::ManagedPolicy` also carries `Roles`, `Users` and `Groups`, and attaches itself to each
entity they name as it is created. A name no simulated entity in the Account answers to fails the
resource. Deleting the stack takes the policy back off whatever still carries it, and then deletes
the policy.

An `AWS::IAM::Group` creates a group from `GroupName` (generated like a Role name when left out),
`Path`, `Policies` and `ManagedPolicyArns`. `Ref` returns the group name and `Fn::GetAtt` supports
`Arn`. An `AWS::IAM::UserToGroupAddition` adds each User in `Users` to the group `GroupName` names,
and deleting it takes them back out.

An `AWS::IAM::InstanceProfile` creates an [instance profile](#instance-profiles) from
`InstanceProfileName` (generated like a policy name when left out) and `Path`, and puts the Role
`Roles` names in it. A template naming more than one Role fails the resource before the profile is
created. `Ref` returns the profile name and `Fn::GetAtt` supports `Arn`. Deleting the stack takes
the Role out and then deletes the profile.

A Role with no `RoleName`, a User with no `UserName` and a Managed Policy with no
`ManagedPolicyName` are each named from the stack name, the logical ID and a tail derived from both.
A `ServiceRole` in `iam-stack` becomes `iam-stack-ServiceRole-` and twelve more characters, where
real CloudFormation ends the name in twelve random ones. The case is kept as it was written, the way
IAM keeps it. A Role name and a User name are trimmed to 64 characters and a policy name to 128, and
[the CloudFormation docs](https://yulinsim.dev/services/cloudformation/#names-cloudformation-generates "Names CloudFormation generates")
cover how the stack name and the logical ID share what is left.

That name is what an IAM policy scoped by name prefix matches. A deploy Role allowed `iam:CreateRole`
on `arn:aws:iam::123456789012:role/iam-stack-*` covers the Roles its own stack creates, here and in
an account.

```typescript sim-iam-cloudformation
/**
 * Creating IAM resources through simulated CloudFormation.
 */

import { GetRoleCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "iam-stack",
  template: {
    Resources: {
      ServiceRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "LambdaExecutionRole",
          Path: "/service-role/",
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: {
              Effect: "Allow",
              Principal: { Service: "lambda.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          },
          Policies: [
            {
              PolicyName: "ReadReports",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: {
                  Effect: "Allow",
                  Action: "s3:GetObject",
                  Resource: "arn:aws:s3:::reports-bucket/*",
                },
              },
            },
          ],
        },
      },
      ReadOnlyPolicy: {
        Type: "AWS::IAM::ManagedPolicy",
        Properties: {
          ManagedPolicyName: "ReadOnlyAccess",
          Roles: [{ Ref: "ServiceRole" }],
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: {
              Effect: "Allow",
              Action: "s3:GetObject",
              Resource: "*",
            },
          },
        },
      },
    },
    Outputs: {
      RoleArn: {
        Value: {
          "Fn::GetAtt": ["ServiceRole", "Arn"],
        },
      },
      PolicyArn: {
        Value: {
          Ref: "ReadOnlyPolicy",
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

console.log(stack.output("RoleArn"));
console.log(stack.output("PolicyArn"));

const roleOut = await simAws.iam().getRole(
  new GetRoleCommand({
    RoleName: "LambdaExecutionRole",
  }),
);

console.log(roleOut.Role.Arn);
```

For `AWS::IAM::Role`, `Ref` returns the Role name and `Fn::GetAtt` supports `Arn` and `RoleId`. For
`AWS::IAM::ManagedPolicy`, `Ref` returns the Policy ARN. Both resource types default their name to
the logical ID when it is omitted, and inline `Policies` declared on a Role are stored as the
Role's inline policies. The `ReadOnlyAccess` policy above is attached to `LambdaExecutionRole`.
Authorization for that Role reads the policy document the template gave it.

A Role's `PermissionsBoundary` reaches the authorization decision the deployment is made under, and
caps what the Role it names may then do. `MaxSessionDuration` sets the longest session STS issues
for the Role, as a number or as its decimal text.
[Creating a Role under a permissions boundary](#creating-a-role-under-a-permissions-boundary) covers
the guard it exists for.

A Role's `Tags` are put on the Role it creates, and so are a User's on the User. See
[Tags and principal keys](#tags-and-principal-keys).

### Users

An `AWS::IAM::User` creates a User in the Stack's Account. `UserName` names it and falls back to the
Resource logical ID. `Path`, `PermissionsBoundary`, the inline `Policies` list and
`ManagedPolicyArns` work as they do on a Role, and both policy forms reach the authorization decision made for that User. `Ref` returns the
User name and `Fn::GetAtt` supports `Arn` and `UserId`.

`LoginProfile` gives the User a console password, the way real CloudFormation calls
`CreateLoginProfile`. The profile records the password, its creation date and
`PasswordResetRequired`. Real IAM never reads a password back, and neither does the simulator. A
test asserting on the password reads the User record from `SimIam.users`.

A separate `AWS::IAM::Policy` naming the User in `Users` puts its document onto the User as another
inline policy. That is what a CDK grant against a User synthesizes.

`Groups` adds the User to each group it names as the User is created, and the User then gets the
group's policies.

Deleting the Stack deletes the User. Its inline policies, managed policy attachments, login profile
and group memberships come off first, and the User name is free for the same template to deploy
again. An access key created outside the Stack refuses the deletion, as it does in AWS.

```typescript sim-iam-cloudformation-user
/**
 * Creating an IAM User through simulated CloudFormation.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "iam-user-stack",
  template: {
    Resources: {
      ReportsReadPolicy: {
        Type: "AWS::IAM::ManagedPolicy",
        Properties: {
          ManagedPolicyName: "ReportsReadPolicy",
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: {
              Effect: "Allow",
              Action: "s3:GetObject",
              Resource: "arn:aws:s3:::reports-bucket/*",
            },
          },
        },
      },
      ReportPublisher: {
        Type: "AWS::IAM::User",
        Properties: {
          UserName: "ReportPublisher",
          Path: "/application/",
          ManagedPolicyArns: [{ Ref: "ReportsReadPolicy" }],
          Policies: [
            {
              PolicyName: "WriteReports",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: {
                  Effect: "Allow",
                  Action: "s3:PutObject",
                  Resource: "arn:aws:s3:::reports-bucket/*",
                },
              },
            },
          ],
          LoginProfile: {
            Password: "initial-console-password",
            PasswordResetRequired: true,
          },
        },
      },
    },
    Outputs: {
      UserArn: {
        Value: {
          "Fn::GetAtt": ["ReportPublisher", "Arn"],
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

const simIam = simAws.iam();

const decision = simIam.authorize({
  action: "s3:PutObject",
  resource: "arn:aws:s3:::reports-bucket/2026/summary.csv",
  caller: { kind: "arn", arn: stack.output("UserArn") },
});

console.log(decision.isAllowed);

const user = simIam.users
  .values()
  .find((each) => each.userName === "ReportPublisher");

console.log(user?.loginProfile?.passwordResetRequired);
```

## Accounts

IAM is account-scoped in AWS, and sim IAM matches that. Every Region scope of the same simulated
Account shares one IAM state, while different Accounts are fully isolated from each other.

```typescript sim-iam-account-scoping
/**
 * Simulated IAM Account scoping.
 */

import { CreateUserCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const firstAccountIam = simAws.account("111111111111").iam();
const secondAccountIam = simAws.account("222222222222").iam();

const firstUserOutput = await firstAccountIam.createUser(
  new CreateUserCommand({ UserName: "DeployUser" }),
);
const secondUserOutput = await secondAccountIam.createUser(
  new CreateUserCommand({ UserName: "DeployUser" }),
);

console.log(firstUserOutput.User.Arn);
console.log(secondUserOutput.User.Arn);
```

Principals from one Account get no implicit access to another Account's resources. Authorizing a
caller from a different simulated Account results in an implicit deny unless both Accounts allow the
request.

## Cross-Account requests

A request whose caller belongs to a different Account from the resource is decided in both
Accounts, as it is on AWS:

- The resource's Account must allow it through a resource policy, such as an S3 Bucket policy or a
  Lambda permission
- The caller's Account must allow it through an identity policy on that principal

Either one on its own is denied. A resource policy naming another Account's principal delegates to
that Account, and an Account cannot grant its own principals access to somebody else's resource. An
explicit `Deny` on either side denies. Callers with no
identity side, such as a service principal or an anonymous request, are unaffected, and are still
allowed by a resource policy alone.

```typescript sim-iam-cross-account
/**
 * A cross-Account request needs an allow from both Accounts.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const partnerRoleArn = "arn:aws:iam::222222222222:role/Reader";

// The Bucket's Account grants the partner Account's Role.
const bucketPolicy = {
  document: {
    Version: "2012-10-17",
    Statement: {
      Effect: "Allow",
      Principal: { AWS: partnerRoleArn },
      Action: "s3:GetObject",
      Resource: "arn:aws:s3:::reports-bucket/*",
    },
  },
} as const;

const request = {
  action: "s3:GetObject",
  resource: "arn:aws:s3:::reports-bucket/summary.csv",
  caller: { kind: "arn", arn: partnerRoleArn },
  resourcePolicies: [bucketPolicy],
} as const;

const beforeIdentityPolicy = simAws
  .account("111111111111")
  .iam()
  .authorize(request);

// false: the partner Account has not allowed its Role to read anything.
console.log(beforeIdentityPolicy.isAllowed);
console.log(beforeIdentityPolicy.resourceAllowStatements.length); // 1
console.log(beforeIdentityPolicy.identityAllowStatements.length); // 0

// The partner Account allows its own Role.
const partnerIam = simAws.account("222222222222").iam();

await partnerIam.createRole(
  new CreateRoleCommand({
    RoleName: "Reader",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::222222222222:root" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await partnerIam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "Reader",
    PolicyName: "ReadReports",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::reports-bucket/*",
      },
    }),
  }),
);

// true: both Accounts now allow the request.
console.log(simAws.account("111111111111").iam().authorize(request).isAllowed);
```

The caller's Account is resolved from the principal ARN. For its policies to count, that Account has
to belong to the same `SimAws` instance. An Account the simulation was never told about grants
nothing. On AWS, a principal ARN that was never given any permissions comes out the same way.

A standalone `SimIam` has no simulation around it, and so no other Account to ask. A principal whose
ARN belongs to another Account is always denied, however permissive the resource policy. Anonymous
and service-principal callers carry on as before, since they have no Account either way, and a
resource policy still allows them. The Account ID is available as `simIam.accountId`. A test naming
its own principals should build their ARNs from that.

## Standalone SimIam

If you only need IAM alone, you can instantiate `SimIam` directly.

```typescript sim-iam-standalone
/**
 * Standalone simulated IAM instance.
 */

import { CreateRoleCommand } from "@aws-sdk/client-iam";
import { SimIam } from "@kensio/yulin/iam";

const simIam = new SimIam();

const roleCreation = await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "StandaloneRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

console.log(roleCreation.Role.Arn);
```

A standalone `SimIam` instance has its own isolated state, scoped to a generated Account ID, and
stands apart from any wider `SimAws` environment. Other services instantiated standalone, such as
`new SimRoute53()`, fall back to allow-all authorization. Connect services through a shared `SimAws`
instance when a test should exercise real IAM enforcement.

## Supported operations

Sim IAM currently supports:

- `makeDeployRole(...)`, creating a Role for a CloudFormation deployment to run as
- `CreateRoleCommand`, including trust-policy validation
- `GetRoleCommand` and `ListRolesCommand`, with pagination
- `UpdateRoleCommand`, `UpdateAssumeRolePolicyCommand`, `PutRolePermissionsBoundaryCommand` and
  `DeleteRolePermissionsBoundaryCommand`
- `PutRolePolicyCommand`, `GetRolePolicyCommand`, `ListRolePoliciesCommand` and
  `DeleteRolePolicyCommand`, for inline Role policies
- `CreatePolicyCommand`, `GetPolicyCommand`, `ListPoliciesCommand` (including the AWS-managed
  catalogue) and `DeletePolicyCommand`, for managed Policies
- `CreatePolicyVersionCommand`, `GetPolicyVersionCommand`, `ListPolicyVersionsCommand`,
  `SetDefaultPolicyVersionCommand` and `DeletePolicyVersionCommand`
- A catalogue of [AWS-managed policies](#aws-managed-policies) that grant their published
  permissions when attached
- Refusing a policy document over IAM's character limit, and the [quotas](#quotas) on attachments,
  access keys, group memberships, policy versions and the entities an Account holds, with
  `LimitExceeded`
- `GetAccountSummaryCommand`
- `AttachRolePolicyCommand`, `DetachRolePolicyCommand` and `ListAttachedRolePoliciesCommand`
- `CreateUserCommand`, `GetUserCommand`, `ListUsersCommand`, `UpdateUserCommand` and
  `DeleteUserCommand`
- `PutUserPolicyCommand`, `GetUserPolicyCommand`, `ListUserPoliciesCommand`,
  `DeleteUserPolicyCommand`, `AttachUserPolicyCommand`, `DetachUserPolicyCommand` and
  `ListAttachedUserPoliciesCommand`
- `PutUserPermissionsBoundaryCommand` and `DeleteUserPermissionsBoundaryCommand`
- `CreateLoginProfileCommand`, `GetLoginProfileCommand` and `DeleteLoginProfileCommand`
- [Groups](#groups): `CreateGroupCommand`, `GetGroupCommand`, `ListGroupsCommand`,
  `ListGroupsForUserCommand`, `UpdateGroupCommand`, `DeleteGroupCommand`, `AddUserToGroupCommand`,
  `RemoveUserFromGroupCommand`, and the inline and managed group policy commands
- [Instance profiles](#instance-profiles): `CreateInstanceProfileCommand`,
  `GetInstanceProfileCommand`, `ListInstanceProfilesCommand`, `ListInstanceProfilesForRoleCommand`,
  `AddRoleToInstanceProfileCommand`, `RemoveRoleFromInstanceProfileCommand` and
  `DeleteInstanceProfileCommand`
- `TagRoleCommand`, `UntagRoleCommand`, `ListRoleTagsCommand`, `TagUserCommand`, `UntagUserCommand`
  and `ListUserTagsCommand`, along with `Tags` on `CreateRoleCommand` and `CreateUserCommand`
- `aws:PrincipalTag/`, `iam:ResourceTag/`, `aws:RequestTag/` and `aws:TagKeys`, and the principal
  keys `aws:PrincipalAccount`, `aws:PrincipalType`, `aws:userid`, `aws:username`,
  `aws:PrincipalIsAWSService` and `aws:PrincipalServiceName`
- `CreateAccessKeyCommand`, registering access keys for credential authentication, and
  `ListAccessKeysCommand`, `UpdateAccessKeyCommand` and `DeleteAccessKeyCommand`
- Allow/deny authorization decisions with `authorize(...)`, evaluating identity policies,
  service-supplied resource policies, and every documented condition operator with explicit-deny
  precedence
- IAM authorization at simulated service boundaries, such as Route53 actions
- `iam:PassRole` authorization of a Role handed to simulated Lambda, Scheduler, EventBridge, Step
  Functions, ECS or Firehose, with `iam:PassedToService` supplied
- `iam:CreateRole` and `iam:CreateUser` authorization against `iam:PermissionsBoundary`, from the
  `PermissionsBoundary` a request, an `AWS::IAM::Role` or an `AWS::IAM::User` declares
- Permissions boundaries on Users and Roles, and session policies on assumed-role sessions,
  evaluated as caps on identity policies and on resource policies naming a Role
- `MaxSessionDuration` on `CreateRoleCommand`, `UpdateRoleCommand` and `AWS::IAM::Role`, reported by
  `GetRoleCommand`
- Resolving the caller of an HTTP request, from an `x-sim-aws-caller` header or a verified SigV4
  signature, defaulting to anonymous, and the resource it is made on behalf of from
  `x-sim-aws-source-arn` and `x-sim-aws-source-account`
- Temporary Role sessions through simulated STS `AssumeRoleCommand`, evaluated against Role trust
  policies
- The `AWS::IAM::Role`, `AWS::IAM::User`, `AWS::IAM::Group`, `AWS::IAM::UserToGroupAddition`,
  `AWS::IAM::InstanceProfile`, `AWS::IAM::ManagedPolicy` and `AWS::IAM::Policy` CloudFormation
  resources

Unsupported IAM options may be ignored or may throw errors depending on whether the simulator needs
them to model the requested behaviour.

## Limitations

Sim IAM models the policy behaviour that multi-service tests most commonly need. Notable gaps:

- An AWS-managed policy has the one version the catalogue holds, and the version commands act on
  the Account's own policies only
- AWS-managed policies outside the [catalogue](#aws-managed-policies) attach and grant nothing
- The quotas hold their defaults, with no way to raise one. MFA devices, signing certificates, SSH
  keys, server certificates and identity providers are absent, and so are the tag commands for
  instance profiles
- A resource policy naming a User by ARN keeps the old ARN when the User is renamed, and stops
  matching it. AWS rewrites such a policy to the new name
- A condition keyword IAM does not define fails closed, matching no request.
  `decision.unevaluatedStatements` names the statements holding one
- Condition operator keywords are matched case-sensitively. AWS does not document whether it reads
  `stringequals` as `StringEquals`
- Signature age is deliberately not enforced. `X-Amz-Date` must be present, well formed, and agree
  with the credential scope date, but is never compared to a clock. A client stamping real time can
  therefore reach a simulation keeping a different one. Session expiry _is_ enforced, against
  simulated time
- S3 `aws-chunked` streaming signatures and SigV4A are not verified. Presigned query-string
  authentication is verified, for the `AWS4-HMAC-SHA256` algorithm only
- The resolved caller is evaluated by Lambda Function URLs with `AuthType: "AWS_IAM"` and by the S3
  REST endpoint, but not yet by the other services that serve HTTP. Website-endpoint S3 responses
  and CloudFront responses perform no authorization
- The identity side of a cross-Account request comes from the caller's Account in the same `SimAws`
  instance. A caller whose Account is absent from the simulation is denied
