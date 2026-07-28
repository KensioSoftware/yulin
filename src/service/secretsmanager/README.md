# Simulated Secrets Manager implementation

This directory contains the simulated Secrets Manager service implementation.

The guiding decision here is that the ARN suffix is real. Real Secrets Manager appends a hyphen and
six random characters to the secret name in its ARN, and that single detail is what breaks more IAM
policies than anything else in the service. Generating it means a policy that works against this
simulation is one that would work on real AWS, and a policy naming the bare ARN fails here rather
than in a deployment.

## Entry points

- `sim-secrets-manager.ts` is the main in-memory service object for one account/region scope.
- `index.ts` exports the public Secrets Manager simulator API for `@kensio/yulin/secretsmanager`.

A `SimSecretsManager` instance owns a `SimSecretsManagerSecretStore` holding its secrets. The
simulator is scoped to an account and region because real secrets are: a secret ARN names its
region, and a secret name is unique within one account and region rather than globally.

## Secret model

Secret state lives under `secret/`.

`SimSecretsManagerSecret` is the stored resource: its ARN, its metadata, its versions and its
deletion state. Deletion state belongs to the secret rather than to the store because it is the
secret that behaves differently once it is scheduled — still describable, still restorable, still
holding its name, but refusing to be read or written.

`SimSecretsManagerSecretArn` builds the ARN and owns the random suffix. It also answers whether a
resource part from a full or partial ARN names this secret, which is what makes both forms
interchangeable without each caller knowing the difference.

`SimSecretsManagerSecretName` validates a name. It refuses a name ending in a hyphen and six
characters, which real AWS only advises against. That is a deliberate divergence and a deliberately
strict one: such a name cannot be told apart from a full ARN's resource part, so a partial ARN
naming it could resolve to the wrong secret. The cost is that ordinary-looking names such as
`app-secret` are refused, which is why the error message explains itself at length.

`SimSecretsManagerSecretVersions` owns the staging label rules, which are the interesting part of
the data model: a label names exactly one version at a time, and making a version current demotes
the one that was to `AWSPREVIOUS` while whatever held `AWSPREVIOUS` loses it.

`SimSecretsManagerSecretValue` holds one content field rather than two optional ones, so the
invariant that a version is either text or binary and never both is true by construction.

`SimSecretsManagerSecretStore` owns `SecretId` resolution and name availability.
`SimSecretsManagerSecretIdParser` is the part that turns the three forms a `SecretId` can take into
the resource part it names, refusing an ARN belonging to another account or region rather than
reading a name out of it.

`SimSecretsManagerSecretExpiry` schedules the removal that ends a recovery window, on the
simulation's clock rather than the host's. This is what makes advancing simulated time free the
name up again, which is the behaviour a redeployed stack actually depends on.

`SimSecretsManagerVersionWriter` is shared by every write. `CreateSecret`, `PutSecretValue` and
`UpdateSecret` all end in the same place — a new version carrying the value, labelled `AWSCURRENT`
unless told otherwise — so keeping it in one collaborator is what stops the three commands drifting
apart on staging labels or on request-token idempotency.

## Command handling

AWS SDK-style operations are implemented under `command/`, grouped by the collaborators they share
rather than one class per command, so the `SimSecretsManager` facade stays a delegation:

- `command/secret/` — `CreateSecret`, `DescribeSecret` and `UpdateSecret`; the deletion lifecycle
  commands; `ListSecrets`; the shared metadata view both describe and list report
- `command/value/` — `GetSecretValue` and `PutSecretValue`
- `command/authorize/` — the shared IAM authorizer
- `command/sim-secrets-manager-command.types.ts` — the command types gathered for the facade

Input validation that is a rule in its own right lives beside the model it belongs to rather than
inside a handler: `SimSecretsManagerDeletionSchedule` for the recovery window and its contradiction
with `ForceDeleteWithoutRecovery`, and `SimSecretsManagerSecretName` for the name.

As elsewhere, implementation code under `src/` does not import real AWS SDK packages. The structural
command types in `*.command.ts` match the SDK shapes closely enough for callers to pass real SDK
command instances.

## Authorization

`SimSecretsManagerAuthorizer` splits requests two ways, as real Secrets Manager does:

- operations on a secret authorize the real IAM action against that secret's full ARN, suffix and
  all;
- `ListSecrets` authorizes against `*`, because real Secrets Manager gives that action no
  resource-level permissions, so a policy naming individual secret ARNs grants nothing.

There is no resource policy support yet, so unlike KMS this service passes no resource policies into
the IAM decision. Cross-account access to a secret therefore cannot be granted, which is documented
as a limitation rather than quietly allowed.

## CloudFormation

`cfn/` owns `AWS::SecretsManager::*`, resolved into the CloudFormation engine by
`sim-cfn-service-resolver.ts`. Only `Secret` is created; the other resource types are reported as
unsupported, which is what makes the engine skip them rather than fail the stack.

`SimCfnSecretsManagerSecretCreator` goes through the ordinary `CreateSecret` command rather than
building a secret directly, so a secret a template deployed is the same thing an SDK caller would
have got, name validation and ARN suffix included. Property reading lives in
`SimCfnSecretsManagerSecretProperties`, which owns the one rule worth stating in a single place: a
template supplies a value or asks for one to be generated, never both and never neither.

Password generation lives in `secret/generate/` rather than in `cfn/`, because it is Secrets Manager
behaviour rather than CloudFormation behaviour — `GetRandomPassword` would use the same rules under
the same option names. `SimSecretsManagerPasswordSpec` validates a request when it is described, so
a contradiction such as four required character types in a three-character password is refused
before anything is generated. The randomness is real rather than seedable: a test that wants the
generated value reads it back out of the simulation, as a deployed application does.

`Ref` and `Fn::GetAtt … Id` both give the full ARN, through `SimSecretsManagerSecretCfn`. That
carries the random suffix, which is what makes a `Ref` into an IAM policy resource behave here the
way it does on real AWS.

## Divergences worth knowing

- `KmsKeyId` is stored and reported but nothing is encrypted with it, and no `kms:Decrypt` check
  happens. This is looser than real AWS and stands until simulated KMS is wired into this service.
- Names ending in a hyphen and six characters are refused, which is stricter than real AWS.
- `ListSecrets` refuses `Filters` and `SortOrder` rather than ignoring them.
- A version that has lost every staging label is kept rather than removed, so it stays readable by
  version id. It is left out of `VersionIdsToStages` either way.
- An `AWS::SecretsManager::Secret` declaring neither `SecretString` nor `GenerateSecretString` is
  refused. Real CloudFormation creates an empty secret; a secret with no version is not simulated,
  and refusing is the fail-closed reading.
- `ExcludeCharacters` that empties an included character type is refused rather than generating a
  password quietly missing a type it was told to include.

The full list is in [docs/services/secretsmanager](../../../docs/services/secretsmanager/).
