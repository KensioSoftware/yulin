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

`DurationSeconds` defaults to 3,600 seconds and must be a positive integer.

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

## Available functionality

Sim STS currently supports:

- `AssumeRoleCommand`
- `GetCallerIdentityCommand`
- Trust-policy evaluation against the target Role's assume-role policy document
- Identity-policy evaluation of the source caller, requiring `sts:AssumeRole` permission on the
  target Role
- Role-to-Role and cross-Account assumption
- `ExternalId` matching through the `sts:ExternalId` trust-policy condition key
- Session duration with `DurationSeconds`, defaulting to one hour
- Temporary credentials registered with the target Account's sim IAM, including session-token and
  expiry validation

## Limitations

- Federation, web identity and session-token commands are unsupported.
- Session policies (`Policy` / `PolicyArns`), tags, and `SourceIdentity` requests are not evaluated
- Condition support in trust policies is limited to the operators supported by
  [sim IAM](https://yulinsim.dev/services/iam/#policy-conditions)
