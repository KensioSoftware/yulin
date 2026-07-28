# Simulated Secrets Manager

Yulin includes a simulated AWS Secrets Manager for tests and local development.

The point of simulating it is the part mocking an SDK client cannot tell you: whether the secret exists, whether the caller's execution role is allowed to read it, and whether the code reached the right account and region. A handler that fetches a database password on cold start can be exercised end to end, and a policy that would fail on real AWS fails here too.

Secrets Manager-specific types are imported from the `@kensio/yulin/secretsmanager` subpath.

## Available functionality

Sim Secrets Manager currently supports:

- Creating secrets with `CreateSecretCommand`, holding either a string or binary
- Reading values with `GetSecretValueCommand`, by staging label or by version id
- Writing new versions with `PutSecretValueCommand` and `UpdateSecretCommand`
- Describing and listing with `DescribeSecretCommand` and `ListSecretsCommand`
- Deleting with `DeleteSecretCommand`, with a real recovery window, and taking it back with `RestoreSecretCommand`
- `AWSCURRENT` and `AWSPREVIOUS` staging labels, and custom labels of your own
- Secret ARNs carrying the six random characters real Secrets Manager appends
- Friendly names, full ARNs and partial ARNs as interchangeable ways to name a secret
- Authorization of every operation by simulated IAM, against the real IAM action
- Calls made from inside a simulated Lambda handler, authorized as the function's execution role

The simulator focuses on useful behaviour for isolated tests and local development rather than full Secrets Manager feature parity.

## Creating and reading a secret

```typescript sim-secrets-manager-create-and-read
/**
 * Creating a simulated secret and reading it back.
 */

import {
  CreateSecretCommand,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const secretsManager = simAws.secretsManager();

await secretsManager.createSecret(
  new CreateSecretCommand({
    Name: "db-creds",
    SecretString: JSON.stringify({ username: "app", password: "hunter2" }),
  }),
);

const read = await secretsManager.getSecretValue(
  new GetSecretValueCommand({ SecretId: "db-creds" }),
);

const credentials = JSON.parse(read.SecretString ?? "{}") as {
  password?: string;
};

console.log(credentials.password); // "hunter2"
```

`SecretString` and `SecretBinary` are mutually exclusive on write, and exactly one of them comes back on read.

## Secret ARNs and IAM policies

Real Secrets Manager appends a hyphen and six random characters to the secret name in its ARN, so a secret named `db-creds` gets an ARN ending `:secret:db-creds-AbCdEf`. This is the detail that most often breaks a policy on real AWS, and it is reproduced here: a policy naming the bare ARN matches nothing, and a policy has to end in `-??????` or a wildcard.

```typescript sim-secrets-manager-iam-policy
/**
 * A simulated IAM policy allowing for the random suffix on a secret ARN.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateSecretCommand,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;
const regionName = simAws.defaultRegionName;

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "SecretReader",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: `arn:aws:iam::${accountId}:root` },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "SecretReader",
    PolicyName: "ReadDbCreds",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "secretsmanager:GetSecretValue",
        // Without the six wildcard characters this policy would match nothing.
        Resource: `arn:aws:secretsmanager:${regionName}:${accountId}:secret:db-creds-??????`,
      },
    }),
  }),
);

await simAws
  .secretsManager()
  .createSecret(
    new CreateSecretCommand({ Name: "db-creds", SecretString: "hunter2" }),
  );

const read = await simAws
  .secretsManager()
  .getSecretValue(new GetSecretValueCommand({ SecretId: "db-creds" }), {
    caller: { kind: "arn", arn: role.Role.Arn },
  });

console.log(read.SecretString); // "hunter2"
```

`ListSecrets` is the exception: real Secrets Manager gives it no resource-level permissions, so a policy allowing it has to use a resource of `*`. A policy naming individual secret ARNs grants nothing, here as there.

## Naming a secret

Every operation takes its target as a `SecretId`, and any of the three forms real Secrets Manager accepts will do: the friendly name, the full ARN including the suffix, or the partial ARN without it.

