# Simulated KMS implementation

This directory contains the simulated KMS service implementation.

The guiding decision here is that the cryptography is real. A simulated key holds real AES-256 key
material and every operation goes through Node.js's `crypto`, rather than a stand-in that records
what it was asked to encrypt. That costs almost nothing in a test suite and it buys behaviour that
would otherwise have to be hand-modelled: a ciphertext that cannot be read without its key, an
authentication tag that fails on tampering, and an encryption context that has to match.

## Entry points

- `sim-kms.ts` is the main in-memory service object for one account/region scope.
- `index.ts` exports the public KMS simulator API for `@kensio/yulin/kms`.

A `SimKms` instance owns a `SimKmsKeyStore` holding its keys and aliases. The simulator is scoped to
an account and region, because real KMS keys are: a key ARN names its region, and a ciphertext
produced in one region cannot be decrypted in another.

## Key model

Key state lives under `key/`.

`SimKmsKey` is the stored resource: identifier, ARN, description, key manager, its policy, its key
material and its lifecycle. `SimKmsKeyLifecycle` holds the state and the rules about which
transitions are legal, so no command handler has to remember that a key pending deletion cannot be
enabled, or which of the two failures an unusable key produces.

`SimKmsKeyMaterial` holds the AES-256 bytes and performs the cipher operations. Nothing exposes the
bytes, mirroring the fact that real key material never leaves KMS. That is a modelling choice, not a
security boundary: this all runs in one process.

`SimKmsCiphertextBlob` encodes the opaque blob KMS hands back. Real blobs are opaque to the caller
but not to KMS, which is why `Decrypt` needs no `KeyId` for a symmetric key. The layout keeps that
property by carrying the key ARN alongside the initialisation vector, authentication tag and
ciphertext, behind a marker and a version byte so that arbitrary bytes are rejected rather than
misread.

`SimKmsEncryptionContextAad` serialises an encryption context into AES-GCM additional authenticated
data. This is the neatest correspondence in the service: the encryption context is non-secret, is
not stored in the ciphertext, and must match on decryption, which is precisely what AAD does. The
serialisation sorts by key, because the context is an unordered map on real KMS.

`SimKmsKeyStore` owns `KeyId` resolution. Every operation takes its target as a key ID, key ARN,
alias name or alias ARN, so resolving those four forms belongs in one place. It also materialises an
AWS managed key on first reference to a reserved `alias/aws/` name, which is how such a key comes
into existence on real AWS.

## Command handling

AWS SDK-style operations are implemented under `command/`, grouped by the collaborators they share
rather than one class per command, so the `SimKms` facade stays a delegation:

- `command/key/` — `CreateKey` and `DescribeKey`; `ListKeys`; the lifecycle commands; the key policy
  commands
- `command/crypto/` — `Encrypt` and `Decrypt`; `GenerateDataKey`
- `command/alias/` — `CreateAlias`, `ListAliases`
- `command/authorize/` — the shared IAM authorizer
- `command/sim-kms-command.types.ts` — the command types gathered for the facade

Input validation that is a rule in its own right lives beside the commands that apply it, rather
than inside them: `SimKmsKeyType` for the key types this simulation models, `SimKmsPendingWindow`
for the deletion recovery window, `SimKmsDataKeySpec` for data key lengths, `SimKmsPolicyDocument`
for the JSON policy both `CreateKey` and `PutKeyPolicy` take, and `SimKmsCiphertextKey` for finding
the key behind a ciphertext.

As elsewhere, implementation code under `src/` does not import real AWS SDK packages. The structural
command types in `*.command.ts` match the SDK shapes closely enough for callers to pass real SDK
command instances.

## Key policies and IAM

KMS is the first service here whose resource policy is mandatory, and that needed a small addition
to simulated IAM.

Ordinarily a resource with no policy simply leaves the decision to the caller's identity policies.
A KMS key is not like that: it always has a policy, and an identity policy cannot reach the key
unless that policy admits the caller. `SimKmsAuthorizer` therefore passes the key policy as the
resource side and sets `requiresResourcePolicyAllow`, which selects
`SimIamMandatoryResourcePolicyRequirement` in the IAM authorization context.

That rule also has to tell apart the two ways a policy can admit a caller, because AWS does:

- a statement naming the caller grants access outright, which is why a key policy can make a key
  usable by a role with no permissions of its own;
- a statement naming the account root only delegates to that account's IAM, so an identity policy
  still has to allow the action.

`SimIamPrincipalMatch` carries that distinction out of the principal matcher, and
`SimIamAuthZAllowRequirement` combines the resulting rule with the one the caller's account implies.
Getting the second case wrong would be worse than not simulating key policies at all, since the
default key policy is exactly a root delegation: every key in the simulation would be usable by
every principal in its account.

The distinction is currently applied only where this rule is asked for. Other services' resource
policies still treat a root-principal match as an outright grant, which is looser than AWS. That is
a pre-existing divergence in shared IAM rather than something this service introduced, and fixing it
generally would change S3 bucket policy, Lambda function policy and role trust policy behaviour, so
it wants its own change.

Operations with no key to speak of, `CreateKey`, `ListKeys` and `ListAliases`, authorize against the
region's keys with identity policies alone, because real KMS gives those actions no resource-level
permissions.

`Decrypt` is the one operation that authorizes against a key the caller never named: the key comes
out of the ciphertext, so resolution has to happen before authorization can.
