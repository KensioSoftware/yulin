# Simulated IAM

Yulin includes a simulated IAM service for isolated tests, local development, and CI.

Sim IAM can be used directly through `SimAws` or instantiated on its own as `SimIam` with isolated
state. It stores simulated Roles, Users, and Policies, and evaluates allow/deny authorization
decisions for them. Other simulated services use sim IAM to authorize their own actions, simulated
STS uses it to issue temporary Role sessions, and sim CloudFormation can create IAM resources from
templates.

## Available functionality

Sim IAM currently supports:

- Creating Roles with `CreateRoleCommand`, including trust-policy validation
- Getting and listing Roles with `GetRoleCommand` and `ListRolesCommand`, with pagination
- Inline Role policies with `PutRolePolicyCommand`
- Managed Policies with `CreatePolicyCommand`, `GetPolicyCommand`, and `ListPoliciesCommand`
- Attaching managed Policies to Roles with `AttachRolePolicyCommand`
- Users with `CreateUserCommand` and inline User policies with `PutUserPolicyCommand`
- User access keys with `CreateAccessKeyCommand`, registered for credential authentication
- Allow/deny authorization decisions with `authorize(...)`, evaluating identity policies,
  service-supplied resource policies, and policy conditions with explicit-deny precedence
- IAM authorization at simulated service boundaries, such as Route53 actions
- Resolving the caller of an HTTP request into simulated AWS, from an `x-sim-aws-caller` header or
  a verified SigV4 signature, defaulting to anonymous
- Temporary Role sessions through simulated STS `AssumeRoleCommand`, evaluated against Role trust
  policies
- CloudFormation resources:
  - `AWS::IAM::Role`
  - `AWS::IAM::ManagedPolicy`
  - `AWS::IAM::Policy` (inline policies put onto referenced Roles)

The simulator focuses on useful behavior for isolated tests and local development rather than full
IAM feature parity. Unsupported IAM options may be ignored or may throw errors depending on whether
the simulator needs them to model the requested behaviour.

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

A trust policy alone grants no permissions: a Role with no inline or attached policies is implicitly
denied for every action.

## Authorization decisions

`authorize(...)` returns a decision object rather than throwing, so tests can assert on exactly why
a request was allowed or denied. The decision models the common IAM evaluation rules:

- A matching explicit `Deny` statement in any evaluated policy wins
- Otherwise, within one Account, a matching `Allow` in an identity policy or resource policy allows
  the request
