# Simulated KMS

Yulin simulates AWS Key Management Service (KMS) in memory. Symmetric keys use AES-256 key material,
and asymmetric keys use real key pairs. Cryptographic operations run through Node.js `crypto`, so
the wrong key or encryption context cannot decrypt a ciphertext.

KMS-specific types are imported from the `@kensio/yulin/kms` subpath.

## Encrypting and decrypting

Create a key, encrypt a value, then decrypt it. `Decrypt` does not need a `KeyId` for symmetric
ciphertext because the ciphertext identifies its key.

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

The ciphertext blob is opaque. Only the `SimAws` instance that produced it can read it. Real AWS and
any second `SimAws` instance both reject it.

## Encryption context

An encryption context binds non-secret key/value data to a ciphertext. Decryption requires the same
context.

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

The context is an unordered map. The same pairs written in a different order still decrypt.

## Envelope encryption

`Encrypt` accepts at most 4,096 bytes. For larger values, use `GenerateDataKey`. It returns a
plaintext data key for encryption and an encrypted copy to store with the data.

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

## Signing and verifying

A key with `KeyUsage: SIGN_VERIFY` holds a real key pair. Set a signing key spec because the default
`SYMMETRIC_DEFAULT` key cannot sign.

```typescript sim-kms-sign-verify
/**
 * Signing and verifying with a simulated asymmetric KMS key.
 */

import {
  CreateKeyCommand,
  SignCommand,
  VerifyCommand,
} from "@aws-sdk/client-kms";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const kms = simAws.kms();

const created = await kms.createKey(
  new CreateKeyCommand({
    KeySpec: "ECC_NIST_P256",
    KeyUsage: "SIGN_VERIFY",
  }),
);

const message = Buffer.from("order-1234", "utf8");

const signed = await kms.sign(
  new SignCommand({
    KeyId: created.KeyMetadata?.Arn,
    Message: message,
    SigningAlgorithm: "ECDSA_SHA_256",
  }),
);

const verified = await kms.verify(
  new VerifyCommand({
    KeyId: created.KeyMetadata?.Arn,
    Message: message,
    Signature: signed.Signature,
    SigningAlgorithm: "ECDSA_SHA_256",
  }),
);

console.log(verified.SignatureValid); // true
```

`Verify` raises `KMSInvalidSignatureException` for a signature that fails to check out. Real KMS
does the same, in place of answering `SignatureValid: false`.

The key specs simulated are `ECC_NIST_P256`, `ECC_NIST_P384`, `ECC_NIST_P521`, `ECC_SECG_P256K1`,
`RSA_2048`, `RSA_3072` and `RSA_4096`. Each ECC spec offers the one ECDSA algorithm paired with its
curve. Each RSA spec offers all six RSASSA algorithms. A signing algorithm the key spec leaves out
is refused. So is `Sign` against an encryption key, and `Encrypt` against a signing key.

`DescribeKey` reports the key's own spec, usage and algorithms. Code that branches on them branches
the same way it would on AWS.

### Verifying outside KMS

`GetPublicKey` returns the public key as DER `SubjectPublicKeyInfo`, the encoding real KMS returns.
A verifier that never sees the simulator accepts a signature made in it.

```typescript sim-kms-public-key
/**
 * Verifying a simulated KMS signature outside KMS, with its public key.
 */

import { createPublicKey, verify } from "node:crypto";

import {
  CreateKeyCommand,
  GetPublicKeyCommand,
  SignCommand,
} from "@aws-sdk/client-kms";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const kms = simAws.kms();

const created = await kms.createKey(
  new CreateKeyCommand({
    KeySpec: "ECC_NIST_P256",
    KeyUsage: "SIGN_VERIFY",
  }),
);

const message = Buffer.from("order-1234", "utf8");

const signed = await kms.sign(
  new SignCommand({
    KeyId: created.KeyMetadata?.Arn,
    Message: message,
    SigningAlgorithm: "ECDSA_SHA_256",
  }),
);

const fetched = await kms.getPublicKey(
  new GetPublicKeyCommand({ KeyId: created.KeyMetadata?.Arn }),
);

const publicKey = createPublicKey({
  key: Buffer.from(fetched.PublicKey ?? new Uint8Array()),
  format: "der",
  type: "spki",
});

console.log(
  verify("sha256", message, publicKey, signed.Signature ?? new Uint8Array()),
); // true
```

ECDSA signatures are DER encoded, and RSASSA-PSS signatures use a salt the length of the digest,
both matching what KMS produces. `GetPublicKey` against a symmetric key is
`UnsupportedOperationException`, since there is no public key to hand out.

