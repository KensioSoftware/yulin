# Simulated SSM Parameter Store implementation

This directory contains the simulated SSM Parameter Store implementation. Nothing else in Systems
Manager is simulated: no Run Command, Session Manager, Patch Manager, State Manager, Automation,
inventory or maintenance windows.

The guiding decision here is that the parameter ARN drops the leading slash from the name. A
parameter called `/myapp/prod/db-host` has the ARN
`arn:aws:ssm:eu-west-2:111111111111:parameter/myapp/prod/db-host`, with one slash after `parameter`
rather than two. Getting that wrong is the most common way an SSM IAM policy fails, and it fails at
deployment rather than at review. Building the ARN in one place means a policy that works against
this simulation is one that would work on real AWS, and a policy naming the doubled-slash form fails
here instead.

## Entry points

- `sim-ssm.ts` is the main in-memory service object for one account/region scope.
- `index.ts` exports the public SSM simulator API for `@kensio/yulin/ssm`.

A `SimSsm` instance owns a `SimSsmParameterStore` holding its parameters. The simulator is scoped to
an account and region because real parameters are: a parameter ARN names its region, and a parameter
name is unique within one account and region rather than globally.

## Parameter model

Parameter state lives under `parameter/`.

`SimSsmParameter` is the stored resource: its name, its type, its ARN and its versions. The type
belongs to the parameter rather than to a version because real Parameter Store refuses to change it.
Overwriting a `String` parameter as a `StringList` fails with `HierarchyTypeMismatchException`, and
the only way through is to delete the parameter and create a new one.

`SimSsmParameterName` validates a name. This is the part worth getting right, because every rule in
it is a deploy-time failure someone has hit: a hierarchical name without its leading slash, a name
under the reserved `aws` or `ssm` prefix, a hierarchy sixteen levels deep, an inner space. The
length limit needs the account and region, because real Parameter Store counts the ARN prefix
towards the 1011 characters a name may use, so the same name is legal in one region and too long in
another.

`SimSsmParameterName.resourceFor` is the normalization the whole service keys on: the name with any
leading slash dropped. A parameter written as `db-host` and read as `/db-host` is one parameter,
because both name the same ARN, and no IAM policy could tell them apart.

`SimSsmParameterArn` builds the ARN from that resource form. `ssmParameterArnPrefix` is exported
beside it because the name validator and the authorizer both need the prefix without needing a
parameter.

`SimSsmParameterValue` holds one version's value and enforces the standard tier's 4KB limit, in
UTF-8 bytes. A `StringList` is one comma separated string here, as it is on real AWS, rather than an
array: handler code that splits it on commas is exercising the shape AWS would give it.

`SimSsmParameterSelector` parses the `name:version` and `name:label` forms a request may write. A
parameter name cannot contain a colon, so the first one separates the two parts, and a selector of
only digits is a version while anything else is a label.

`SimSsmParameterPath` is the level of the hierarchy `GetParametersByPath` names. It owns both the
containment rule and the path's own ARN, because the path is what that operation authorizes against.

`SimSsmParameterWriter` is the single path by which a parameter is created or updated. Keeping
creation and overwrite in one collaborator is what stops the two drifting apart on the rules that
only exist where they meet: a name already in use, and a type that cannot change.

## Command handling

AWS SDK-style operations are implemented under `command/`, grouped by the collaborators they share
rather than one class per command, so the `SimSsm` facade stays a delegation:

- `command/parameter/` — the commands, their structural input/output types, the shared output views
  and the shared paging
- `command/authorize/` — the shared IAM authorizer

`SimSsmUnsimulatedPutOptions` gathers every PutParameter option this simulation refuses, in one
readable place, rather than scattering the refusals through the write path.

As elsewhere, implementation code under `src/` does not import real AWS SDK packages. The structural
command types in `*.command.ts` match the SDK shapes closely enough for callers to pass real SDK
command instances.

## Authorization

`SimSsmAuthorizer` splits requests three ways, as real Parameter Store does:

- operations on a parameter authorize the real IAM action against that parameter's ARN, whether or
  not the parameter exists, because real IAM evaluates a request before the service handles it;
- `GetParametersByPath` authorizes against the path's own ARN, and access to a path is access to
  everything under it, so a parameter that an explicit deny names is still returned by a recursive
  listing of its parent;
- `DescribeParameters` authorizes against `*`, because real Parameter Store gives that action no
  resource-level permissions, so a policy naming individual parameter ARNs grants nothing.

`GetParameters` and `DeleteParameters` authorize each name in the batch, so one name the caller may
not reach fails the whole request rather than being quietly left out of the results.

There is no resource policy support, so cross-account access to a parameter cannot be granted.

## Divergences worth knowing

- `SecureString` is refused. Nothing here would encrypt it, so accepting it would let a test pass
  while saying nothing about the KMS key, the `kms:Decrypt` permission or `WithDecryption`.
- Parameter labels are refused rather than looked up. `LabelParameterVersion` is not implemented, so
  nothing could create one, and a label selector says that instead of reporting the parameter as
  missing.
- The advanced tier, parameter policies, tags, `AllowedPattern`, `KeyId` and non-text data types are
  refused rather than ignored.
- `GetParametersByPath` and `DescribeParameters` refuse filters rather than ignoring them.
- Every version is kept. Real Parameter Store keeps the hundred most recent and deletes the oldest
  as new ones are made.
- There is no `AWS::SSM::Parameter` CloudFormation resource and no `{{resolve:ssm:...}}` support
  yet, so this service has no `cfn/` directory.

The full list is in [docs/services/ssm](../../../docs/services/ssm/).
