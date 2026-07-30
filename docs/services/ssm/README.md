# Simulated SSM Parameter Store

Yulin includes a simulated AWS Systems Manager Parameter Store for tests and local development.
Parameters are stored in memory, versioned on every write, and every operation is authorized by
simulated IAM.

Only Parameter Store is simulated. Nothing else in Systems Manager is.

SSM-specific types are imported from the `@kensio/yulin/ssm` subpath.

## Writing and reading a parameter

`PutParameter` needs a `Type` when the parameter is new. `GetParameter` returns the current version.

```typescript sim-ssm-put-and-get
/**
 * Writing a simulated parameter and reading it back.
 */

import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ssm = simAws.ssm();

await ssm.putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-host",
    Type: "String",
    Value: "db.internal",
  }),
);

const read = await ssm.getParameter(
  new GetParameterCommand({ Name: "/myapp/prod/db-host" }),
);

console.log(read.Parameter?.Value); // "db.internal"
console.log(read.Parameter?.Version); // 1
```

A parameter written without a leading slash and one read with it are the same parameter, because
both name the same ARN.

## Parameter ARNs and IAM policies

A parameter ARN drops the leading slash from the name. `/myapp/prod/db-host` becomes
`arn:aws:ssm:eu-west-2:111111111111:parameter/myapp/prod/db-host`, with one slash after `parameter`
rather than two. A policy written with the doubled slash matches nothing.

```typescript sim-ssm-iam-policy
/**
 * A simulated IAM policy allowing a Role to read one parameter.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;
const regionName = simAws.defaultRegionName;

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "ConfigReader",
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
    RoleName: "ConfigReader",
    PolicyName: "ReadDbHost",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "ssm:GetParameter",
        // One slash after `parameter`, not two, whatever the name looks like.
        Resource: `arn:aws:ssm:${regionName}:${accountId}:parameter/myapp/prod/db-host`,
      },
    }),
  }),
);

await simAws.ssm().putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-host",
    Type: "String",
    Value: "db.internal",
  }),
);

const read = await simAws
  .ssm()
  .getParameter(new GetParameterCommand({ Name: "/myapp/prod/db-host" }), {
    caller: { kind: "arn", arn: role.Role.Arn },
  });

console.log(read.Parameter?.Value); // "db.internal"
```

`DescribeParameters` is the exception. Real Parameter Store gives that action no resource-level
permissions, so it authorizes against `*` here, and a policy naming individual parameter ARNs grants
nothing.

`GetParametersByPath` authorizes against the path rather than against each parameter it returns.
Access to a path is access to everything under it, so a recursive listing of `/myapp` returns
`/myapp/prod/db-host` even where a policy explicitly denies that parameter.

## Versions

Every write makes a new version. `PutParameter` refuses a name that is already taken unless the
request sets `Overwrite`, and an earlier version stays readable by number.

```typescript sim-ssm-parameter-versions
/**
 * Overwriting a simulated parameter and reading an earlier version.
 */

import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ssm = simAws.ssm();

await ssm.putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-host",
    Type: "String",
    Value: "db.internal",
  }),
);

const overwritten = await ssm.putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-host",
    Value: "db2.internal",
    Overwrite: true,
  }),
);

console.log(overwritten.Version); // 2

const first = await ssm.getParameter(
  new GetParameterCommand({ Name: "/myapp/prod/db-host:1" }),
);

console.log(first.Parameter?.Value); // "db.internal"
console.log(first.Parameter?.Selector); // ":1"
```

A parameter's type cannot change. Overwriting a `String` parameter as a `StringList` fails with
`HierarchyTypeMismatchException`, as it does on real AWS. Delete the parameter and create a new one
instead.

## Reading a hierarchy

`GetParametersByPath` reads a whole level of the hierarchy. Without `Recursive` it returns only the
level immediately below the path.