An ARN naming another account or region resolves to nothing, rather than having its name read out and looked up locally, so a foreign ARN cannot reach a secret that happens to share a name.

## Versions and staging labels

Every write creates a version rather than replacing one. `AWSCURRENT` names the version a plain read returns, and writing a new current version demotes the previous one to `AWSPREVIOUS`.

```typescript sim-secrets-manager-staging-labels
/**
 * Staging labels moving as a simulated secret is rotated by hand.
 */

import {
  CreateSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const secretsManager = simAws.secretsManager();

await secretsManager.createSecret(
  new CreateSecretCommand({ Name: "api-key", SecretString: "old-key" }),
);

await secretsManager.putSecretValue(
  new PutSecretValueCommand({ SecretId: "api-key", SecretString: "new-key" }),
);

const current = await secretsManager.getSecretValue(
  new GetSecretValueCommand({ SecretId: "api-key" }),
);
const previous = await secretsManager.getSecretValue(
  new GetSecretValueCommand({
    SecretId: "api-key",
    VersionStage: "AWSPREVIOUS",
  }),
);

console.log(current.SecretString); // "new-key"
console.log(previous.SecretString); // "old-key"
```

A `ClientRequestToken` becomes the version id, as it does on real AWS. Repeating a write with the same token and the same value is ignored, which is what makes a retry safe; the same token with a different value is refused, because a version's value never changes once written.

`DescribeSecret` reports `VersionIdsToStages`, which lists only the versions still carrying a staging label. A version that has lost every label is on its way out of existence, so it is left out.

## Deletion and the recovery window

`DeleteSecret` does not delete. It schedules deletion after a recovery window of 7 to 30 days, defaulting to 30, and during that window the secret is still there: it can be described and restored, it refuses to be read or written, and — the part that catches people out — it still holds its name.

That last one is the failure a redeployed stack actually hits, so it is worth being able to reproduce. Advancing the simulated clock past the window frees the name.

```typescript sim-secrets-manager-deletion
/**
 * A simulated secret holding its name until the recovery window elapses.
 */

import {
  CreateSecretCommand,
  DeleteSecretCommand,
} from "@aws-sdk/client-secrets-manager";

import { SimAws } from "@kensio/yulin";
import { SimSecretsManagerInvalidRequestException } from "@kensio/yulin/secretsmanager";

const simAws = new SimAws();
const secretsManager = simAws.secretsManager();

await secretsManager.createSecret(
  new CreateSecretCommand({ Name: "db-creds", SecretString: "hunter2" }),
);

await secretsManager.deleteSecret(
  new DeleteSecretCommand({ SecretId: "db-creds", RecoveryWindowInDays: 7 }),
);

try {
  await secretsManager.createSecret(
    new CreateSecretCommand({ Name: "db-creds", SecretString: "hunter2" }),
  );
} catch (error) {
  // The name is still taken by the secret waiting out its window.
  console.log(error instanceof SimSecretsManagerInvalidRequestException); // true
}

await simAws.clock().advanceBy({ days: 8 });

// Now the secret is gone and the name is free again.
const recreated = await secretsManager.createSecret(
  new CreateSecretCommand({ Name: "db-creds", SecretString: "hunter2" }),
);

console.log(recreated.Name); // "db-creds"
```

`ForceDeleteWithoutRecovery` deletes at once and frees the name straight away. Asking for it alongside `RecoveryWindowInDays` is a contradiction, and is refused.

See [simulated time](../../time/ "Simulated time docs") for what else the clock can do.

## Scoping

Secrets belong to an account and a region, as they do on real AWS. A secret name is unique within one account and region and nowhere wider, so the same name can be used in two regions for two different secrets.