- Across Accounts, a matching `Allow` is needed from each side — see
  [Cross-Account requests](#cross-account-requests)
- Otherwise the request is implicitly denied

The decision exposes `value` (`"Allow"`, `"ExplicitDeny"`, or `"ImplicitDeny"`), the convenience
flags `isAllowed`, `isDenied`, `isExplicitDeny`, and `isImplicitDeny`, the matching
`allowStatements` and `explicitDenyStatements`, and the resolved `caller` for diagnostics. The
matching Allows are also available per side as `identityAllowStatements` and
`resourceAllowStatements`, which is what a cross-Account denial is best read from.

If the caller is omitted, authorization defaults to the root principal of the Account owning the
sim IAM instance, which is allowed within its own Account. An explicit `{ kind: "anonymous" }`
caller suppresses that fallback and is evaluated without identity policies.

Resource policies are not stored in IAM. They are supplied with the authorization request by the
service that owns the target resource, such as an S3 Bucket policy.

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

Policy paths are normalised into the Policy ARN, so a Policy named `ReadOnlyReports` with path
`/service-role/` gets the ARN `arn:aws:iam::123456789012:policy/service-role/ReadOnlyReports`.
Creating a duplicate Policy name in the same path throws an error, while the same name in different
paths is allowed. Stored Policies can be inspected with `GetPolicyCommand` and
`ListPoliciesCommand`.

## Policy conditions

Policy statements can carry `Condition` blocks. Sim IAM currently supports the `StringEquals`,
`StringLike`, and `NumericLessThanEquals` operators, along with the `ForAllValues:` and
`ForAnyValue:` set variants of `StringEquals` and `StringLike`.

Condition context values are supplied by the service handling the simulated request, such as S3
object tags. Sim IAM automatically derives global values it can work out itself, such as
`aws:PrincipalArn` from the resolved caller. Context-key names are matched case-insensitively,
while string values remain case-sensitive.

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

A condition that references a context key with no supplied value simply does not match, leaving the
request implicitly denied unless another statement allows it.

## Users and access keys

Create Users with `CreateUserCommand`, give them inline policies with `PutUserPolicyCommand`, and
issue access keys with `CreateAccessKeyCommand`. Access keys are registered with the Account's
credential registry, so credentials can be supplied as the caller of an authorization attempt and
are authenticated before policy evaluation.

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

## STS AssumeRole sessions

Simulated STS issues temporary credentials for IAM Roles with `AssumeRoleCommand`. The assume
request is evaluated against the Role's trust policy, and the returned credentials resolve to an
assumed-role session principal whose permissions come from the underlying Role's policies.

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

## Callers of HTTP requests

An in-process SDK call can be told who its caller is. A request arriving over HTTP — through
`serveSimAws`, or through `SimAwsHttp.fetch(...)` in the same process — carries no such thing, so
sim IAM works the caller out from the request itself, in a fixed order:

1. An `x-sim-aws-caller` header naming the principal directly.
2. An `Authorization: AWS4-HMAC-SHA256` header, verified as a SigV4 signature.
3. Neither, giving **anonymous**.

The last step matters. Sim IAM treats an omitted in-process caller as the Account root with
unrestricted access, which is a convenience inside a test. Over HTTP the same default would make
every unauthenticated request an administrator, so a served request that says nothing about who
sent it is anonymous instead, and never the Account root.

### Naming the caller directly

`x-sim-aws-caller` names the principal outright. It is the path for local development and for
tooling that will not sign requests: a curl one-liner can be a Role without holding any credentials.

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

The header is always enabled and not configurable, it takes precedence over a valid signature, and
it does not check that the ARN exists — naming a principal is not claiming it was created, exactly
as `runAs` behaves. It is stripped before the request reaches the simulated service, so a Lambda
handler echoing `event.headers` never sees simulator control metadata.

```typescript sim-iam-served-request-caller
/**
 * Naming the caller of an HTTP request into simulated AWS.
 */

import {
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
  srv.close();
}
```

### Signed requests

A request signed with credentials from `CreateAccessKeyCommand` or from an STS `AssumeRoleCommand`
session is verified as a SigV4 signature and resolves to the signing principal, with the same
identity `resolveCredentials` returns in process. For an assumed-role session that means the
request is attributed to the session while its permissions come from the Role behind it, so a
policy on the Role applies to a request the session signed.

Sign the URL you actually call. Serving rewrites AWS endpoint hostnames to local ones — a Function
URL is served at `<url-id>.lambda-url.<region>.sim-aws.localhost:<port>` — and the `host` header is
part of what a signature covers, so a signature made against the real AWS hostname will not verify
against the local one.

A signature whose credential scope names a different service or Region than the endpoint it reached
is refused before anything else is checked, and says so. The scope feeds the signing key, so without
that check the only symptom would be a signature mismatch with nothing to act on.

### What the simulator reports back

Every served response carries the simulator's own account of the request in headers, leaving the
response body the shape the real service returns. Which headers appear depends on whether the
request was accepted:

| Header                   | On an accepted request                                                                   | On a refused request                                |
| ------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `x-sim-aws-caller`       | The principal the request was attributed to, in the same form the request header accepts | Absent — there is no principal to report            |
| `x-sim-aws-auth`         | How that was decided: `caller-header`, `sigv4`, or `none`                                | `rejected`                                          |
| `x-sim-aws-error`        | Absent                                                                                   | The AWS error code, such as `SignatureDoesNotMatch` |
| `x-sim-aws-error-detail` | Absent                                                                                   | What the simulator can say about why                |

A refused request is answered as real AWS answers it: `403` with `{"Message":"Forbidden"}` for a
rejected signature, and `400` for a signature too incomplete to parse or an `x-sim-aws-caller`
value that names no principal form. Real AWS has nowhere in that body to explain itself and neither
does this, which is why the detail goes in `x-sim-aws-error-detail` where it changes nothing for a
client parsing the response.

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
caller defaults to the Account root, which is allowed within its own Account, so existing tests
that never mention IAM keep working.

## CloudFormation Roles and Managed Policies

Sim CloudFormation can create IAM resources from `AWS::IAM::Role`, `AWS::IAM::ManagedPolicy`, and
`AWS::IAM::Policy`. An `AWS::IAM::Policy` puts its document onto each Role named in `Roles` as an
inline policy — the pattern CDK grants such as `bucket.grantRead(fn)` synthesize as a
"DefaultPolicy" resource. IAM Users and Groups are not simulated as policy principals, so naming
them fails creation rather than silently dropping the grant.

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

console.log(stack.outputs.get("RoleArn")?.value);
console.log(stack.outputs.get("PolicyArn")?.value);

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
Role's inline policies.

## Accounts

IAM is account-scoped in AWS, and sim IAM matches that: every Region scope of the same simulated
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

Principals from one Account get no implicit access to another Account's resources: authorizing a
caller from a different simulated Account results in an implicit deny unless both Accounts allow the
request.

## Cross-Account requests

A request whose caller belongs to a different Account from the resource is decided in both
Accounts, as it is on AWS:

- The resource's Account must allow it through a resource policy, such as an S3 Bucket policy or a
  Lambda permission
- The caller's Account must allow it through an identity policy on that principal

Either one on its own is denied. A resource policy naming another Account's principal delegates to
that Account rather than granting on its behalf, and an Account cannot grant its own principals
access to somebody else's resource. An explicit `Deny` on either side denies. Callers with no
identity side — a service principal, or an anonymous request — are unaffected, and are still allowed
by a resource policy alone.

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

The caller's Account is resolved from the principal ARN, so it has to be an Account of the same
`SimAws` instance for its policies to count. An Account the simulation was never told about grants
nothing, which is also what a principal ARN that was never given any permissions means on AWS.

A standalone `SimIam` has no simulation around it and so no other Account to ask: a caller from
outside its own Account is always denied. Its Account ID is available as `simIam.accountId`, which
is what a test naming its own principals should build their ARNs from.

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

A standalone `SimIam` instance has its own isolated state, scoped to a generated Account ID, and is
not connected to a wider `SimAws` environment. Note that other services instantiated standalone,
such as `new SimRoute53()`, fall back to allow-all authorization — connect services through a
shared `SimAws` instance when a test should exercise real IAM enforcement.

## Limitations

Sim IAM models the policy behaviour that multi-service tests most commonly need, rather than the
full IAM feature set. Notable gaps:

- Permissions boundaries, session policies, and service control policies are not evaluated
- Managed Policies have a single version; policy version commands are not supported
- Deleting and detaching resources (Roles, Users, Policies, access keys) is not yet supported
- Only the condition operators listed above are supported; a statement using an unsupported
  operator fails closed and does not match, rather than silently allowing
- Signature age is deliberately not enforced: `X-Amz-Date` must be present, well formed, and agree
  with the credential scope date, but is never compared to a clock, so a client stamping real time
  is not locked out of a simulation keeping a different one. Session expiry _is_ enforced, against
  simulated time
- Presigned query-string authentication (`X-Amz-Algorithm` in the query), S3 `aws-chunked`
  streaming signatures, and SigV4A are not verified
- The resolved caller is evaluated by Lambda Function URLs with `AuthType: "AWS_IAM"`, but not yet
  by the other services that serve HTTP: served S3 objects and CloudFront responses perform no
  authorization
- The identity side of a cross-Account request comes from the caller's Account in the same `SimAws`
  instance. A caller whose Account is not part of the simulation is denied rather than assumed to be
  permitted