```typescript sim-ssm-parameters-by-path
/**
 * Reading a hierarchy of simulated parameters as application configuration.
 */

import {
  GetParametersByPathCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ssm = simAws.ssm();

await ssm.putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-host",
    Type: "String",
    Value: "db.internal",
  }),
);
await ssm.putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-port",
    Type: "String",
    Value: "5432",
  }),
);
await ssm.putParameter(
  new PutParameterCommand({
    Name: "/myapp/test/db-host",
    Type: "String",
    Value: "db.test.internal",
  }),
);

const listed = await ssm.getParametersByPath(
  new GetParametersByPathCommand({ Path: "/myapp/prod" }),
);

console.log(listed.Parameters?.map((parameter) => parameter.Name));
// [ "/myapp/prod/db-host", "/myapp/prod/db-port" ]
```

A page holds ten parameters, as it does on real AWS. Follow `NextToken` to read the rest.

## Reading several parameters at once

`GetParameters` takes up to ten names. A name that resolves to nothing comes back in
`InvalidParameters` rather than failing the request, which is what makes a typo easy to miss.

```typescript sim-ssm-get-parameters-batch
/**
 * Reading several simulated parameters, including one name with a typo.
 */

import { GetParametersCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ssm = simAws.ssm();

await ssm.putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-host",
    Type: "String",
    Value: "db.internal",
  }),
);

const read = await ssm.getParameters(
  new GetParametersCommand({
    Names: ["/myapp/prod/db-host", "/myapp/prod/db-hostt"],
  }),
);

console.log(read.Parameters?.map((parameter) => parameter.Name));
// [ "/myapp/prod/db-host" ]
console.log(read.InvalidParameters); // [ "/myapp/prod/db-hostt" ]
```

`GetParameters` still authorizes each name, so one name the caller may not read fails the whole
request.

## String lists

A `StringList` value is one comma-separated string, on read as well as on write. It is not returned
as an array.

```typescript sim-ssm-string-list
/**
 * Reading a simulated StringList parameter.
 */

import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ssm = simAws.ssm();

await ssm.putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/allowed-origins",
    Type: "StringList",
    Value: "https://one.example,https://two.example",
  }),
);

const read = await ssm.getParameter(
  new GetParameterCommand({ Name: "/myapp/prod/allowed-origins" }),
);

const origins = read.Parameter?.Value?.split(",") ?? [];

console.log(origins.length); // 2
```

## Parameter names

Name validation matches real Parameter Store, because a name it accepts and AWS refuses is a
deployment failure a passing test would have hidden. A name:

- may contain letters, digits, `_`, `.`, `-` and `/`
- must start with `/` if it contains a hierarchy at all
- may not have more than fifteen hierarchy levels
- may not start with `aws` or `ssm` in any case, which Parameter Store reserves
- may not contain spaces between characters, though surrounding spaces are stripped
- may not make an ARN longer than 1011 characters, counting the ARN prefix for the account and region

A `String` or `StringList` value holds at most 4KB, which is the standard tier limit. This is the one
people hit, usually by putting a whole JSON configuration blob in one parameter.

## Deploying a parameter from CloudFormation

Simulated CloudFormation creates a parameter from an `AWS::SSM::Parameter` resource, in the stack's
account and region. The parameter is written through `PutParameter`, so a template-created parameter
is the same thing an SDK caller would get: the same name validation, the same ARN, version 1.

`Ref` on the resource gives the parameter name rather than its ARN, as it does on real AWS, so it can
be handed straight to `GetParameter`. `Fn::GetAtt … Type` and `Fn::GetAtt … Value` give those
properties.

```typescript sim-ssm-cloudformation-parameter
/**
 * Deploying a parameter from a CloudFormation template and reading it back.
 */

import { GetParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "config-stack",
  template: {
    Resources: {
      DbHost: {
        Type: "AWS::SSM::Parameter",
        Properties: {
          Name: "/myapp/prod/db-host",
          Type: "String",
          Value: "db.internal",
          Description: "Where the application database lives",
        },
      },
    },
    Outputs: {
      DbHostParameter: {
        Value: { Ref: "DbHost" },
      },
    },
  },
});

await stack.waitForDeployComplete();

// Ref resolves to the parameter name, so it works as a GetParameter Name.
const parameterName = stack.outputs.get("DbHostParameter")?.value as string;

const read = await simAws
  .ssm()
  .getParameter(new GetParameterCommand({ Name: parameterName }));

console.log(read.Parameter?.Value); // "db.internal"
console.log(read.Parameter?.Version); // 1
```

