# Simulated KMS

Yulin includes a simulated AWS Key Management Service (KMS) for tests and local development.

Encryption is real. Each simulated key holds AES-256 key material and the operations run through
Node.js's own `crypto`, so a ciphertext cannot be read without its key, and a decryption with the
wrong encryption context fails.

KMS-specific types are imported from the `@kensio/yulin/kms` subpath.

## Encrypting and decrypting

Create a key and use it. `Decrypt` needs no `KeyId` for a symmetric key, because the ciphertext already names the key that produced it.

```typescript sim-kms-encrypt-decrypt
/**
 * Encrypting and decrypting with a simulated KMS key.
 */

import {
  CreateKeyCommand,
  DecryptCommand,
  EncryptCommand,
} from "@aws-sdk/client-kms";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const kms = simAws.kms();

const created = await kms.createKey(
  new CreateKeyCommand({ Description: "Application key" }),
);

const encrypted = await kms.encrypt(
  new EncryptCommand({
    KeyId: created.KeyMetadata?.Arn,
    Plaintext: Buffer.from("hunter2", "utf8"),
  }),
);

const decrypted = await kms.decrypt(
  new DecryptCommand({ CiphertextBlob: encrypted.CiphertextBlob }),
);

console.log(Buffer.from(decrypted.Plaintext ?? []).toString("utf8")); // "hunter2"
```

The ciphertext blob is opaque. Nothing outside the simulator should try to read it. It is not
portable to real AWS, or between two `SimAws` instances.

## Encryption context

An encryption context is non-secret key/value data bound to a ciphertext. Supplying a different one
on decryption fails, which ties a ciphertext to the thing it belongs to.

```typescript sim-kms-encryption-context
/**
 * Binding an encryption context to a simulated KMS ciphertext.
 */

import {
  CreateKeyCommand,
  DecryptCommand,
  EncryptCommand,
} from "@aws-sdk/client-kms";

import { SimAws } from "@kensio/yulin";
import { SimKmsInvalidCiphertextException } from "@kensio/yulin/kms";

const simAws = new SimAws();
const kms = simAws.kms();

const created = await kms.createKey(new CreateKeyCommand({}));

const encrypted = await kms.encrypt(
  new EncryptCommand({
    KeyId: created.KeyMetadata?.Arn,
    Plaintext: Buffer.from("hunter2", "utf8"),
    EncryptionContext: { tenant: "acme" },
  }),
);

try {
  await kms.decrypt(
    new DecryptCommand({
      CiphertextBlob: encrypted.CiphertextBlob,
      EncryptionContext: { tenant: "other" },
    }),
  );
} catch (error) {
  // The wrong context fails the cipher's own authentication, exactly as it
  // does on real KMS.
  console.log(error instanceof SimKmsInvalidCiphertextException); // true
}
```

The context is an unordered map, so the same pairs written in a different order still decrypt.

## Envelope encryption

`Encrypt` takes at most 4096 bytes, which is the limit that makes envelope encryption necessary.
`GenerateDataKey` returns a data key twice: once in the clear, to encrypt your data with, and once
encrypted under the KMS key, to store alongside it.

```typescript sim-kms-generate-data-key
/**
 * Envelope encryption with a simulated KMS data key.
 */

import {
  CreateKeyCommand,
  DecryptCommand,
  GenerateDataKeyCommand,
} from "@aws-sdk/client-kms";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const kms = simAws.kms();

const created = await kms.createKey(new CreateKeyCommand({}));

const dataKey = await kms.generateDataKey(
  new GenerateDataKeyCommand({
    KeyId: created.KeyMetadata?.Arn,
    KeySpec: "AES_256",
  }),
);

console.log(dataKey.Plaintext?.length); // 32

// Store dataKey.CiphertextBlob with the data; discard the plaintext copy.
const recovered = await kms.decrypt(
  new DecryptCommand({ CiphertextBlob: dataKey.CiphertextBlob }),
);

console.log(recovered.Plaintext?.length); // 32
```

## Key policies and IAM

Every KMS key has a policy, and it cannot be removed. An IAM policy granting `kms:Decrypt` reaches
nothing unless the key's own policy admits the caller. How it admits them decides what else is
needed:

- A statement naming the caller grants access outright, so a role with no permissions of its own can
  still use the key.
- A statement naming the account root, which is what the default key policy contains, only delegates
  to that account's IAM. The caller still needs an identity policy allowing the action.

