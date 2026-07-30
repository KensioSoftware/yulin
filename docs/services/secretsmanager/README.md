# Simulated Secrets Manager

Yulin includes a simulated AWS Secrets Manager for tests and local development. Secrets are stored
in memory, versioned by staging label, and every operation is authorized by simulated IAM.

Secrets Manager-specific types are imported from the `@kensio/yulin/secretsmanager` subpath.

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

`SecretString` and `SecretBinary` are mutually exclusive on write, and exactly one of them comes back
on read.

## Encryption and KMS permissions

Every version is encrypted through simulated KMS when it is written and decrypted when
`GetSecretValue` reads it. There is no flag for reading a secret without decrypting it: the read
either returns the plaintext or fails.

A secret naming no `KmsKeyId` uses the `aws/secretsmanager` AWS managed key, which asks the caller
for no KMS permission at all. Secrets Manager supplies `kms:ViaService`, and that key's policy allows
the account's principals to use it through Secrets Manager. A Lambda role granted only
`secretsmanager:GetSecretValue` therefore reads the secret, as it does on real AWS.

Pass `KmsKeyId` to encrypt under a customer managed key instead, and the caller's own permissions on
that key start to matter. Secrets Manager uses envelope encryption, asking KMS for a data key per
version, so a write needs `kms:GenerateDataKey` and a read needs `kms:Decrypt`. A role granted the
secret but not the key fails here rather than in a deployment.

```typescript sim-secrets-manager-customer-key
/**
 * A Role allowed to read a simulated secret but not to decrypt it.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateKeyCommand } from "@aws-sdk/client-kms";
import {
  CreateSecretCommand,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;

const key = await simAws
  .kms()
  .createKey(new CreateKeyCommand({ Description: "Secret key" }));

await simAws.secretsManager().createSecret(
  new CreateSecretCommand({
    Name: "db-credentials",
    SecretString: "hunter2",
    KmsKeyId: key.KeyMetadata?.Arn,
  }),
);

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

// The secret is allowed, the key is not.
await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "SecretReader",
    PolicyName: "ReadDbCredentials",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "secretsmanager:GetSecretValue",
        Resource: "*",
      },
    }),
  }),
);

const caller = { kind: "arn", arn: role.Role.Arn } as const;

try {
  await simAws
    .secretsManager()
    .getSecretValue(new GetSecretValueCommand({ SecretId: "db-credentials" }), {
      caller,
    });
} catch (error) {
  console.log((error as Error).name); // "AccessDenied"
}
```

Each version is bound to its own secret ARN and version id as the KMS encryption context, as real
Secrets Manager binds them. A `KmsKeyId` naming a key that does not exist, is disabled, or is pending
deletion fails with `EncryptionFailure` when a value is written under it, and a version whose key has
since become unusable fails with `DecryptionFailure` when it is read.

Changing `KmsKeyId` applies to versions written afterwards. The versions already written keep the key
they were made with and stay readable, which is what real AWS does too.

## Secret ARNs and IAM policies

Real Secrets Manager appends a hyphen and six random characters to the secret name in its ARN, so a
secret named `db-creds` gets an ARN ending `:secret:db-creds-AbCdEf`. Sim Secrets Manager does the
same. A policy naming the bare ARN therefore matches nothing, and a policy has to end in `-??????` or
a wildcard.

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

`ListSecrets` is the exception: real Secrets Manager gives it no resource-level permissions, so a
policy allowing it has to use a resource of `*`. A policy naming individual secret ARNs grants
nothing, here as there.

## Naming a secret

Every operation takes its target as a `SecretId`, and any of the three forms real Secrets Manager
accepts will do: the friendly name, the full ARN including the suffix, or the partial ARN without it.

An ARN naming another account or region resolves to nothing, rather than having its name read out and
looked up locally. A foreign ARN cannot reach a secret that happens to share a name.

## Versions and staging labels

Every write creates a version rather than replacing one. `AWSCURRENT` names the version a plain read
returns, and writing a new current version demotes the previous one to `AWSPREVIOUS`.

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

A `ClientRequestToken` becomes the version id, as it does on real AWS. Repeating a write with the
same token and the same value is ignored, which makes a retry safe. The same token with a different
value is refused, because a version's value never changes once written.

`DescribeSecret` reports `VersionIdsToStages`, which lists only the versions still carrying a staging
label. A version that has lost every label is on its way out of existence, so it is left out.