A parameter with no `Name` is named after its logical ID. Real CloudFormation generates a name from
the stack name and its own random characters, so a template cannot rely on the exact generated name
either way.

An IAM policy granting access to a template-created parameter needs the ARN rather than the `Ref`.
Build it with `Fn::Sub`, remembering that the ARN drops the name's leading slash:

```yaml
Resource: !Sub "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/myapp/prod/db-host"
```

CDK does this for you. `ssm.StringParameter` with `grantRead(fn)` synthesises a template that deploys
here without hand-editing.

## Reading configuration in a Lambda handler

Function code that reads its configuration on cold start needs no special treatment. Any
`@aws-sdk/client-ssm` client the handler creates is intercepted and dispatched with the function's
execution role as the caller, so the role's policy decides whether the read succeeds.

```typescript sim-ssm-lambda-handler-config
/**
 * A simulated Lambda handler reading its configuration from Parameter Store.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";
import { makeLambdaCodeZip } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;
const regionName = simAws.defaultRegionName;

await simAws.ssm().putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-host",
    Type: "String",
    Value: "db.internal",
  }),
);

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "ConfigReaderRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ConfigReaderRole",
    PolicyName: "ReadConfig",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "ssm:GetParameter",
        Resource: `arn:aws:ssm:${regionName}:${accountId}:parameter/myapp/prod/*`,
      },
    }),
  }),
);

const handlerCode = [
  'const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");',
  "exports.handler = async () => {",
  "  const client = new SSMClient({});",
  '  const command = new GetParameterCommand({ Name: "/myapp/prod/db-host" });',
  "  const out = await client.send(command);",
  "  return out.Parameter.Value;",
  "};",
].join("\n");

const zipFile = makeLambdaCodeZip({ "index.js": handlerCode });

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "config-reader",
    Role: role.Role.Arn,
    Handler: "index.handler",
    Code: { ZipFile: zipFile },
  }),
);

await simAws.backgroundTasksComplete();

const invoked = await simAws
  .lambda()
  .invoke(new InvokeCommand({ FunctionName: "config-reader" }));

console.log(Buffer.from(invoked.Payload ?? []).toString("utf8")); // "db.internal"
```

## Account and region scoping

A parameter belongs to one account and region, as it does on real AWS. The same name in another
scope is another parameter.

```typescript sim-ssm-scoping
/**
 * The same simulated parameter name in two Account and Region scopes.
 */

import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws
  .account("111111111111")
  .region("eu-west-2")
  .ssm()
  .putParameter(
    new PutParameterCommand({
      Name: "/myapp/db-host",
      Type: "String",
      Value: "eu.db.internal",
    }),
  );

await simAws
  .account("222222222222")
  .region("us-east-1")
  .ssm()
  .putParameter(
    new PutParameterCommand({
      Name: "/myapp/db-host",
      Type: "String",
      Value: "us.db.internal",
    }),
  );

const read = await simAws
  .account("111111111111")
  .region("eu-west-2")
  .ssm()
  .getParameter(new GetParameterCommand({ Name: "/myapp/db-host" }));

console.log(read.Parameter?.ARN);
// "arn:aws:ssm:eu-west-2:111111111111:parameter/myapp/db-host"
```

## SecureString parameters

A `SecureString` value is encrypted through simulated KMS, under the `aws/ssm` AWS managed key unless
the request names a key of its own. Simulated KMS creates that managed key the first time something
asks for it, so nothing has to set it up.

A read returns the ciphertext unless it asks for decryption. This is the mistake that is easy to make
and hard to see: a handler that forgets `WithDecryption` parses a base64 blob as if it were a
password.

```typescript sim-ssm-secure-string
/**
 * Writing and reading a simulated SecureString parameter.
 */

import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ssm = simAws.ssm();

await ssm.putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-password",
    Type: "SecureString",
    Value: "hunter2",
  }),
);

const encrypted = await ssm.getParameter(
  new GetParameterCommand({ Name: "/myapp/prod/db-password" }),
);

