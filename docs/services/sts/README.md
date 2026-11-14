# Simulated STS

Yulin simulates `AssumeRole` and `GetCallerIdentity`. Access the service through `simAws.sts()` or an
intercepted `STSClient`.

## Basic usage

Create a role with a trust policy, then call `assumeRole`. A request with no caller runs as the
account root.

```typescript sim-sts-assume-role
/**
 * Assuming a simulated IAM Role through simulated STS.
 */

import { CreateRoleCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const account = simAws.account("123456789012");

await account.iam().createRole(
  new CreateRoleCommand({
    RoleName: "TargetRole",
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

const assumeRoleOutput = await account.sts().assumeRole(
  new AssumeRoleCommand({
    RoleArn: "arn:aws:iam::123456789012:role/TargetRole",
    RoleSessionName: "test-session",
  }),
);

console.log(assumeRoleOutput.AssumedRoleUser?.Arn);
console.log(assumeRoleOutput.Credentials?.AccessKeyId);
console.log(assumeRoleOutput.Credentials?.Expiration);
```

`AssumedRoleUser.Arn` is the session ARN, such as
`arn:aws:sts::123456789012:assumed-role/TargetRole/test-session`, and `Credentials` carries the
temporary `AccessKeyId`, `SecretAccessKey`, `SessionToken`, and `Expiration`.

Yulin registers the credentials with simulated IAM in the target account. Later requests use the
role's identity policies. See [STS sessions in simulated IAM](https://yulinsim.dev/services/iam/#sts-assumerole-sessions).
Credentials fail after `Expiration` or when the session token is missing.

