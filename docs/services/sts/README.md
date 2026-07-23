# Simulated STS

Yulin includes a simulated STS (Security Token Service) for isolated tests, local development, and
CI.

Sim STS is used through `SimAws` as `simAws.sts()`, scoped to the Account making the assume
request. Its job is to simulate assuming IAM Roles: it evaluates the request against
[simulated IAM](../iam/) policies and issues temporary session credentials that the rest of the
simulated environment authenticates like real AWS credentials.

## Available functionality

Sim STS currently supports:

- Assuming Roles with `AssumeRoleCommand`
- Trust-policy evaluation against the target Role's assume-role policy document
- Identity-policy evaluation of the source caller, requiring `sts:AssumeRole` permission on the
  target Role
- Role-to-Role and cross-Account assumption
- `ExternalId` matching through the `sts:ExternalId` trust-policy condition key
- Session duration with `DurationSeconds`, defaulting to one hour
- Temporary credentials registered with the target Account's sim IAM, including session-token and
  expiry validation

The simulator focuses on useful behavior for isolated tests and local development rather than full
STS feature parity. Unsupported STS options may be ignored or may throw errors depending on whether
the simulator needs them to model the requested behaviour.

## Basic usage

Create a Role whose trust policy allows the Account to assume it, then assume it through STS. An
omitted caller defaults to the Account root principal.

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

The output matches the AWS shape: `AssumedRoleUser.Arn` is the session ARN, such as
`arn:aws:sts::123456789012:assumed-role/TargetRole/test-session`, and `Credentials` carries the
temporary `AccessKeyId`, `SecretAccessKey`, `SessionToken`, and `Expiration`.

The issued credentials are registered with the target Account's sim IAM, so they can authenticate
later simulated requests — for example as the `caller` of an IAM authorization attempt, where
identity policies come from the underlying Role. See
[the sim IAM docs](../iam/#sts-assumerole-sessions) for a full example. Credentials missing their
session token, or used after `Expiration`, are rejected with an AWS-like invalid-credentials error.

`DurationSeconds` controls the session lifetime and defaults to 3600 seconds (one hour); it must be
a positive integer.

## Role-to-Role assumption

Pass a caller to assume a Role as a specific principal instead of the Account root. As in real AWS,
both sides of the request are then evaluated:

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

If either side denies the request — the trust policy does not cover the caller, the caller has no
identity policy allowing `sts:AssumeRole`, or an explicit `Deny` matches — STS throws an AWS-like
access-denied error with a `403` status code, naming the `sts:AssumeRole` action and the target
Role ARN, and no session is created.

Cross-Account assumption works the same way: create the source and target Roles in different
simulated Accounts of the same `SimAws` instance, and call `assumeRole` on the source Account's
`sts()`. The issued session belongs to the target Role's Account.

## ExternalId

A trust policy can require an external ID through the `sts:ExternalId` condition key. The
`ExternalId` supplied to `AssumeRoleCommand` is matched against it.

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

An omitted or mismatched `ExternalId` leaves the trust-policy condition unmatched, so the assume
request is denied.

## Limitations

Sim STS models Role assumption rather than the full STS API. Notable gaps:

- `AssumeRoleCommand` is the only supported command — there is no `GetCallerIdentity`, federation,
  or web-identity support
- Session policies (`Policy` / `PolicyArns`), tags, and `SourceIdentity` requests are not evaluated
- Condition support in trust policies is limited to the operators supported by
  [sim IAM](../iam/#policy-conditions)
