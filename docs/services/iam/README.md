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

const createRoleOutput = await simIam.createRole(
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
  caller: { kind: "arn", arn: createRoleOutput.Role.Arn },
});

console.log(decision.isAllowed);
```

`CreateRoleCommand` validates the trust policy document and stores the Role with an AWS-shaped ARN,
Role ID, and creation date. Roles can be inspected with `GetRoleCommand` and `ListRolesCommand`.

A trust policy alone grants no permissions: a Role with no inline or attached policies is implicitly
denied for every action.

## Authorization decisions

`authorize(...)` returns a decision object rather than throwing, so tests can assert on exactly why
a request was allowed or denied. The decision models the common IAM evaluation union:

- A matching explicit `Deny` statement in any evaluated policy wins
- Otherwise a matching `Allow` in an identity policy or resource policy allows the request
- Otherwise the request is implicitly denied

The decision exposes `value` (`"Allow"`, `"ExplicitDeny"`, or `"ImplicitDeny"`), the convenience
flags `isAllowed`, `isDenied`, `isExplicitDeny`, and `isImplicitDeny`, the matching
`allowStatements` and `explicitDenyStatements`, and the resolved `caller` for diagnostics.

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

const createPolicyOutput = await simIam.createPolicy(
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

const createRoleOutput = await simIam.createRole(
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
    PolicyArn: createPolicyOutput.Policy.Arn,
  }),
);

const decision = simIam.authorize({
  action: "s3:GetObject",
  resource: "arn:aws:s3:::reports-bucket/2026/summary.csv",
  caller: { kind: "arn", arn: createRoleOutput.Role.Arn },
});

console.log(createPolicyOutput.Policy.Arn);
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

const createRoleOutput = await simIam.createRole(
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
  caller: { kind: "arn", arn: createRoleOutput.Role.Arn },
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

const createAccessKeyOutput = await simIam.createAccessKey(
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
      accessKeyId: createAccessKeyOutput.AccessKey.AccessKeyId,
      secretAccessKey: createAccessKeyOutput.AccessKey.SecretAccessKey,
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

## Authorizing other simulated services

Simulated services use sim IAM to authorize their own actions when used through `SimAws`. Route53
commands such as `CreateHostedZoneCommand`, `GetHostedZoneCommand`,
`ChangeResourceRecordSetsCommand`, and `ListHostedZonesByNameCommand` accept an optional caller,
letting tests exercise real allow/deny behaviour across services.

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

const createRoleOutput = await simIam.createRole(
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
      caller: { kind: "arn", arn: createRoleOutput.Role.Arn },
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

const getRoleOutput = await simAws.iam().getRole(
  new GetRoleCommand({
    RoleName: "LambdaExecutionRole",
  }),
);

console.log(getRoleOutput.Role.Arn);
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
caller from a different simulated Account results in an implicit deny unless a supplied resource
policy allows it.

## Standalone SimIam

If you only need IAM alone, you can instantiate `SimIam` directly.

```typescript sim-iam-standalone
/**
 * Standalone simulated IAM instance.
 */

import { CreateRoleCommand } from "@aws-sdk/client-iam";
import { SimIam } from "@kensio/yulin/iam";

const simIam = new SimIam();

const createRoleOutput = await simIam.createRole(
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

console.log(createRoleOutput.Role.Arn);
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
