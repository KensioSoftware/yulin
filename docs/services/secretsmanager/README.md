# Simulated Secrets Manager

Yulin simulates AWS Secrets Manager in memory. Secrets have encrypted versions and staging labels,
and simulated IAM authorizes every operation.

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

Every secret version is encrypted through simulated KMS. `GetSecretValue` decrypts the version and
either returns its plaintext or fails.

A secret without `KmsKeyId` uses the `aws/secretsmanager` AWS managed key. Its policy permits use
through Secrets Manager, so callers do not need a separate KMS permission.

Pass `KmsKeyId` to use a customer managed key. Writing a version requires `kms:GenerateDataKey`, and
reading it requires `kms:Decrypt`, in addition to the relevant Secrets Manager permission.

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
Secrets Manager binds them. A `KmsKeyId` naming a key that is absent, disabled, or pending deletion
fails with `EncryptionFailure` when a value is written under it, and a version whose key has since
become unusable fails with `DecryptionFailure` when it is read.

Changing `KmsKeyId` applies to versions written afterwards. The versions already written keep the key
they were made with and stay readable, as they do on real AWS.

## Secret ARNs and IAM policies

Secret ARNs end with a hyphen and six random characters. A secret named `db-creds`, for example,
gets an ARN ending in `:secret:db-creds-AbCdEf`. An IAM resource pattern for the secret must include
that suffix, such as `-??????` or `-*`.

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

`ListSecrets` is the exception. Real Secrets Manager gives it no resource-level permissions, and a
policy allowing it has to use a resource of `*`. A policy naming individual secret ARNs grants
nothing, here as there.

## Naming a secret

`SecretId` accepts the friendly name, the full ARN with its random suffix, or the partial ARN without
the suffix.

An ARN naming another account or region resolves to no secret at all. Its name is never read out and
looked up locally, and a foreign ARN cannot reach a secret that happens to share a name.

## Versions and staging labels

Every write creates a version. `AWSCURRENT` marks the version returned by a plain read. Writing a new
current version moves `AWSPREVIOUS` to the former current version.

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
same token and the same value is ignored, so a retry is safe. The same token with a different
value is refused, because a version's value never changes once written.

`DescribeSecret` reports `VersionIdsToStages`. That lists only the versions still carrying a staging
label. A version that has lost every label is on its way out of existence, and is left out.

## Deletion and the recovery window

`DeleteSecret` schedules deletion after a recovery window of 7 to 30 days, defaulting to 30. During
that window the secret can be described or restored, but it cannot be read or changed. Its name also
remains reserved. Advance simulated time past the window to complete deletion.

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