```typescript sim-kms-key-policy
/**
 * A simulated KMS key policy deciding who can use the key.
 */

import { CreateRoleCommand } from "@aws-sdk/client-iam";
import { CreateKeyCommand, EncryptCommand } from "@aws-sdk/client-kms";

import { SimAws } from "@kensio/yulin";
import { SimIamAccessDenied } from "@kensio/yulin/iam";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "Encrypter",
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

// A key policy naming the Role directly, with no delegation to the Account.
const created = await simAws.kms().createKey(
  new CreateKeyCommand({
    Policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: role.Role.Arn },
          Action: "kms:Encrypt",
          Resource: "*",
        },
      ],
    }),
  }),
);

// The Role can encrypt, with no identity policy of its own.
await simAws.kms().encrypt(
  new EncryptCommand({
    KeyId: created.KeyMetadata?.Arn,
    Plaintext: Buffer.from("hunter2", "utf8"),
  }),
  { caller: { kind: "arn", arn: role.Role.Arn } },
);

// The Account root cannot, because this key policy does not admit it.
try {
  await simAws.kms().encrypt(
    new EncryptCommand({
      KeyId: created.KeyMetadata?.Arn,
      Plaintext: Buffer.from("hunter2", "utf8"),
    }),
  );
} catch (error) {
  console.log(error instanceof SimIamAccessDenied); // true
}
```

Replacing a key policy with `PutKeyPolicyCommand` can lock an account out of its own key, as it can
on real KMS.

## AWS managed keys and `kms:ViaService`

An alias beginning `alias/aws/` names an AWS managed key, and the key is created the first time
something references it. Such a key gets the policy real AWS gives it, which is not the customer
default:

- Use of the key is allowed to any principal in the owning account, but only when `kms:ViaService`
  names the service that owns the key, such as `ssm.us-east-1.amazonaws.com` for `aws/ssm`.
- The account root is allowed to read the key's metadata, and nothing more. Nothing about using the
  key is delegated to IAM.

That is why a role holding only `ssm:GetParameter` reads a decrypted `SecureString` under `aws/ssm`,
and why a role holding `kms:Decrypt` on that key still cannot use it by calling KMS itself.

`kms:ViaService` is set by the service making the call on the caller's behalf. Sim SSM does this for
`SecureString` parameters. Code calling simulated KMS directly sets it with the `viaService` request
option, naming the service on its own rather than as an endpoint, since the region is the key's.

```typescript sim-kms-aws-managed-key
/**
 * An AWS managed key, usable only through the service that owns it.
 */

import { EncryptCommand, GetKeyPolicyCommand } from "@aws-sdk/client-kms";

import { SimAws } from "@kensio/yulin";
import { SimIamAccessDenied } from "@kensio/yulin/iam";

const simAws = new SimAws();

// A request reaching the key through Systems Manager, as Parameter Store makes
// it. No KMS permission is involved.
const encrypted = await simAws.kms().encrypt(
  new EncryptCommand({
    KeyId: "alias/aws/ssm",
    Plaintext: Buffer.from("hunter2", "utf8"),
  }),
  { viaService: "ssm" },
);

console.log(encrypted.KeyId); // the ARN of the aws/ssm key

// The same request made directly is denied, whatever IAM allows.
try {
  await simAws.kms().encrypt(
    new EncryptCommand({
      KeyId: "alias/aws/ssm",
      Plaintext: Buffer.from("hunter2", "utf8"),
    }),
  );
} catch (error) {
  console.log(error instanceof SimIamAccessDenied); // true
}

// Reading the key's metadata is allowed, because that much is delegated.
const policy = await simAws
  .kms()
  .getKeyPolicy(new GetKeyPolicyCommand({ KeyId: "alias/aws/ssm" }));

console.log(policy.Policy); // the via-service-scoped policy
```

A key policy of your own can use `kms:ViaService` too, with the ordinary condition operators, and it
matches for requests carrying the option. A request that names no service has no value for the key,
so a condition on it does not match.

## Naming a key

Every operation takes its target as a `KeyId`, and any of the four forms real KMS accepts will do: a
key ID, a key ARN, an alias name such as `alias/app-key`, or an alias ARN.

A key ARN or alias ARN naming another account or region resolves to nothing, rather than having its
identifier read out and looked up locally. A foreign ARN cannot reach a key that happens to share an
identifier.

Aliases beginning `alias/aws/` are reserved for AWS managed keys. `CreateAlias` refuses to create
one, but referencing one brings the key into existence, the way an AWS managed key appears on real
AWS when a service first needs it.