`DurationSeconds` defaults to 3,600 seconds. See [Session duration](#session-duration) for the
limits on it.

## Reading the current identity

`getCallerIdentity` reports the caller's ARN, account ID and user ID. It handles account roots, IAM
users and assumed-role sessions. The intercepted and served STS APIs also support
`GetCallerIdentityCommand`.

An unattributed request reports the configured default caller, or the account root when no default
caller is configured. An anonymous caller receives `AccessDenied`.

## Role-to-Role assumption

Pass `caller` to assume a role as a specific principal. STS checks both sides of the request:

- The target Role's trust policy must allow the caller to perform `sts:AssumeRole`
- A non-root caller also needs an identity policy allowing `sts:AssumeRole` on the target Role's
  ARN

```typescript sim-sts-role-to-role
/**
 * One simulated IAM Role assuming another through simulated STS.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const account = simAws.account("123456789012");
const simIam = account.iam();

const sourceRoleArn = "arn:aws:iam::123456789012:role/SourceRole";
const targetRoleArn = "arn:aws:iam::123456789012:role/TargetRole";

await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "SourceRole",
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
    RoleName: "SourceRole",
    PolicyName: "AssumeTargetRole",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "sts:AssumeRole",
        Resource: targetRoleArn,
      },
    }),
  }),
);

await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "TargetRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: sourceRoleArn },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

const assumeRoleOutput = await account.sts().assumeRole(
  new AssumeRoleCommand({
    RoleArn: targetRoleArn,
    RoleSessionName: "role-session",
  }),
  {
    caller: { kind: "arn", arn: sourceRoleArn },
  },
);

console.log(assumeRoleOutput.AssumedRoleUser?.Arn);
```

If either check fails, STS raises a 403 access-denied error naming `sts:AssumeRole` and the target
role ARN. No session is created.

Cross-account assumption uses the same checks. Call `assumeRole` through the source account. The
session belongs to the target role's account.

## Role chaining

For role chaining, use the first session as the caller of the second `assumeRole` request. The target
trust policy names the first role, and that role needs identity permission to assume the target.

A trust policy may name the role ARN or one assumed-role session ARN. Prefer the role ARN when the
session name is chosen at run time.

The served endpoint resolves session credentials in the same way.

## ExternalId

A trust policy can require `sts:ExternalId`. Pass the matching `ExternalId` to `AssumeRoleCommand`.

```typescript sim-sts-external-id
/**
 * Requiring an ExternalId in a simulated Role trust policy.
 */

import { CreateRoleCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const account = simAws.account("123456789012");

await account.iam().createRole(
  new CreateRoleCommand({
    RoleName: "PartnerRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::123456789012:root" },
        Action: "sts:AssumeRole",
        Condition: {
          StringEquals: {
            "sts:ExternalId": "expected-external-id",
          },
        },
      },
    }),
  }),
);

const assumeRoleOutput = await account.sts().assumeRole(
  new AssumeRoleCommand({
    RoleArn: "arn:aws:iam::123456789012:role/PartnerRole",
    RoleSessionName: "partner-session",
    ExternalId: "expected-external-id",
  }),
);

console.log(assumeRoleOutput.AssumedRoleUser?.Arn);
```

An omitted or mismatched value denies the request.

## Session policies

Pass `Policy`, `PolicyArns` or both to cap what a session may do. The session gets only what both
the Role's policies and its session policies allow. A session policy only narrows what the Role
allows.

```typescript sim-sts-session-policy
/**
 * Capping a simulated Role session with an inline session policy.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "DataRole",
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

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "DataRole",
    PolicyName: "S3ReadWrite",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: ["s3:GetObject", "s3:PutObject"],
        Resource: "*",
      },
    }),
  }),
);

const assumed = await simAws.sts().assumeRole(
  new AssumeRoleCommand({
    RoleArn: "arn:aws:iam::123456789012:role/DataRole",
    RoleSessionName: "read-only",
    Policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "s3:GetObject", Resource: "*" },
    }),
  }),
);

const caller = {
  kind: "credentials" as const,
  credentials: {
    accessKeyId: assumed.Credentials!.AccessKeyId!,
    secretAccessKey: assumed.Credentials!.SecretAccessKey!,
    sessionToken: assumed.Credentials!.SessionToken!,
  },
};

const write = simAws.iam().authorize({
  action: "s3:PutObject",
  resource: "arn:aws:s3:::reports/q1.csv",
  caller,
});

console.log(write.isAllowed); // false
// because no session policy allows the s3:PutObject action
console.log(write.denialReason);
```

`PolicyArns` names up to 10 managed policies in the Role's Account. Each is read when the Role is
assumed, and an ARN naming a missing policy adds no Allow. A `Policy` has to be a JSON object, and
anything else is refused with `MalformedPolicyDocument`.

A resource policy naming the session ARN allows the request past the session policy. One naming
the Role is held back by it, as AWS documents. A session's own policies also apply when it calls
`assumeRole` for a second Role.

## Session duration

`DurationSeconds` defaults to 3,600 seconds. STS accepts 900 to 43,200, and the Role's
`MaxSessionDuration` caps it further. A Role left without one allows an hour, and IAM's
`UpdateRoleCommand` raises or lowers it. A session assuming
another Role is role chaining, which AWS caps at one hour whatever the Role allows. Each of these
is refused with a `ValidationError` carrying the message STS sends.

`RoleSessionName` takes 2 to 64 characters from letters, digits and `_+=,.@-`. `ExternalId` takes 2
to 1,224 characters and also allows `:` and `/`. A value outside those is refused with a
`ValidationError` naming the member and the constraint.

## Available functionality

Sim STS currently supports:

- `AssumeRoleCommand`
- `GetCallerIdentityCommand`
- Trust-policy evaluation against the target Role's assume-role policy document
- Identity-policy evaluation of the source caller, requiring `sts:AssumeRole` permission on the
  target Role
- Role-to-Role and cross-Account assumption
- `ExternalId` matching through the `sts:ExternalId` trust-policy condition key
- Session duration with `DurationSeconds`, defaulting to one hour and capped by the Role's
  `MaxSessionDuration` and the one-hour role-chaining limit
- Inline and managed session policies through `Policy` and `PolicyArns`
- `RoleSessionName` and `ExternalId` length and character checks
- Temporary credentials registered with the target Account's sim IAM, including session-token and
  expiry validation

## Limitations

- Federation, web identity and session-token commands are unsupported.
- Session tags and `SourceIdentity` are ignored
- The 2,048-character cap on session policy text and the packed size limit go unchecked
- Condition support in trust policies is limited to the operators supported by
  [sim IAM](https://yulinsim.dev/services/iam/#policy-conditions)