## Deletion and the recovery window

`DeleteSecret` does not delete. It schedules deletion after a recovery window of 7 to 30 days,
defaulting to 30. During that window the secret is still there: it can be described and restored, it
refuses to be read or written, and it still holds its name.

Holding the name is what a redeployed stack hits. Advancing the simulated clock past the window frees
it.

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

`ForceDeleteWithoutRecovery` deletes at once and frees the name straight away. Asking for it
alongside `RecoveryWindowInDays` is a contradiction, and is refused.

See [simulated time](../../time/ "Simulated time docs") for what else the clock can do.

## Scoping

Secrets belong to an account and a region, as they do on real AWS. A secret name is unique within one
account and region and nowhere wider, so the same name can be used in two regions for two different
secrets.

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

## Deploying a secret from CloudFormation

Simulated CloudFormation creates a secret from an `AWS::SecretsManager::Secret` resource, in the
stack's account and region. A template either supplies the value with `SecretString` or asks Secrets
Manager to generate one with `GenerateSecretString`, as on real AWS. Declaring both is refused, as
CloudFormation refuses it.

`Ref` on the resource gives the full secret ARN, random suffix and all, and `Fn::GetAtt … Id` gives
the same. A `Ref` is therefore usable directly as a `SecretId`, whether it goes into a Lambda's
environment or into an IAM policy resource.

```typescript sim-secrets-manager-cloudformation-secret
/**
 * Deploying a secret from a CloudFormation template and reading back the
 * password the deployment generated.
 */

import { GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "database-stack",
  template: {
    Resources: {
      DbSecret: {
        Type: "AWS::SecretsManager::Secret",
        Properties: {
          Name: "db-credentials",
          Description: "Credentials for the application database",
          GenerateSecretString: {
            SecretStringTemplate: JSON.stringify({ username: "app" }),
            GenerateStringKey: "password",
            PasswordLength: 24,
            ExcludePunctuation: true,
          },
        },
      },
    },
    Outputs: {
      DbSecretArn: {
        Value: { Ref: "DbSecret" },
      },
    },
  },
});

await stack.waitForDeployComplete();

// Ref resolves to the ARN including its suffix, so it works as a SecretId.
const secretArn = stack.outputs.get("DbSecretArn")?.value as string;

const read = await simAws
  .secretsManager()
  .getSecretValue(new GetSecretValueCommand({ SecretId: secretArn }));

const credentials = JSON.parse(read.SecretString ?? "{}") as {
  username?: string;
  password?: string;
};

console.log(credentials.username); // "app"
console.log(credentials.password?.length); // 24
```

Generated passwords are random, so a test reads the value back out of the simulation the way a
deployed application does rather than predicting it.

`SecretStringTemplate` and `GenerateStringKey` go together: the generated password is added to the
template's JSON object under that key. Without them, the whole secret value is the generated
password. That is what an empty `GenerateSecretString: {}` produces, which is the property CDK
synthesises for a `secretsmanager.Secret` with no options.

The other generation options behave as they do on real AWS: `PasswordLength` (32 by default),
`ExcludeCharacters`, `ExcludeUppercase`, `ExcludeLowercase`, `ExcludeNumbers`, `ExcludePunctuation`,
`IncludeSpace`, and `RequireEachIncludedType`. The last is on unless turned off, so a generated
password carries one of every character type it was not told to exclude.

A secret with no `Name` is named after its logical ID. Real CloudFormation names it after the stack
and appends its own random characters, so a template cannot rely on the exact generated name either
way.

## Inside a simulated Lambda handler

Function code requiring `@aws-sdk/client-secrets-manager` is routed into the same simulated AWS
environment, with the function's execution role as the caller. A handler fetching a secret therefore
has to be allowed to, by that role's policy, the same as on real AWS. See
[simulated Lambda](../lambda/ "Simulated Lambda docs") for how function code and execution roles
work.

The same applies to `SimSdk` interception: intercepting `SecretsManagerClient` routes ordinary SDK
code into the simulation with nothing touching the network. See
[AWS SDK interception](../../sdk/ "Simulated AWS SDK docs").

## Available functionality

Sim Secrets Manager currently supports:

