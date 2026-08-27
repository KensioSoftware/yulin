# Simulated IAM

Yulin includes a simulated IAM service for tests and local development.

Sim IAM stores simulated Roles, Users and Policies, and evaluates allow/deny authorization decisions
for them. Other simulated services use it to authorize their own actions, simulated STS uses it to
issue temporary Role sessions, and sim CloudFormation can create IAM resources from templates. It can
also be instantiated on its own as `SimIam` with isolated state.

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

`authorize(...)` returns a decision object. A denied request comes back as a decision too, and a
test can assert on exactly why it was allowed or denied. The decision models the common IAM
evaluation rules:

- A matching explicit `Deny` statement in any evaluated policy wins
- Otherwise, within one Account, a matching `Allow` in an identity policy or resource policy allows
  the request
- Across Accounts, a matching `Allow` is needed from each side. See
  [Cross-Account requests](#cross-account-requests)
- Otherwise the request is implicitly denied

The decision exposes `value` (`"Allow"`, `"ExplicitDeny"`, or `"ImplicitDeny"`), the convenience
flags `isAllowed`, `isDenied`, `isExplicitDeny`, and `isImplicitDeny`, the matching
`allowStatements` and `explicitDenyStatements`, and the resolved `caller` for diagnostics. The
matching Allows are also available per side as `identityAllowStatements` and
`resourceAllowStatements`. A cross-Account denial is best read from those.

If the caller is omitted, authorization defaults to the root principal of the Account owning the
sim IAM instance. That principal is allowed within its own Account. An explicit
`{ kind: "anonymous" }` caller suppresses the fallback and is evaluated without identity policies.

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
`ListPoliciesCommand`.

## Policy conditions

Policy statements can carry `Condition` blocks. Sim IAM currently supports the `StringEquals`,
`StringLike`, `ArnLike`, `ArnEquals` and `NumericLessThanEquals` operators, along with the
`ForAllValues:` and `ForAnyValue:` set variants of `StringEquals` and `StringLike`.

`ArnLike` and `ArnEquals` behave identically, as AWS documents them doing. Both compare the six
colon-delimited components of an ARN separately, and both accept `*` and `?` wildcards in any of
them. A wildcard stays inside the component it is written in. `arn:aws:s3:*` matches nothing,
because a pattern needs as many components as the ARN it is matched against.

Condition context values are supplied by the service handling the simulated request, such as S3
object tags. Sim IAM automatically derives the global values it can work out itself, `aws:PrincipalArn`
from the resolved caller and `aws:RequestedRegion` from the Region the request was made in. A value a
service supplies under either name is overwritten by the derived one. Context-key names are matched
case-insensitively, while string values remain case-sensitive.

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

A condition that references a context key with no supplied value fails to match, leaving the
request implicitly denied unless another statement allows it.

## Users and access keys

Create Users with `CreateUserCommand`, give them inline policies with `PutUserPolicyCommand`, and
issue access keys with `CreateAccessKeyCommand`. Access keys are registered with the Account's
credential registry. Credentials can then be supplied as the caller of an authorization attempt,
and are authenticated before policy evaluation.

`DeleteUserCommand` removes a User. IAM refuses it while the User still holds an inline policy or an
attached managed policy, the way `DeleteRoleCommand` refuses a Role, and answers `NoSuchEntity` for
a name the Account does not hold. Real IAM also refuses a User that still has access keys or a login
profile. Sim IAM serves no way to remove either, and lets the User go.

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
`AttachRolePolicyCommand` does for a Role. An ARN with no stored Policy behind it, such as an
AWS-managed one, attaches and contributes no statements to a decision.

`CreateLoginProfileCommand` gives a User a console password. The response describes the profile
without the password, which is how real IAM behaves. See
[CloudFormation Users](#users) for reading the password back out of the simulator.

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

## CloudFormation IAM resources

Sim CloudFormation can create IAM resources from `AWS::IAM::Role`, `AWS::IAM::User`,
`AWS::IAM::ManagedPolicy`, and `AWS::IAM::Policy`. An `AWS::IAM::Policy` puts its document onto each
Role named in `Roles` and each User named in `Users` as an inline policy. That is the shape CDK
grants such as `bucket.grantRead(fn)` and `bucket.grantRead(user)` synthesize as a "DefaultPolicy"
resource. Every entry names a Role or a User in the Stack's Account. An entry naming no simulated
principal fails the resource, and so does a policy naming no principal at all. A `Groups` property
still fails the resource.

An `AWS::IAM::ManagedPolicy` also carries `Roles`, and attaches itself to each Role it names as it
is created (the attachment `AttachRolePolicy` records). A name no simulated Role in the Account
answers to fails the resource. Deleting the stack takes the policy back off the Roles still
carrying it, and then deletes the policy.

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

### Users

An `AWS::IAM::User` creates a User in the Stack's Account. `UserName` names it and falls back to the
Resource logical ID. `Path`, the inline `Policies` list and `ManagedPolicyArns` work as they do on a
Role, and both policy forms reach the authorization decision made for that User. `Ref` returns the
User name and `Fn::GetAtt` supports `Arn` and `UserId`.

`LoginProfile` gives the User a console password, the way real CloudFormation calls
`CreateLoginProfile`. The profile records the password, its creation date and
`PasswordResetRequired`. Real IAM never reads a password back, and neither does the simulator. A
test asserting on the password reads the User record from `SimIam.users`.

A separate `AWS::IAM::Policy` naming the User in `Users` puts its document onto the User as another
inline policy. That is what a CDK grant against a User synthesizes.

Group membership is a gap. A `Groups` entry fails the Resource. An empty list still deploys, and CDK
leaves `Groups` out of the template for a User that belongs to no group.

Deleting the Stack deletes the User. Its inline policies and managed policy attachments come off
first, as they do for a Role, and the User name is free for the same template to deploy again.

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

## Available functionality

Sim IAM currently supports:

- `CreateRoleCommand`, including trust-policy validation
- `GetRoleCommand` and `ListRolesCommand`, with pagination
- `PutRolePolicyCommand`, for inline Role policies
- `CreatePolicyCommand`, `GetPolicyCommand` and `ListPoliciesCommand`, for managed Policies
- `AttachRolePolicyCommand`
- `CreateUserCommand`, `DeleteUserCommand`, `PutUserPolicyCommand` and `AttachUserPolicyCommand`
- `CreateLoginProfileCommand`, for a User's console password
- `CreateAccessKeyCommand`, registering access keys for credential authentication
- Allow/deny authorization decisions with `authorize(...)`, evaluating identity policies,
  service-supplied resource policies, and policy conditions with explicit-deny precedence
- IAM authorization at simulated service boundaries, such as Route53 actions
- Resolving the caller of an HTTP request, from an `x-sim-aws-caller` header or a verified SigV4
  signature, defaulting to anonymous, and the resource it is made on behalf of from
  `x-sim-aws-source-arn` and `x-sim-aws-source-account`
- Temporary Role sessions through simulated STS `AssumeRoleCommand`, evaluated against Role trust
  policies
- The `AWS::IAM::Role`, `AWS::IAM::User`, `AWS::IAM::ManagedPolicy` and `AWS::IAM::Policy`
  CloudFormation resources

Unsupported IAM options may be ignored or may throw errors depending on whether the simulator needs
them to model the requested behaviour.

## Limitations

Sim IAM models the policy behaviour that multi-service tests most commonly need. Notable gaps:

- Groups are absent. An `AWS::IAM::User` naming one fails, and an `AWS::IAM::Policy` naming one
  fails too
- Permissions boundaries and session policies are not evaluated. Service control policies are, and
  are attached through [simulated Organizations](https://yulinsim.dev/services/organizations/ "Simulated Organizations service control policies usage docs")
- Managed Policies have a single version, and the policy version commands are absent
- `DeleteUserPolicy` and `DetachUserPolicy` are absent, along with `DeleteAccessKey` and
  `DeleteLoginProfile`. `DeleteUserCommand` refuses a User that still holds a policy, and
  CloudFormation teardown clears a User's policies before deleting it
- Only the condition operators listed above are supported. A statement using any other operator
  fails closed, matching no request
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