## Key policies and IAM

Every key has a key policy. An identity policy granting `kms:Decrypt` works only when the key policy
also permits the caller:

- A statement naming the caller grants access outright. A role with no permissions of its own can
  still use the key.
- A statement naming the account root only delegates to that account's IAM. The caller still needs
  an identity policy allowing the action. The default key policy is of this kind.

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

An alias beginning with `alias/aws/` names an AWS managed key. Yulin creates that key when it is
first referenced and applies AWS-managed-key policy behavior:

- Use of the key is allowed to any principal in the owning account, but only when `kms:ViaService`
  names the service that owns the key, such as `ssm.us-east-1.amazonaws.com` for `aws/ssm`.
- The account root can read the key's metadata.

A role cannot use an AWS managed key by calling KMS directly, even when its identity policy grants
`kms:Decrypt`.

`kms:ViaService` is set by the service making the call on the caller's behalf. Sim SSM does this for
`SecureString` parameters. Code calling simulated KMS directly sets it with the `viaService` request
option, naming the service on its own (`ssm`), since the region is the key's.

The first statement above allows the request outright, so nothing further is asked of the caller. A
role holding `ssm:GetParameter` and nothing on KMS reads a decrypted `SecureString` under `aws/ssm`,
because Parameter Store supplies the `kms:ViaService` value the policy wants (see
[Sim SSM](../ssm/README.md#the-awsssm-managed-key-allows-the-read-itself)).

A service that passes the caller's own KMS permissions on rather than its own sets
`withCallerPermissions` alongside `viaService`. A request carrying that option is allowed only where
IAM allows the caller the KMS action too, and a key policy naming the caller still allows it on its
own. No simulated service sets it.

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
and a condition on it stays unmatched.

## Naming a key

`KeyId` accepts a key ID, key ARN, alias name such as `alias/app-key`, or alias ARN.

A key ARN or alias ARN naming another account or region resolves to no key at all. Its identifier is
never read out and looked up locally. A foreign ARN cannot reach a key that happens to share an
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

A key can be disabled and re-enabled later. A disabled key stays present, and refuses to be used.

`ScheduleKeyDeletion` sets a recovery window from 7 to 30 days, defaulting to 30. During that window
the key cannot be used but can be recovered with
`CancelKeyDeletion`. Cancelling leaves the key disabled. Re-enabling it is a separate step.

A disabled key fails cryptographic operations with `DisabledException`. A key pending deletion fails
with `KMSInvalidStateException`. The two are distinct. One means the key can be enabled again, the
other that it is on its way out.

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
path an SDK caller uses, with real key material. A `KeyPolicy` the template declares becomes the key
policy. Omitting `KeyPolicy` gets the default root-delegation policy, as `CreateKey` with no
`Policy` does.

`Ref` on the key gives its key ID, as on real AWS, and `Fn::GetAtt` gives `Arn` or `KeyId`. `Ref` on
the alias gives the alias name, such as `alias/app-key`, and an alias name is itself usable as a
`KeyId`. So a property wanting a key ID takes the `Ref`, while an IAM policy resource wanting the
key needs `Fn::GetAtt … Arn`.

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
console.log(stack.output("KeyArn")); // "arn:aws:kms:...:key/..."
```

A property asking for behaviour Yulin leaves out still deploys. The key is created without it, and
the property is recorded in
[`stack.ignoredProperties`](https://yulinsim.dev/services/cloudformation/#properties-a-resource-was-created-without).
The template deploys, and the record says what the key leaves out. `EnableKeyRotation`,
`RotationPeriodInDays`, `MultiRegion` and `Tags` are all recorded that way. The key encrypts and
decrypts, its material stays as it was, it exists in one region, and its tags go unread.

A `KeySpec` or `KeyUsage` pair simulated KMS has no model for, or an `Origin` other than `AWS_KMS`,
is refused by `CreateKey` in the same terms it refuses an SDK caller, since there is no key to
create at all. `Enabled: false` is supported, and deploys a key that is disabled from the moment it
exists.

## Inside a simulated Lambda handler

Function code requiring `@aws-sdk/client-kms` is routed into the same simulated AWS environment, with
the function's execution role as the caller. A handler that decrypts a value therefore has to be
allowed to, by both the key policy and the role's identity policy, the same as on real AWS. See
[simulated Lambda](https://yulinsim.dev/services/lambda/) for how function code and execution roles work.

## Supported operations

- `CreateKeyCommand`, for symmetric encryption keys and asymmetric signing keys
- `DescribeKeyCommand` and `ListKeysCommand`
- `GetKeyPolicyCommand` and `PutKeyPolicyCommand`
- `EncryptCommand` and `DecryptCommand`, including encryption context
- `GenerateDataKeyCommand`, by `KeySpec` or `NumberOfBytes`
- `SignCommand`, `VerifyCommand` and `GetPublicKeyCommand`, for asymmetric signing keys
- `CreateAliasCommand` and `ListAliasesCommand`, including AWS managed key aliases
- `EnableKeyCommand`, `DisableKeyCommand`, `ScheduleKeyDeletionCommand`, `CancelKeyDeletionCommand`
- Key policy evaluation by simulated IAM
- Key ARNs, key IDs, alias names and alias ARNs as interchangeable ways to name a key
- The `AWS::KMS::Key` and `AWS::KMS::Alias` CloudFormation resources
- Calls made from inside a simulated Lambda handler, authorized as the function's execution role

## Limitations

- Only encryption with a symmetric key and signing with an asymmetric key are simulated. Left out
  are asymmetric encryption (`RSAES_OAEP_SHA_1` and `RSAES_OAEP_SHA_256`), HMAC keys and
  `GENERATE_VERIFY_MAC`, key agreement and `DeriveSharedSecret`, the `SM2` key spec, and
  `ReEncrypt`. An RSA key asked for with `KeyUsage: ENCRYPT_DECRYPT` is refused, which real KMS
  allows.
- `Sign` and `Verify` take a `MessageType` of `RAW` only. A `DIGEST` message is refused. Node cannot
  sign a digest that has already been computed, because `crypto.sign` with no algorithm hashes what
  it is given. The resulting signature would differ from the one real KMS makes, and would fail to
  verify against the message anywhere outside the simulator.
- Generating an RSA key pair is real key generation. An `RSA_4096` key costs a second or so of test
  time. The ECC specs are effectively free.
- Imported key material and custom key stores are left out. `Origin` other than `AWS_KMS` is
  refused.
- Grants (`CreateGrant` and friends) are left out.
- Key material stays as it was created. An `AWS::KMS::Key` declaring `EnableKeyRotation` or
  `RotationPeriodInDays` is created without it, and the property is recorded in
  `stack.ignoredProperties`.
- A Multi-Region key comes out as an ordinary key in one region. An `AWS::KMS::Key` declaring
  `MultiRegion: true` deploys that way, and the property is recorded.
- `AWS::KMS::Key` accepts but ignores `PendingWindowInDays` and `BypassPolicyLockoutSafetyCheck`.
  Both are inert here. A stack teardown schedules the key for deletion with the default window, and
  simulated KMS applies no policy lockout safety check to bypass.
- An `AWS::KMS::Alias` retargeted by a stack update is deleted and created again pointing at the new
  key, because a stack update replaces a changed resource and simulated KMS has no `UpdateAlias`.
- A template declaring `AWS::KMS::Grant` or `AWS::KMS::ReplicaKey` is refused.
- A key pending deletion stays in that state indefinitely. Advancing the simulated clock past the
  recovery window leaves it there, and the key ID stays taken.
- `UpdateAlias` is absent. An alias is retargeted by deleting it and creating it again.
- Tags, `ListResourceTags` and the `aws:ResourceTag` condition key are left out. An
  `AWS::KMS::Key` declaring `Tags` deploys with the tags dropped and the property recorded. A policy
  condition written around one fails to match here, where on AWS it would match.
- `kms:ViaService` and `kms:CallerAccount` are the KMS-specific condition keys derived. A policy
  relying on `kms:EncryptionContext:*` or any other one fails to match. Ordinary condition operators
  on values sim IAM does supply work as usual.
- The service an AWS managed key belongs to is taken from its alias. `alias/aws/ebs` is scoped to
  `ebs.<region>.amazonaws.com`. Real AWS scopes that one to EC2. The two agree for every service
  Yulin simulates.
- Key material lives in process memory for the lifetime of the `SimAws` instance. Anything sharing
  the process can reach it.
- Sim SSM encrypts `SecureString` parameters with simulated keys, checking `kms:Encrypt` and
  `kms:Decrypt`, and sim Secrets Manager encrypts every secret version, checking
  `kms:GenerateDataKey` and `kms:Decrypt`. No other simulated service uses simulated keys. Sim S3,
  sim DynamoDB and sim Lambda environment variables leave them alone, and skip the `kms:Decrypt`
  check.
- KMS is not served as an HTTP API by `serveSimAws`.