- `CreateSecretCommand`, holding either a string or binary
- `GetSecretValueCommand`, by staging label or by version id
- `PutSecretValueCommand` and `UpdateSecretCommand`, each writing a new version
- `DescribeSecretCommand` and `ListSecretsCommand`
- `DeleteSecretCommand`, with a recovery window, and `RestoreSecretCommand`
- `AWSCURRENT` and `AWSPREVIOUS` staging labels, and custom labels
- Secret ARNs carrying the six random characters real Secrets Manager appends
- Friendly names, full ARNs and partial ARNs as interchangeable ways to name a secret
- Authorization of every operation by simulated IAM, against the real IAM action
- Encryption of every version through simulated KMS, under `KmsKeyId` or the `aws/secretsmanager`
  managed key
- Calls made from inside a simulated Lambda handler, authorized as the function's execution role
- The `AWS::SecretsManager::Secret` CloudFormation resource, including `GenerateSecretString`

## Limitations

Current documented limitations:

- A `KmsKeyId` is checked when a version is written under it, not when it is set on its own. An
  `UpdateSecret` changing only the key accepts a key that does not exist, and the next write of a
  value fails.
- A secret name ending in a hyphen and six alphanumeric characters is refused, which is stricter than
  AWS. Real AWS only advises against such names, because they cannot be told apart from an ARN's
  resource part when a partial ARN is resolved. This rules out ordinary-looking names such as
  `app-secret` and `prod-config`, since `secret` and `config` are six characters. Name them
  `app-credentials` or `prod-settings` instead.
- `RotateSecret`, `CancelRotateSecret` and the rotation Lambda protocol are not simulated.
  `DescribeSecret` always reports `RotationEnabled` as `false`.
- `AWS::SecretsManager::Secret` supports `Name`, `Description`, `KmsKeyId`, `SecretString`,
  `GenerateSecretString` and `Tags`. `ReplicaRegions` is ignored. The other resource types
  (`SecretTargetAttachment`, `RotationSchedule` and `ResourcePolicy`) are reported as unsupported and
  skipped rather than deployed.
- A template declaring neither `SecretString` nor `GenerateSecretString` is refused, which is
  stricter than real CloudFormation. Real CloudFormation creates an empty secret in that case, and a
  secret with no version is not simulated.
- `ExcludeCharacters` that removes every character of an included type is refused rather than
  generating a password missing a type it was told to include.
- `{{resolve:secretsmanager:...}}` dynamic references are not supported. That is a CloudFormation
  engine feature rather than a Secrets Manager one; pass the ARN from `Ref` instead.
- Resource policies (`PutResourcePolicy`, `GetResourcePolicy`, `DeleteResourcePolicy`,
  `ValidateResourcePolicy`) are not simulated, so cross-account access to a secret cannot be granted.
- Replica regions are not simulated. `AddReplicaRegions`, `ReplicateSecretToRegions` and
  `RemoveRegionsFromReplication` do nothing, and `ReplicationStatus` is not reported.
- `BatchGetSecretValue` is not supported, and neither is the Parameters and Secrets Lambda Extension
  HTTP endpoint.
- `ListSecrets` refuses `Filters`, `SortOrder` and `SortBy` rather than ignoring them, since quietly
  returning an unfiltered or differently ordered list would be worse. Secrets are listed in creation
  order, with `MaxResults` and `NextToken` paging over them. A `NextToken` this simulation did not
  issue, including one whose offset is past the end of the list, is refused rather than answered with
  an empty page.
- Tags are stored and reported by `DescribeSecret` and `ListSecrets`, but `TagResource` and
  `UntagResource` are not supported, and the `secretsmanager:ResourceTag` and `aws:ResourceTag`
  condition keys are not derived.
- Other Secrets Manager condition keys, such as `secretsmanager:SecretId` and
  `secretsmanager:VersionStage`, are not derived either, so a policy relying on them will not match.
  Ordinary condition operators on values sim IAM does supply work as usual.
- A version that loses every staging label is kept indefinitely and stays readable by version id,
  rather than being removed as real Secrets Manager removes it after about a day. It is left out of
  `VersionIdsToStages` either way.
- `LastAccessedDate`, `LastRotatedDate`, `NextRotationDate`, `OwningService` and `PrimaryRegion` are
  not reported.
- Secret values live in process memory for the lifetime of the `SimAws` instance. That is not a
  security boundary: anything sharing the process can reach them.
- Secrets Manager is not served as an HTTP API by `serveSimAws`.