```typescript sim-kms-aliases
/**
 * Naming a simulated KMS key by alias.
 */

import {
  CreateAliasCommand,
  CreateKeyCommand,
  DescribeKeyCommand,
  EncryptCommand,
} from "@aws-sdk/client-kms";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const kms = simAws.kms();

const created = await kms.createKey(new CreateKeyCommand({}));
await kms.createAlias(
  new CreateAliasCommand({
    AliasName: "alias/app-key",
    TargetKeyId: created.KeyMetadata?.KeyId,
  }),
);

// The alias reaches the same key as its ID or ARN would.
await kms.encrypt(
  new EncryptCommand({
    KeyId: "alias/app-key",
    Plaintext: Buffer.from("hunter2", "utf8"),
  }),
);

// An AWS managed key appears the first time its alias is referenced.
const managed = await kms.describeKey(
  new DescribeKeyCommand({ KeyId: "alias/aws/s3" }),
);

console.log(managed.KeyMetadata?.KeyManager); // "AWS"
```

## Key state and deletion

A key can be disabled, which leaves it present but unusable, and re-enabled later.

Deletion is never immediate. `ScheduleKeyDeletion` sets a recovery window of 7 to 30 days, defaulting
to 30. During that window the key refuses to be used but can still be recovered with
`CancelKeyDeletion`. Cancelling leaves the key disabled rather than enabled, so re-enabling it is a
separate step.

A disabled key fails cryptographic operations with `DisabledException`. A key pending deletion fails
with `KMSInvalidStateException`. The two are distinct: one means the key can be enabled again, the
other means it is on its way out.

## Scoping

KMS keys belong to an account and a region, as they do on real AWS. A key created in one region
cannot be found or used from another, and a ciphertext produced under it cannot be decrypted
elsewhere.

```typescript sim-kms-scoping
/**
 * Simulated KMS keys are scoped to an account and region.
 */

import { CreateKeyCommand, DescribeKeyCommand } from "@aws-sdk/client-kms";

import { SimAws } from "@kensio/yulin";
import { SimKmsNotFoundException } from "@kensio/yulin/kms";

const simAws = new SimAws();

const created = await simAws
  .account("222222222222")
  .region("eu-west-2")
  .kms()
  .createKey(new CreateKeyCommand({}));

try {
  await simAws
    .account("222222222222")
    .region("us-east-1")
    .kms()
    .describeKey(new DescribeKeyCommand({ KeyId: created.KeyMetadata?.Arn }));
} catch (error) {
  console.log(error instanceof SimKmsNotFoundException); // true
}
```

## Deploying a key from CloudFormation

Simulated CloudFormation creates a key from an `AWS::KMS::Key` resource and points an
`AWS::KMS::Alias` at it, in the stack's account and region. The key comes out of the same `CreateKey`
path an SDK caller uses, so it has real key material. A `KeyPolicy` the template declares becomes the
key policy. Omitting `KeyPolicy` gets the default root-delegation policy, as `CreateKey` with no
`Policy` does.

`Ref` on the key gives its key ID rather than its ARN, as on real AWS, and `Fn::GetAtt` gives `Arn`
or `KeyId`. `Ref` on the alias gives the alias name, such as `alias/app-key`, which is itself usable
as a `KeyId`. So a property wanting a key ID takes the `Ref`, while an IAM policy resource wanting
the key needs `Fn::GetAtt … Arn`.

```typescript sim-kms-cloudformation-key
/**
 * Deploying a KMS key and alias from a CloudFormation template, then
 * encrypting through the alias the template created.
 */

import { DecryptCommand, EncryptCommand } from "@aws-sdk/client-kms";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "app-stack",
  template: {
    Resources: {
      AppKey: {
        Type: "AWS::KMS::Key",
        Properties: { Description: "Application data key" },
      },
      AppKeyAlias: {
        Type: "AWS::KMS::Alias",
        Properties: {
          AliasName: "alias/app-key",
          TargetKeyId: { Ref: "AppKey" },
        },
      },
    },
    Outputs: {
      KeyArn: { Value: { "Fn::GetAtt": ["AppKey", "Arn"] } },
    },
  },
});
await stack.waitForDeployComplete();

const kms = simAws.kms();

const encrypted = await kms.encrypt(
  new EncryptCommand({
    KeyId: "alias/app-key",
    Plaintext: Buffer.from("hunter2", "utf8"),
  }),
);

const decrypted = await kms.decrypt(
  new DecryptCommand({ CiphertextBlob: encrypted.CiphertextBlob }),
);

console.log(Buffer.from(decrypted.Plaintext ?? []).toString("utf8")); // "hunter2"
console.log(stack.outputs.get("KeyArn")?.value); // "arn:aws:kms:...:key/..."
```