```typescript sim-secrets-manager-scoping
/**
 * Simulated secrets are scoped to an account and region.
 */

import {
  CreateSecretCommand,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

import { SimAws } from "@kensio/yulin";
import { SimSecretsManagerResourceNotFoundException } from "@kensio/yulin/secretsmanager";

const simAws = new SimAws();

await simAws
  .account("222222222222")
  .region("eu-west-2")
  .secretsManager()
  .createSecret(
    new CreateSecretCommand({ Name: "db-creds", SecretString: "hunter2" }),
  );

try {
  await simAws
    .account("222222222222")
    .region("us-east-1")
    .secretsManager()
    .getSecretValue(new GetSecretValueCommand({ SecretId: "db-creds" }));
} catch (error) {
  console.log(error instanceof SimSecretsManagerResourceNotFoundException); // true
}
```

## Inside a simulated Lambda handler

Function code requiring `@aws-sdk/client-secrets-manager` is routed into the same simulated AWS environment, with the function's execution role as the caller. A handler fetching a secret therefore has to be allowed to, by that role's policy, the same as on real AWS. See [simulated Lambda](../lambda/ "Simulated Lambda docs") for how function code and execution roles work.

The same applies to `SimSdk` interception: intercepting `SecretsManagerClient` routes ordinary SDK code into the simulation with nothing touching the network. See [AWS SDK interception](../../sdk/ "Simulated AWS SDK docs").

## Limitations

Current documented limitations:

- Secret values are not encrypted. `KmsKeyId` is accepted and reported by `DescribeSecret`, but nothing is encrypted with it and no `kms:Decrypt` check happens. That is looser than real AWS, where a caller also needs permission on the key. Simulated KMS is not wired into this service yet.
- A secret name ending in a hyphen and six alphanumeric characters is refused, which is stricter than AWS. Real AWS only advises against such names, because they cannot be told apart from an ARN's resource part when a partial ARN is resolved. Note that this rules out ordinary-looking names such as `app-secret` and `prod-config`, since `secret` and `config` are six characters; name them `app-credentials` or `prod-settings` instead.
- `RotateSecret`, `CancelRotateSecret` and the rotation Lambda protocol are not simulated. `DescribeSecret` always reports `RotationEnabled` as `false`.
- `AWS::SecretsManager::Secret` and the other CloudFormation resource types are not supported yet, and neither are `{{resolve:secretsmanager:...}}` dynamic references.
- Resource policies (`PutResourcePolicy`, `GetResourcePolicy`, `DeleteResourcePolicy`, `ValidateResourcePolicy`) are not simulated, so cross-account access to a secret cannot be granted.
- Replica regions are not simulated. `AddReplicaRegions`, `ReplicateSecretToRegions` and `RemoveRegionsFromReplication` do nothing, and `ReplicationStatus` is not reported.
- `BatchGetSecretValue` is not supported, and neither is the Parameters and Secrets Lambda Extension HTTP endpoint.
- `ListSecrets` refuses `Filters`, `SortOrder` and `SortBy` rather than ignoring them, since quietly returning an unfiltered or differently ordered list would be worse. Secrets are listed in creation order, with `MaxResults` and `NextToken` paging over them. A `NextToken` this simulation did not issue, including one whose offset is past the end of the list, is refused rather than answered with an empty page.
- Tags are stored and reported by `DescribeSecret` and `ListSecrets`, but `TagResource` and `UntagResource` are not supported, and the `secretsmanager:ResourceTag` and `aws:ResourceTag` condition keys are not derived.
- Other Secrets Manager condition keys, such as `secretsmanager:SecretId` and `secretsmanager:VersionStage`, are not derived either, so a policy relying on them will not match. Ordinary condition operators on values sim IAM does supply work as usual.
- A version that loses every staging label is kept indefinitely and stays readable by version id, rather than being removed as real Secrets Manager removes it after about a day. It is left out of `VersionIdsToStages` either way.
- `LastAccessedDate`, `LastRotatedDate`, `NextRotationDate`, `OwningService` and `PrimaryRegion` are not reported.
- Secret values live in process memory for the lifetime of the `SimAws` instance. That is fine for a simulator, but it is not a security boundary: anything sharing the process can reach them.
- Secrets Manager is not served as an HTTP API by `serveSimAws`.