console.log(encrypted.Parameter?.Value); // a base64 ciphertext, not "hunter2"

const decrypted = await ssm.getParameter(
  new GetParameterCommand({
    Name: "/myapp/prod/db-password",
    WithDecryption: true,
  }),
);

console.log(decrypted.Parameter?.Value); // "hunter2"
```

`WithDecryption` on a `String` or `StringList` parameter is ignored rather than refused, as real
Parameter Store ignores it.

Pass `KeyId` to encrypt under a customer managed key instead. A `KeyId` naming a key that does not
exist, is disabled, or is pending deletion fails with `InvalidKeyId`, which is how real Parameter
Store reports every KMS key problem.

Each value is bound to its own parameter's ARN as the KMS encryption context, under the
`PARAMETER_ARN` key, so a ciphertext lifted out of one parameter cannot be decrypted as another.

### A customer managed key needs its own permission

Encrypting and decrypting go to simulated KMS as the caller, not as the service. Under a customer
managed key a write needs `kms:Encrypt` on the key on top of `ssm:PutParameter` on the parameter, and
a decrypting read needs `kms:Decrypt` on top of `ssm:GetParameter`. A role granted one and not the
other fails here rather than in a deployment.

```typescript sim-ssm-secure-string-permissions
/**
 * A Role allowed to read a simulated SecureString but not to decrypt it.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateKeyCommand } from "@aws-sdk/client-kms";
import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;

const key = await simAws
  .kms()
  .createKey(new CreateKeyCommand({ Description: "Parameter key" }));

await simAws.ssm().putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-password",
    Type: "SecureString",
    Value: "hunter2",
    KeyId: key.KeyMetadata?.Arn,
  }),
);

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "ConfigReader",
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

// The parameter is allowed, the key is not.
await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ConfigReader",
    PolicyName: "ReadDbPassword",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "ssm:GetParameter",
        Resource: "*",
      },
    }),
  }),
);

const caller = { kind: "arn", arn: role.Role.Arn } as const;

try {
  await simAws.ssm().getParameter(
    new GetParameterCommand({
      Name: "/myapp/prod/db-password",
      WithDecryption: true,
    }),
    { caller },
  );
} catch (error) {
  console.log((error as Error).name); // "AccessDenied"
}
```

### The aws/ssm managed key needs no permission

A parameter naming no key is encrypted under the `aws/ssm` AWS managed key, and that key asks the
caller for nothing. Parameter Store supplies `kms:ViaService`, and the managed key's policy allows
the account's principals to use it through Systems Manager. A role holding only `ssm:GetParameter`
therefore reads the decrypted value, as it does on real AWS.

The same role cannot take the ciphertext to KMS itself, because that policy allows nothing to a
request arriving directly.

```typescript sim-ssm-secure-string-managed-key
/**
 * Reading a simulated SecureString under the aws/ssm managed key.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;

await simAws.ssm().putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-password",
    Type: "SecureString",
    Value: "hunter2",
  }),
);

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "ConfigReader",
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

// The parameter, and no KMS permission at all.
await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ConfigReader",
    PolicyName: "ReadDbPassword",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "ssm:GetParameter",
        Resource: "*",
      },
    }),
  }),
);

const read = await simAws.ssm().getParameter(
  new GetParameterCommand({
    Name: "/myapp/prod/db-password",
    WithDecryption: true,
  }),
  { caller: { kind: "arn", arn: role.Role.Arn } },
);

console.log(read.Parameter?.Value); // "hunter2"
```

`DescribeParameters` reports the key each `SecureString` is encrypted under as `KeyId`.

## Available functionality

Sim SSM currently supports:

- `PutParameterCommand`, creating a parameter or overwriting one
- `GetParameterCommand`, by name, by `name:version` or by `name:label`
- `GetParametersCommand`, reporting names it could not resolve in `InvalidParameters`
- `GetParametersByPathCommand`, with and without `Recursive`
- `DeleteParameterCommand` and `DeleteParametersCommand`
- `DescribeParametersCommand`
- `String`, `StringList` and `SecureString` parameter types
- `SecureString` values encrypted through simulated KMS, decrypted only with `WithDecryption`
- The `AWS::SSM::Parameter` CloudFormation resource, including `Ref` and `Fn::GetAtt`
- Parameter name validation, including hierarchy depth and the reserved `aws` and `ssm` prefixes
- Authorization of every operation by simulated IAM, against the real IAM action and ARN
- Calls made from inside a simulated Lambda handler, authorized as the function's execution role

## Limitations

Current documented limitations:

- Only standard tier `SecureString` encryption is simulated, which encrypts under the KMS key
  directly. The advanced tier's envelope encryption through the AWS Encryption SDK is not, so
  `kms:GenerateDataKey` is never needed.
- Parameter labels are not simulated. `LabelParameterVersion` is not implemented, so nothing can
  create a label, and a `name:label` selector is refused with an error saying so.
- `GetParameterHistory` is not simulated, though earlier versions stay readable by number.
- The advanced tier is not simulated. `Tier: Advanced` and `Tier: Intelligent-Tiering` are refused,
  and every parameter reports `Tier: Standard` with the 4KB standard tier value limit.
- Parameter policies (expiration and notification) are not simulated. `Policies` is refused, and
  `DescribeParameters` always reports an empty `Policies` list.
- Tags are not simulated. `Tags` on `PutParameter` is refused, and `AddTagsToResource`,
  `RemoveTagsFromResource` and `ListTagsForResource` are not supported.
- `AllowedPattern` is refused rather than ignored, because a value it was meant to reject would
  otherwise be stored without complaint.
- `KeyId` on a `String` or `StringList` parameter is refused, since nothing would encrypt a value
  stored in the clear.
- `DataType` other than `text` is refused. Real Parameter Store validates an `aws:ec2:image` value
  against EC2, which this simulation cannot do.
- Filters are refused rather than ignored. `GetParametersByPath` refuses `ParameterFilters`, and
  `DescribeParameters` refuses `Filters` and `ParameterFilters`. Parameters are listed in name order.
- `DescribeParameters` refuses `Shared`. Parameters cannot be shared between simulated accounts, and
  there is no resource policy support, so cross-account access to a parameter cannot be granted.
- Every version is kept. Real Parameter Store keeps the hundred most recent versions and deletes the
  oldest as new ones are made, which can fail with `ParameterMaxVersionLimitExceeded`.
- There is no per-account parameter count limit, so `ParameterLimitExceeded` never happens.
- Deletion is immediate. Real Parameter Store asks for thirty seconds before a deleted name is reused;
  here the name is free straight away.
- `AWS::SSM::Parameter` supports `Name`, `Type`, `Value`, `Description` and `Tier`. `AllowedPattern`,
  `DataType`, `Policies` and `Tags` reach `PutParameter`, which refuses them for the reasons above.
  `Type: SecureString` is refused, as real CloudFormation refuses it for this resource type: the
  plaintext value would sit in the template.
- The other `AWS::SSM::*` resource types (`Document`, `Association`, `MaintenanceWindow`,
  `PatchBaseline`, `ResourceDataSync` and the rest) are reported as unsupported and skipped rather
  than deployed.
- Every deployment of an `AWS::SSM::Parameter` is a create, so a name another stack already used is
  refused. Sim CloudFormation has no stack updates, so the in-place overwrite real CloudFormation
  does when a template changes `Value` cannot happen yet.
- `{{resolve:ssm:...}}` dynamic references and the `AWS::SSM::Parameter::Value<String>` template
  parameter type are not supported. Those are CloudFormation engine features rather than Parameter
  Store ones; pass the name from `Ref` instead.
- Public parameters under `/aws/service/...` do not exist, and names under the reserved `aws` and
  `ssm` prefixes are refused, as they are on real AWS.
- The Parameters and Secrets Lambda extension HTTP endpoint is not simulated. Handler code has to use
  the SDK.
- Nothing else in Systems Manager is simulated: Run Command, Session Manager, Patch Manager, State
  Manager, Automation, inventory and maintenance windows are all absent.
- SSM is not served as an HTTP API by `serveSimAws`.