See [simulated time](https://yulinsim.dev/time/ "Simulated time docs") for what else the clock can do.

## Scoping

Secrets belong to an account and a region, as they do on real AWS. A secret name is unique within one
account and region and nowhere wider. The same name can be used in two regions for two different
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
const secretArn = stack.output("DbSecretArn");

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

Generated passwords are random. Read the deployed value through Secrets Manager instead of asserting
on an exact password.

## Reading a secret with a dynamic reference

A `{{resolve:secretsmanager:...}}` dynamic reference reads an existing secret while CloudFormation
creates the resource containing the reference. CDK emits this form for
`SecretValue.secretsManager`.

The whole form is
`{{resolve:secretsmanager:secret-id:secret-string:json-key:version-stage:version-id}}`. Only the
secret id is required, and it takes a friendly name, a full ARN or a partial ARN. Every segment
after it can be left empty, so `{{resolve:secretsmanager:db-credentials::::}}` reads what
`{{resolve:secretsmanager:db-credentials}}` reads.

- `secret-string` accepts `SecretString` and refuses anything else. (AWS documents the segment as
  the field to read, and `SecretString` is the only field a dynamic reference has ever read.)
- `json-key` names one key of a secret holding a JSON object. Omitting it reads the whole secret
  string.
- `version-stage` and `version-id` select a version, defaulting to `AWSCURRENT`. A reference carries
  one or the other, and giving both is refused.

```typescript sim-secrets-manager-dynamic-reference
/**
 * A CloudFormation template reading a secret into a Lambda function's
 * environment.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";
import { CreateSecretCommand } from "@aws-sdk/client-secrets-manager";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.secretsManager().createSecret(
  new CreateSecretCommand({
    Name: "db-credentials",
    SecretString: JSON.stringify({ username: "app", password: "hunter2" }),
  }),
);

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "api-stack",
  template: {
    Resources: {
      ApiRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "ApiRole",
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "lambda.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          },
        },
      },
      ApiFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "api",
          Role: { "Fn::GetAtt": ["ApiRole", "Arn"] },
          Handler: "index.handler",
          Runtime: "nodejs20.x",
          Environment: {
            Variables: {
              DB_USERNAME:
                "{{resolve:secretsmanager:db-credentials:SecretString:username}}",
              DB_PASSWORD:
                "{{resolve:secretsmanager:db-credentials:SecretString:password}}",
            },
          },
          Code: {
            ZipFile: "exports.handler = async () => process.env.DB_USERNAME;",
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

// The function was created holding the values the references resolved to.
const output = await simAws
  .lambda()
  .invoke(new InvokeCommand({ FunctionName: "api" }));

const username = JSON.parse(
  Buffer.from(output.Payload ?? []).toString(),
) as string;

console.log(username); // "app"

await simAws.backgroundTasksComplete();
```

A reference can sit inside a longer string, where only the reference itself is replaced. One written
inside `Fn::Sub` is read after the variables around it are substituted.

A full ARN naming another account is read from that account's simulated Secrets Manager, as real
CloudFormation reads it. A friendly name and a partial ARN both name a secret in the stack's own
account and region.

The value is decrypted through simulated KMS on the way out, the same as `GetSecretValue` decrypts
it. A secret under a customer managed key that the simulation cannot decrypt resolves to a stand-in
value.

Real CloudFormation makes no dependency out of a dynamic reference, and neither does this. A secret
another resource of the same stack creates is only there in time when the template says `DependsOn`.

Resource properties are reported as they resolved, including this one. Real CloudFormation keeps a
resolved secret out of its own logs and events, and sim CloudFormation has no such protection.

### Unresolved references

If Yulin cannot resolve a reference, it substitutes `dummy-value-for-<secret-id>` and continues the
deployment.

The substitution is recorded on
[`stack.ignoredProperties`](https://yulinsim.dev/services/cloudformation/#properties-a-resource-was-created-without),
naming the property that held the reference and why the value is a stand-in. A `json-key` the secret
has no value for, a version stage no version carries, a `secret-string` segment other than
`SecretString`, and a reference naming both a version stage and a version id are all recorded the
same way.

`SecretStringTemplate` and `GenerateStringKey` go together. The generated password is added to the
template's JSON object under that key. Without them, the whole secret value is the generated
password. That is what an empty `GenerateSecretString: {}` produces, and it is the property CDK
synthesises for a `secretsmanager.Secret` with no options.

The other generation options behave as they do on real AWS, being `PasswordLength` (32 by default),
`ExcludeCharacters`, `ExcludeUppercase`, `ExcludeLowercase`, `ExcludeNumbers`, `ExcludePunctuation`,
`IncludeSpace`, and `RequireEachIncludedType`. The last is on unless turned off, and a generated
password carries one of every character type it was not told to exclude.

A secret with no `Name` is named from the stack name, the logical ID and a tail derived from both.
An `ApiSecret` in `db-stack` becomes `db-stack-ApiSecret-` and twelve more characters, where real
CloudFormation ends the name in twelve random ones. Simulated Secrets Manager then appends its own
six characters to the ARN, as it does for a secret named by hand. The name is trimmed to the 512
characters a secret name allows, and [the CloudFormation docs](https://yulinsim.dev/services/cloudformation/#names-cloudformation-generates "Names CloudFormation generates")
cover how the stack name and the logical ID share what is left.

## Inside a simulated Lambda handler

Function code requiring `@aws-sdk/client-secrets-manager` is routed into the same simulated AWS
environment, with the function's execution role as the caller. A handler fetching a secret therefore
has to be allowed to, by that role's policy, the same as on real AWS. See
[simulated Lambda](https://yulinsim.dev/services/lambda/ "Simulated Lambda docs") for how function code and execution roles
work.

The same applies to `SimSdk` interception. Intercepting `SecretsManagerClient` routes ordinary SDK
code into the simulation, served in process. See
[AWS SDK interception](https://yulinsim.dev/sdk/ "Simulated AWS SDK docs").

## Supported operations

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
- `{{resolve:secretsmanager:...}}` dynamic references in CloudFormation resource properties, by
  JSON key, by staging label and by version id
- A dynamic reference carrying a full ARN reading the account that ARN names

## Limitations

- A `KmsKeyId` is checked when a version is written under it, not when it is set on its own. An
  `UpdateSecret` changing only the key accepts a key that is absent, and the next write of a value
  fails.
- A secret name ending in a hyphen and six alphanumeric characters is refused. That is stricter than
  AWS, which only advises against such names, because they cannot be told apart from an ARN's
  resource part when a partial ARN is resolved. This rules out ordinary-looking names such as
  `app-secret` and `prod-config`, since `secret` and `config` are six characters. Name them
  `app-credentials` or `prod-settings` instead.
- `RotateSecret`, `CancelRotateSecret` and the rotation Lambda protocol are left out.
  `DescribeSecret` always reports `RotationEnabled` as `false`.
- `AWS::SecretsManager::Secret` supports `Name`, `Description`, `KmsKeyId`, `SecretString`,
  `GenerateSecretString` and `Tags`. `ReplicaRegions` is ignored. The other resource types
  (`SecretTargetAttachment`, `RotationSchedule` and `ResourcePolicy`) are reported as unsupported
  and skipped.
- A template declaring neither `SecretString` nor `GenerateSecretString` is refused, which is
  stricter than real CloudFormation. Real CloudFormation creates an empty secret in that case, and a
  secret with no version is outside this simulation.
- `ExcludeCharacters` that removes every character of an included type is refused. Generating a
  password missing a type it was told to include would be worse.
- A `{{resolve:secretsmanager:...}}` dynamic reference resolves to a marker while the rest of the
  resource's properties resolve around it, and the value replaces the marker once Secrets Manager
  has answered. An intrinsic function reading the string in between, such as an `Fn::Split` over a
  reference, sees the marker.
- Resource policies (`PutResourcePolicy`, `GetResourcePolicy`, `DeleteResourcePolicy`,
  `ValidateResourcePolicy`) are left out, and cross-account access to a secret cannot be granted.
- Replica regions are left out. `AddReplicaRegions`, `ReplicateSecretToRegions` and
  `RemoveRegionsFromReplication` do nothing, and `ReplicationStatus` goes unreported.
- `BatchGetSecretValue` is absent, as is the Parameters and Secrets Lambda Extension HTTP endpoint.
- `ListSecrets` refuses `Filters`, `SortOrder` and `SortBy` outright, since quietly returning an
  unfiltered or differently ordered list would be worse. Secrets are listed in creation order, with
  `MaxResults` and `NextToken` paging over them. A `NextToken` this simulation did not issue,
  including one whose offset is past the end of the list, is refused rather than answered with an
  empty page.
- Tags are stored and reported by `DescribeSecret` and `ListSecrets`, but `TagResource` and
  `UntagResource` are absent, and the `secretsmanager:ResourceTag` and `aws:ResourceTag` condition
  keys are left underived.
- Other Secrets Manager condition keys, such as `secretsmanager:SecretId` and
  `secretsmanager:VersionStage`, are left underived too, and a policy relying on them fails to match.
  Ordinary condition operators on values sim IAM does supply work as usual.
- A version that loses every staging label is kept indefinitely and stays readable by version id,
  where real Secrets Manager removes it after about a day. It is left out of `VersionIdsToStages`
  either way.
- `LastAccessedDate`, `LastRotatedDate`, `NextRotationDate`, `OwningService` and `PrimaryRegion` go
  unreported.
- Secret values live in process memory for the lifetime of the `SimAws` instance. Anything sharing
  the process can reach them.
- Secrets Manager is not served as an HTTP API by `serveSimAws`.