Properties asking for behaviour that is not simulated do not stop the key being created. The key is
created without them and each one is recorded in
[`stack.ignoredProperties`](../cloudformation/README.md#properties-a-resource-was-created-without),
so a template deploys and the record says what the key does not do. `EnableKeyRotation`,
`RotationPeriodInDays`, `MultiRegion` and `Tags` are all recorded that way: the key encrypts and
decrypts, its material never rotates, it exists in one region, and nothing reads its tags. An
asymmetric or HMAC `KeySpec` or `KeyUsage`, or an `Origin` other than `AWS_KMS`, is still refused by
`CreateKey` in the same terms it refuses an SDK caller, because there is no key to create at all.
`Enabled: false` is supported, and deploys a key that is disabled from the moment it exists.

## Inside a simulated Lambda handler

Function code requiring `@aws-sdk/client-kms` is routed into the same simulated AWS environment, with
the function's execution role as the caller. A handler that decrypts a value therefore has to be
allowed to, by both the key policy and the role's identity policy, the same as on real AWS. See
[simulated Lambda](../lambda/) for how function code and execution roles work.

## Available functionality

Sim KMS currently supports:

- `CreateKeyCommand`, for symmetric encryption keys
- `DescribeKeyCommand` and `ListKeysCommand`
- `GetKeyPolicyCommand` and `PutKeyPolicyCommand`
- `EncryptCommand` and `DecryptCommand`, including encryption context
- `GenerateDataKeyCommand`, by `KeySpec` or `NumberOfBytes`
- `CreateAliasCommand` and `ListAliasesCommand`, including AWS managed key aliases
- `EnableKeyCommand`, `DisableKeyCommand`, `ScheduleKeyDeletionCommand`, `CancelKeyDeletionCommand`
- Key policy evaluation by simulated IAM
- Key ARNs, key IDs, alias names and alias ARNs as interchangeable ways to name a key
- The `AWS::KMS::Key` and `AWS::KMS::Alias` CloudFormation resources
- Calls made from inside a simulated Lambda handler, authorized as the function's execution role

## Limitations

Current documented limitations:

- Only symmetric encryption keys (`SYMMETRIC_DEFAULT`, `ENCRYPT_DECRYPT`) are simulated. Asymmetric
  keys, HMAC keys, `Sign`, `Verify` and `ReEncrypt` are not.
- Imported key material and custom key stores are not simulated; `Origin` other than `AWS_KMS` is
  refused.
- Grants (`CreateGrant` and friends) are not simulated.
- Automatic key rotation is not simulated. An `AWS::KMS::Key` declaring `EnableKeyRotation` or
  `RotationPeriodInDays` is created without it, and the property is recorded in
  `stack.ignoredProperties`.
- Multi-Region keys are not simulated. An `AWS::KMS::Key` declaring `MultiRegion: true` is created as
  a key in one region, and the property is recorded.
- `AWS::KMS::Key` accepts but ignores `PendingWindowInDays` and `BypassPolicyLockoutSafetyCheck`.
  Neither has anything to act on: simulated CloudFormation does not delete stacks, and simulated KMS
  applies no policy lockout safety check to bypass.
- CloudFormation creates KMS resources but never changes or removes them. An `AWS::KMS::Alias` cannot
  be retargeted by a stack update, because `UpdateAlias` and `DeleteAlias` are not simulated.
- `AWS::KMS::Grant` and `AWS::KMS::ReplicaKey` are not supported; a template declaring one is
  refused.
- A key pending deletion stays in that state indefinitely. Advancing the simulated clock past the
  recovery window does not delete it, so the key ID stays taken.
- Aliases cannot be updated or deleted; `UpdateAlias` and `DeleteAlias` are not supported.
- Tags, `ListResourceTags` and the `aws:ResourceTag` condition key are not simulated. An
  `AWS::KMS::Key` declaring `Tags` deploys with the tags dropped and the property recorded, so a
  policy condition written around one matches nothing here and matches on AWS.
- `kms:EncryptionContext:*` and other KMS-specific condition keys beyond `kms:ViaService` and
  `kms:CallerAccount` are not derived, so a policy relying on them will not match. Ordinary condition
  operators on values sim IAM does supply work as usual.
- The service an AWS managed key belongs to is taken from its alias, so `alias/aws/ebs` is scoped to
  `ebs.<region>.amazonaws.com`. Real AWS scopes that one to EC2. The two agree for every service
  Yulin simulates.
- Key material lives in process memory for the lifetime of the `SimAws` instance. That is not a
  security boundary: anything sharing the process can reach it.
- Sim SSM encrypts `SecureString` parameters with simulated keys, checking `kms:Encrypt` and
  `kms:Decrypt`, and sim Secrets Manager encrypts every secret version, checking
  `kms:GenerateDataKey` and `kms:Decrypt`. No other simulated service uses simulated keys: sim S3,
  sim DynamoDB and sim Lambda environment variables do not, and do not check `kms:Decrypt`.
- KMS is not served as an HTTP API by `serveSimAws`.
