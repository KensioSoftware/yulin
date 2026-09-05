# Simulated Lambda

Yulin creates and invokes Lambda functions in process. A function can use an in-process handler,
code from a zip archive, code stored in simulated S3, or a handler bound to a container image.

Handlers run with their execution role as the simulated caller, so AWS calls made inside a handler
are authorized by simulated IAM, as on real Lambda. Creating a function and changing its role are
authorized as well, both against `lambda:` actions and against `iam:PassRole` on the execution role
the request names. See [passing a Role to a service](https://yulinsim.dev/services/iam/#passing-a-role-to-a-service)
in the IAM docs.

Lambda helpers are available from `@kensio/yulin/lambda`. A `LambdaClient` can be routed to Yulin with
[SDK interception](https://yulinsim.dev/sdk/ "Simulated AWS SDK interception docs").

## Creating and invoking a function

Use `makeLambdaZipFileInput(...)` to pass an in-process handler through the SDK-shaped `Code.ZipFile`
input. The handler runs as an ordinary function in the Node.js process. It supports breakpoints and
access to local state.

```typescript sim-lambda-create-and-invoke
/**
 * Creating and invoking a simulated Lambda function backed by a real
 * in-process handler function.
 */

import {
  CreateFunctionCommand,
  GetFunctionCommand,
  InvokeCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "greeter",
    Role: "arn:aws:iam::111111111111:role/GreeterRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(
        (event: { name: string }) => `Hello ${event.name}`,
      ),
    },
  }),
);

const invokeOutput = await lambda.invoke(
  new InvokeCommand({
    FunctionName: "greeter",
    Payload: JSON.stringify({ name: "Yulin" }),
  }),
);

if (invokeOutput.Payload === undefined) throw new Error("No invoke Payload");
console.log(invokeOutput.StatusCode);
console.log(Buffer.from(invokeOutput.Payload).toString());

await simAws.backgroundTasksComplete();

const fetched = await lambda.getFunction(
  new GetFunctionCommand({ FunctionName: "greeter" }),
);
console.log(fetched.Configuration.State);
```

Creating a function requires an execution `Role` ARN, as on real AWS. A new function starts in the
`Pending` state and becomes `Active` in the background. Wait with
`simAws.backgroundTasksComplete()` when a test asserts on the `Active` state.

Handlers use the same signature as real Node.js Lambda handlers, `(event, context, callback)`. All
the real completion styles work. Return a promise, return a plain value, call the callback, or use
the legacy context `done`/`fail`/`succeed` methods. Typed handlers written against the `aws-lambda`
typings package can be passed in unchanged.

A handler that throws is reported AWS-style. The invocation output has `FunctionError:
"Unhandled"` and the payload is an error document with `errorType`, `errorMessage`, and `trace`.
The invoke call itself returns normally.

## Zip-packaged code and the vm runtime

Use an in-process handler for most tests. Use packaged code when the test covers the deployed bundle,
including its imports. Both forms run through simulated Lambda and make AWS calls as the function's
execution role.

`makeLambdaCodeZip(...)` builds zip bytes from a source string or a map of archive paths to file
contents. A source string becomes `index.js`. Yulin runs the archive in a Node.js `vm`, loads the
module on the first invocation and preserves module state for later invocations.

```typescript sim-lambda-zip-code-vm-runtime
/**
 * Running zip-packaged function code in the simulated vm runtime.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaCodeZip } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

const codeZip = makeLambdaCodeZip(`
  let invocations = 0;
  exports.handler = async (event) => {
    invocations += 1;
    return { name: event.name, invocations };
  };
`);

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "warm-counter",
    Role: "arn:aws:iam::111111111111:role/WarmCounterRole",
    Handler: "index.handler",
    Runtime: "nodejs22.x",
    Code: { ZipFile: codeZip },
  }),
);

const first = await lambda.invoke(
  new InvokeCommand({
    FunctionName: "warm-counter",
    Payload: JSON.stringify({ name: "one" }),
  }),
);
const second = await lambda.invoke(
  new InvokeCommand({
    FunctionName: "warm-counter",
    Payload: JSON.stringify({ name: "two" }),
  }),
);

if (first.Payload === undefined || second.Payload === undefined) {
  throw new Error("No invoke Payload");
}
console.log(Buffer.from(first.Payload).toString());
console.log(Buffer.from(second.Payload).toString());

await simAws.backgroundTasksComplete();
```

The vm runtime models the real Node.js runtime closely:

- The `Handler` string selects the module and export, e.g. `index.handler` or `src/app.handler`.
- Modules in the archive can `require` each other with relative paths, use Node.js built-in
  modules, and use dependencies bundled under the archive's `node_modules/`.
- The sandbox provides an AWS-like `process.env` with the standard runtime variables
  (`AWS_REGION`, `AWS_LAMBDA_FUNCTION_NAME`, `AWS_LAMBDA_FUNCTION_MEMORY_SIZE`, ...).
- The sandbox provides writable `process.stdout` and `process.stderr`, with its `console` built
  over them, as the real runtime does. See [What a handler prints](#what-a-handler-prints).
- Import and handler problems surface as invocation errors, with the real runtime error types
  (`Runtime.ImportModuleError`, `Runtime.HandlerNotFound`, `Runtime.UserCodeSyntaxError`,
  `Runtime.MalformedHandlerName`). Creation succeeds either way.

Code is CommonJS, as zipped `.js` files are on the real `nodejs` runtimes. An ES module deployment
package is refused at cold start. A handler file ending in `.mjs` is reported as
`Runtime.ImportModuleError` naming the file. A `.js` file opening on `import` is reported as
`Runtime.UserCodeSyntaxError: Cannot use import statement outside a module`. The archive's root
`package.json` goes unread. Declaring `"type": "module"` in it makes no difference to either.
Real Lambda has run ES module packages since nodejs14.x, and `NodejsFunction` in CDK emits one
under `format: OutputFormat.ESM`.

Use an [executable binding](#executable-bindings) or `makeLambdaZipFileInput(...)` for an ESM handler.
The test's module system loads an in-process handler. To test the archive itself, compile the source
to CommonJS before creating the zip.

`Code.ZipFile` bytes that fail to unzip are rejected at creation with the AWS-like
`InvalidParameterValueException: Could not unzip uploaded file`.

`Code.ZipFile` accepts zip archives produced by other tools. Archives from `makeLambdaCodeZip` can
also be opened with standard zip tools.

### What a handler prints

The sandbox has writable standard streams. `process.stdout.write(...)` and
`process.stderr.write(...)` work inside a handler, and its `console` is built over them as the real
runtime's is. A logging library that builds its own console over them works too:

```javascript
const { Console } = require("node:console");
const logger = new Console({ stdout: process.stdout, stderr: process.stderr });
```

That is what AWS Lambda Powertools' `Logger` does, at module scope, and a bundled Powertools handler
runs here. Its `Metrics` writes its embedded metric format document to standard output, where the
metrics a handler emitted can be read back the same way its log lines can.

What a handler prints is recorded into the function's log group in
[simulated CloudWatch Logs](https://yulinsim.dev/services/logs/ "Simulated CloudWatch Logs usage docs"), at
`/aws/lambda/<function name>`. A test asserts on it by searching that group:

```typescript
const found = await simAws.logs().filterLogEvents(
  new FilterLogEventsCommand({
    logGroupName: "/aws/lambda/orders",
    filterPattern: "ERROR",
  }),
);
```

One line becomes one log event, as it does in an account. A handler printing a multi-line object
gets several events, and a search for one of those lines finds it. EMF metric documents go to the
same place, since Powertools' `Metrics` writes them to standard output.

Each invocation also reaches the matching host stream, standard output to standard output and
standard error to standard error, where a test or a `pnpm run dev` session already sees output. That
is a tee rather than a redirect. Real Lambda sends output to CloudWatch Logs and nowhere else, and a
test tool that swallowed the output would make a failing test harder to debug than it is with none
of this.

`context.logGroupName` and `context.logStreamName` name the group and stream that were actually
written to, and stream names use the real `YYYY/MM/DD/[$LATEST]<hash>` format. The hash identifies
the execution environment rather than the request. Match the shape, and leave the value alone.

A function backed by a handler function reference is recorded too, whether the handler arrived
through `Code.ZipFile`, through a CloudFormation stack binding, or as the image of a simulated ECR
repository. Such a handler is a closure over your own module scope and prints through the same
console and standard streams as the rest of the test run, and both are bridged to the function's log
group for the length of an invocation, in the way `process.env` and `Date` are. `console.log`,
`console.info`, `console.debug`, `console.warn` and `console.error` all arrive, along with anything
written to `process.stdout` or `process.stderr`, so a logging library building its own console over
the process streams is recorded as well. Printing with no invocation running reaches the host
console alone.

A test that binds its handler for a breakpoint, or so the handler can close over its own state, can
still assert on the lines it logged:

```typescript sim-lambda-bound-handler-output
/**
 * Asserting on what a bound in-process Lambda handler printed.
 */

import { FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: "arn:aws:iam::111111111111:role/OrdersRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: { orderId: string }) => {
        console.log(`ERROR ${event.orderId} has no items`);

        return "rejected";
      }),
    },
  }),
);

await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "orders",
    Payload: JSON.stringify({ orderId: "order-1" }),
  }),
);

const logged = await simAws.logs().filterLogEvents(
  new FilterLogEventsCommand({
    logGroupName: "/aws/lambda/orders",
    filterPattern: "ERROR",
  }),
);

// [ 'ERROR order-1 has no items' ]
console.log(logged.events?.map((event) => event.message));

await simAws.backgroundTasksComplete();
```

#### Keeping handler output out of the test console

A handler that logs on every invocation makes that tee expensive. Powertools' `Metrics` writes an
EMF document for every metric it counts, and a suite invoking a function a few hundred times buries
its own output under them. `captureOnly()` stops the forwarding for every function of one simulated
Lambda:

```typescript sim-lambda-capture-only-output
/**
 * Recording what a handler prints without printing it again.
 */

import { FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "user",
    Role: "arn:aws:iam::111111111111:role/UserRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(() => {
        // What AWS Lambda Powertools' Metrics writes for every metric it
        // counts, once per request.
        process.stdout.write(
          `${JSON.stringify({ service: "user", UserRequest: 1 })}\n`,
        );

        return { statusCode: 200 };
      }),
    },
  }),
);

// The test run's own console stays clean from here on.
simAws.lambda().output().captureOnly();

await simAws.lambda().invoke(new InvokeCommand({ FunctionName: "user" }));

// The log group holds the line, as it did before.
const found = await simAws
  .logs()
  .filterLogEvents(
    new FilterLogEventsCommand({ logGroupName: "/aws/lambda/user" }),
  );

console.log(found.events?.[0]?.message);
```

The log group holds every line either way. Nothing is lost by it, and `teeToHost()` puts the
forwarding back.

The settings belong to one Account and Region, as the functions do. A suite invoking through
`simAws.region("eu-west-1")` sets them on that scope. They are read as each line is written. A
change reaches a function that has already cold started.

A function with no simulated CloudWatch Logs behind it goes on printing whatever the settings say.
That is a function on a standalone `SimLambda`, built outside a `SimAws` instance, and it has no log
group for its output to be read back out of.

### When a handler throws

An invocation that ends in an error nothing caught leaves an `ERROR Invoke Error` line in the
function's log group, as it does in an account. The line carries a JSON document holding the error's
type, its message and its stack, with one array element per stack frame. Whatever the handler
printed before it failed is recorded above it. A handler bound in-process and one packaged as zip
code are both recorded this way.

```typescript sim-lambda-unhandled-error-output
/**
 * Reading why an invocation failed out of the function's log group.
 */

import { FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: "arn:aws:iam::111111111111:role/OrdersRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(() => {
        console.log("INFO handling order-1");

        throw new Error("order has no items");
      }),
    },
  }),
);

await simAws.lambda().invoke(new InvokeCommand({ FunctionName: "orders" }));

const failure = await simAws.logs().filterLogEvents(
  new FilterLogEventsCommand({
    logGroupName: "/aws/lambda/orders",
    filterPattern: '"Invoke Error"',
  }),
);

// ERROR Invoke Error {"errorType":"Error","errorMessage":"order has no items",...}
console.log(failure.events?.at(0)?.message);

await simAws.backgroundTasksComplete();
```

The caller still hears about it too. `Invoke` answers with `FunctionError` set to `Unhandled` and
the same error document in its response payload.

Real Lambda writes `START`, `END` and `REPORT` lines around every invocation. Simulated Lambda
writes none of those.

## Function code from S3

Function code may reference a zip object in simulated S3. Yulin reads the object once during
function creation as the caller creating the function, so simulated IAM applies to the S3 read.

```typescript sim-lambda-s3-code
/**
 * Creating a simulated Lambda function from a code zip stored in sim S3.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";
import { makeLambdaCodeZip } from "@kensio/yulin/lambda";

const simAws = new SimAws();

await simAws
  .s3()
  .createBucket(new CreateBucketCommand({ Bucket: "code-bucket" }));
await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "code-bucket",
    Key: "artifacts/greeter.zip",
    Body: makeLambdaCodeZip(
      "exports.handler = async (event) => 'Hello ' + event.name + ' from S3';",
    ),
  }),
);

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "s3-greeter",
    Role: "arn:aws:iam::111111111111:role/S3GreeterRole",
    Handler: "index.handler",
    Code: {
      S3Bucket: "code-bucket",
      S3Key: "artifacts/greeter.zip",
    },
  }),
);

const output = await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "s3-greeter",
    Payload: JSON.stringify({ name: "Yulin" }),
  }),
);

if (output.Payload === undefined) throw new Error("No invoke Payload");
console.log(Buffer.from(output.Payload).toString());

await simAws.backgroundTasksComplete();
```

S3 lookup failures are wrapped AWS-style, e.g. `Error occurred while GetObject. S3 Error Code:
NoSuchKey. ...`. `S3ObjectVersion` is accepted but ignored, as sim S3 has no object versioning
yet. A standalone `SimLambda` (constructed directly, outside `SimAws`) has no sim S3 to
fetch from. `SimAws`-created Lambda wires the same-scope sim S3 automatically, matching real
Lambda's requirement for a same-region code bucket.

## Replacing a function's code

`UpdateFunctionCodeCommand` replaces the code `$LATEST` runs, taking the same four code shapes `CreateFunction` takes. It carries them at the top level of its input rather than under `Code`, as real Lambda does. A test that redeploys part-way through, or that wants a function to start failing after a few invocations, changes what runs without deleting the function.

The function keeps everything else it holds. Its name, ARN, execution Role, environment variables, timeout, memory, [resource-based policy](#resource-based-policies), [Function URL](#function-urls), published versions and aliases all survive, which is what separates this from deleting the function and creating it again.

```typescript sim-lambda-update-function-code
/**
 * Replacing the code a simulated Lambda function runs, part-way through.
 */

import {
  CreateFunctionCommand,
  InvokeCommand,
  UpdateFunctionCodeCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: "arn:aws:iam::111111111111:role/OrdersRole",
    Code: { ZipFile: makeLambdaZipFileInput(() => ({ ok: true })) },
  }),
);

await lambda.updateFunctionCode(
  new UpdateFunctionCodeCommand({
    FunctionName: "orders",
    ZipFile: makeLambdaZipFileInput(() => {
      throw new Error("the order service is down");
    }),
  }),
);

const invoked = await lambda.invoke(
  new InvokeCommand({ FunctionName: "orders" }),
);
console.log(invoked.FunctionError);

await simAws.backgroundTasksComplete();
```

Zip code runs under the `Handler` the function already has, because `UpdateFunctionCode` carries none of its own. Replacing a handler-reference function's code with a zip archive is refused for that reason. Set a `Handler` with [`UpdateFunctionConfiguration`](#changing-a-functions-settings) first, then replace the code.

A published version keeps the code it was published with, so a version published before an update goes on running it while `$LATEST` runs the replacement. `Publish: true` publishes a version of the replacement code and answers with that version rather than with `$LATEST`. See [Versions and aliases](#versions-and-aliases).

## Changing a function's settings

`UpdateFunctionConfigurationCommand` changes the settings simulated Lambda models: `Role`, `Handler`, `Runtime`, `Description`, `Timeout`, `MemorySize` and `Environment`. A member the request leaves out keeps the value the function has. Changing one setting says nothing about the rest.

`Environment` replaces the whole variable map rather than merging into it, as on real AWS. A variable the request leaves out is gone, and `Variables: {}` clears them all. The names are validated the way `CreateFunction` validates them, down to the reserved ones the runtime owns.

```typescript sim-lambda-update-function-configuration
/**
 * Changing a simulated Lambda function's timeout and environment variables.
 */

import {
  CreateFunctionCommand,
  InvokeCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: "arn:aws:iam::111111111111:role/OrdersRole",
    Timeout: 30,
    Environment: { Variables: { ORDERS_TABLE: "orders-v1" } },
    Code: {
      ZipFile: makeLambdaZipFileInput((_event, context) => ({
        table: process.env["ORDERS_TABLE"],
        remainingMs: context.getRemainingTimeInMillis(),
      })),
    },
  }),
);

await lambda.updateFunctionConfiguration(
  new UpdateFunctionConfigurationCommand({
    FunctionName: "orders",
    Timeout: 1,
    Environment: { Variables: { ORDERS_TABLE: "orders-v2" } },
  }),
);

const invoked = await lambda.invoke(
  new InvokeCommand({ FunctionName: "orders" }),
);
console.log(Buffer.from(invoked.Payload ?? new Uint8Array()).toString());

await simAws.backgroundTasksComplete();
```

The function keeps its name, ARN, code, [resource-based policy](#resource-based-policies), [Function URL](#function-urls), published versions and aliases. A version published beforehand keeps the settings it was published with, and one published afterwards carries the changed ones. See [Versions and aliases](#versions-and-aliases).

A changed `Environment`, `MemorySize` or `Handler` reaches the code itself. The next invocation of a [zip code function](#zip-packaged-code-and-the-vm-runtime) cold starts under the new settings. Whatever its module had in memory goes, the way it goes on real Lambda when the configuration changes. A `Handler` change picks a different export out of the archive already deployed, with no need to upload it again.

## Listing the functions

`ListFunctionsCommand` reports every function in the Account and Region, each described as `GetFunction` describes it. `FunctionVersion: "ALL"` adds each function's published versions to the listing.

```typescript sim-lambda-list-functions
/**
 * Listing the simulated Lambda functions an Account and Region holds.
 */

import {
  CreateFunctionCommand,
  ListFunctionsCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

for (const functionName of ["orders", "invoices"]) {
  await lambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: "arn:aws:iam::111111111111:role/OrdersRole",
      Code: { ZipFile: makeLambdaZipFileInput(() => functionName) },
    }),
  );
}

const listed = await lambda.listFunctions(new ListFunctionsCommand({}));
console.log(listed.Functions.map((simFunction) => simFunction.FunctionName));

await simAws.backgroundTasksComplete();
```

The listing is authorized as a whole, against `lambda:ListFunctions` on `*`, the way AWS documents the permission. A caller without it is denied rather than given a filtered list.

## The runtime-provided AWS SDK

Like the real Lambda Node.js runtime, the simulated runtime provides AWS SDK v3 packages without
them being bundled in the code archive. `require("@aws-sdk/client-s3")`, or any other `@aws-sdk/*`
package installed in the host project, resolves to the real package with its clients routed into
the owning simulated AWS environment. Calls the function code makes run as the function's
execution role, and simulated IAM authorizes them just like real Lambda execution roles.

```typescript sim-lambda-runtime-provided-sdk
/**
 * Simulated Lambda function code reading sim S3 through the
 * runtime-provided AWS SDK, authorized as its execution role.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";
import { makeLambdaCodeZip } from "@kensio/yulin/lambda";

const simAws = new SimAws();

// An object for the function to read.
await simAws
  .s3()
  .createBucket(new CreateBucketCommand({ Bucket: "data-bucket" }));
await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "data-bucket",
    Key: "greeting.txt",
    Body: "Hello from S3",
  }),
);

// An execution role allowed to read it.
const roleCreation = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "ReaderRole",
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
    RoleName: "ReaderRole",
    PolicyName: "ReadDataBucket",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::data-bucket/*",
      },
    }),
  }),
);

// Function code using the runtime-provided AWS SDK.
await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "reader",
    Role: roleCreation.Role.Arn,
    Handler: "index.handler",
    Code: {
      ZipFile: makeLambdaCodeZip(`
        const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
        const s3Client = new S3Client({});
        exports.handler = async (event) => {
          const output = await s3Client.send(
            new GetObjectCommand({
              Bucket: "data-bucket",
              Key: event.objectKey,
            }),
          );
          return await output.Body.transformToString();
        };
      `),
    },
  }),
);

const output = await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "reader",
    Payload: JSON.stringify({ objectKey: "greeting.txt" }),
  }),
);

if (output.Payload === undefined) throw new Error("No invoke Payload");
console.log(Buffer.from(output.Payload).toString());

await simAws.backgroundTasksComplete();
```

If the execution role lacks permission for a call the handler makes, simulated IAM denies it and
the invocation reports the denial as an unhandled function error, just as a real execution-role
denial surfaces inside the handler.

A client constructed without a region defaults to the function's account and region scope, as the
real runtime's `AWS_REGION` provides. An explicit region on the client wins. The archive always
takes precedence. A package bundled under the archive's `node_modules/` is used as it stands, and
reaches the simulation through the transport below.

An `@aws-sdk/*` package the project has not installed is refused when the function code requires
it. The message names every other AWS SDK package the code imports and the project is missing too.
One install then covers the set. (The archive is the only place to read what a third-party function
imports.) Packages bundled under the archive's `node_modules/` are left out of that list, along with
anything only a bundled dependency imports.

### Function code that bundles the SDK

Some deployment packages inline the SDK rather than relying on the runtime to provide it. CDK's
`NodejsFunction` does that when given `bundling: { externalModules: [] }`. There is then no
`@aws-sdk/*` module left for the runtime to provide, and nothing to intercept.

Those functions reach the simulation anyway. The runtime provides their HTTP transport, `node:http`
and `node:https`, and a request addressed to an AWS API endpoint is answered from the same
simulated services, as the same execution role, instead of going to the network. The execution
role credentials are in the function's environment, as real Lambda puts them there. The SDK resolves
credentials inside the sandbox, where it would otherwise fail with `CredentialsProviderError`.

A serialized request states which operation it is and carries its input for the services using the
AWS JSON protocol. Those are the ones that can be read back without the operation's schema:

ACM, CloudWatch Logs, Cognito Identity Provider, DynamoDB, DynamoDB Streams, ECS, EventBridge, KMS,
Rekognition, Secrets Manager, SQS and SSM.

S3 states its operation in the method and the path. A bundled S3 client reaches the endpoint that
already serves S3 to a client given `--endpoint-url`, in either of the two addressing styles an SDK
sends. A function can read and write Objects with an `S3Client` its archive inlines. The execution
Role authorizes each request, and a read it holds no `s3:GetObject` for comes back to the SDK as
`AccessDenied`.

A bundled call to any other simulated service, such as SNS, SES or Lambda itself, fails with an
error naming the service. Leaving the SDK out of that archive puts it back
on the module interception path above, which every simulated service is reachable through.

Values the JSON protocols encode travel in their encoded form. A binary attribute written through a
bundled SDK is stored base64-encoded and decodes correctly when the same path reads it back, where
an in-process intercepted client reading it sees the encoded string.

Only service API endpoints are answered as Commands. The endpoint of one resource, such as a Lambda
Function URL or an API Gateway HTTP API, carries an ordinary HTTP request. Those are routed by
hostname, along with everything else a handler asks for over HTTP.

## The HTTP requests function code makes

A request from a handler to a hostname the simulation serves is answered by the simulation. It
never leaves the process. `fetch`, `node:http` and `node:https` all reach it, so it makes no
difference which client the handler was written with.

Two kinds of hostname are served. Everything simulated Route53 resolves is answered over the same
in-process HTTP entry point a browser on localhost reaches. That covers a
[Cognito user pool domain](https://yulinsim.dev/services/cognito/ "Simulated Cognito usage docs") in both of its forms
(`<prefix>.auth.<region>.amazoncognito.com` and a custom domain such as `auth.example.com`), an
[API Gateway HTTP API](https://yulinsim.dev/services/apigatewayv2/ "Simulated API Gateway usage docs"), a
[load balancer](https://yulinsim.dev/services/elbv2/ "Simulated ELBv2 usage docs") and anything a hosted-zone record points at
one of those.

The AWS service API endpoints are the other kind, and a request to one is read for what it carries.
A serialized Command goes to the simulated operation it names (the section above). A request
carrying no operation header and no signature is an ordinary HTTP request, and the endpoint serves
it the way the local hostname does. That is how a pool's JWKS is read at
`cognito-idp.<region>.amazonaws.com` by a client holding no credentials.

A hostname the simulation serves nothing at goes where it was addressed. A handler calling a
payment API or a webhook reaches the network as it always did.

The authorization code grant is the request this exists for. Cognito issues an authorization code
to the browser and the application exchanges it for tokens from its own server, and there is no SDK
operation for that exchange. It is a POST to `/oauth2/token` on the pool's domain, which is a
hostname the simulation now serves:

```typescript sim-lambda-outbound-token-exchange
/**
 * A simulated Lambda exchanging an authorization code for tokens at the
 * simulated Cognito user pool domain that issued it.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

// The pool's domain, the app client the callback authenticates as, and the
// code the browser carried to it.
declare const domainHost: string;
declare const clientId: string;
declare const clientSecret: string;
declare const callbackUrl: string;
declare const authorizationCode: string;

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "user",
    Role: "arn:aws:iam::111111111111:role/UserRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(async (event: { code: string }) => {
        const credentials = `${clientId}:${clientSecret}`;
        const response = await fetch(`https://${domainHost}/oauth2/token`, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            authorization: `Basic ${Buffer.from(credentials).toString("base64")}`,
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code: event.code,
            redirect_uri: callbackUrl,
          }).toString(),
        });

        return await response.json();
      }),
    },
  }),
);

const output = await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "user",
    Payload: JSON.stringify({ code: authorizationCode }),
  }),
);

if (output.Payload === undefined) throw new Error("No invoke Payload");

// The id, access and refresh tokens the pool issued.
console.log(Buffer.from(output.Payload).toString());

await simAws.backgroundTasksComplete();
```

Zip-packaged code takes its three clients from the sandbox the vm runtime builds around it, and
nothing outside that sandbox is touched. A handler function reference is a closure over your own
module scope and reads the same globals as the rest of the test run, so those globals are bridged
for the length of an invocation, in the way `process.env` and `Date` are (see
[Read environment variables inside the handler](#read-environment-variables-inside-the-handler)).
With no invocation running they behave as they always did, which leaves a request a handler module
makes while it is being imported going to the network.

A response comes back from the simulation as it was answered. A redirect arrives as the `302` it
is, where the host `fetch` would have followed it.

### Verifying a Cognito token in a handler

An API that takes a bearer token verifies it against the keys the pool publishes.
`CognitoJwtVerifier` from `aws-jwt-verify` builds the JWKS URL from the pool id
(`https://cognito-idp.<region>.amazonaws.com/<userPoolId>/.well-known/jwks.json`) and accepts no
other, and fetches it with `node:https` the first time it verifies anything. Both of those are the
simulation's to answer inside a handler, so the verifier in the deployed code verifies a simulated
pool's token with no cache primed and no setup around it:

```typescript sim-lambda-verify-cognito-token
/**
 * A simulated Lambda verifying a Cognito access token, with a verifier that
 * goes and fetches the pool's JWKS for itself.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { CognitoJwtVerifier } from "aws-jwt-verify";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

// The pool the API trusts, the app client its tokens are issued to, and the
// token a caller presented.
declare const userPoolId: string;
declare const clientId: string;
declare const accessToken: string;

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "api",
    Role: "arn:aws:iam::111111111111:role/ApiRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(async (event: { token: string }) => {
        const verifier = CognitoJwtVerifier.create({
          userPoolId,
          tokenUse: "access",
          clientId,
        });

        return await verifier.verify(event.token);
      }),
    },
  }),
);

const output = await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "api",
    Payload: JSON.stringify({ token: accessToken }),
  }),
);

if (output.Payload === undefined) throw new Error("No invoke Payload");

// The claims of the access token, read by the verifier the API ships with.
console.log(Buffer.from(output.Payload).toString());

await simAws.backgroundTasksComplete();
```

The pool's OpenID configuration is served at the same endpoint, at
`/<userPoolId>/.well-known/openid-configuration`. Its `issuer` and `jwks_uri` name the local
hostname the simulation answered on, and a handler that discovered the document can fetch the keys
it points at. See
[serving a pool's JWKS](https://yulinsim.dev/services/cognito/#serving-a-pools-jwks-on-localhost "Simulated Cognito usage docs").

A Command the same function sends still reaches simulated Cognito. An SDK bundled into the
deployment package addresses `cognito-idp.<region>.amazonaws.com` as well, and its requests carry
the operation header that says so.

## Invocation types

`InvokeCommand` supports all three invocation types. `RequestResponse` waits for the handler and
returns its JSON result. `Event` returns 202 and schedules the handler in the background. `DryRun`
returns 204 without invoking the handler.

```typescript sim-lambda-invocation-types
/**
 * Simulated Lambda Event and DryRun invocation types.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

const handledEvents: unknown[] = [];
await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "recorder",
    Role: "arn:aws:iam::111111111111:role/RecorderRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event) => {
        handledEvents.push(event);
        return null;
      }),
    },
  }),
);

// An Event invocation is accepted before the handler has run.
const eventOutput = await lambda.invoke(
  new InvokeCommand({
    FunctionName: "recorder",
    InvocationType: "Event",
    Payload: JSON.stringify({ recorded: true }),
  }),
);
console.log(eventOutput.StatusCode);
console.log(handledEvents.length);

// The handler runs when simulator background tasks complete.
await simAws.backgroundTasksComplete();
console.log(handledEvents.length);

// A DryRun invocation never runs the handler.
const dryRunOutput = await lambda.invoke(
  new InvokeCommand({
    FunctionName: "recorder",
    InvocationType: "DryRun",
  }),
);
console.log(dryRunOutput.StatusCode);
```

`Event` invocation handler errors never reach the caller, who has already been answered. Where the
handler keeps failing they reach the function's destinations instead, which is what the next section
covers.

## Asynchronous retries and destinations

An `Event` invocation retries a failed handler twice by default. Retries use the simulated clock,
after about one minute and then two minutes. Advance the clock to run them in a test.

`PutFunctionEventInvokeConfigCommand` controls retry count and destinations. Lambda sends a final
failure to `OnFailure` and a successful result to `OnSuccess`. Destinations may be SQS, SNS,
EventBridge or another Lambda function.

The source function's execution role must allow the operation that writes to the destination:

| Destination           | Required action         |
| --------------------- | ----------------------- |
| SQS queue             | `sqs:SendMessage`       |
| SNS topic             | `sns:Publish`           |
| EventBridge event bus | `events:PutEvents`      |
| Lambda function       | `lambda:InvokeFunction` |

Simulated Lambda calls the destination service with that role as its caller. A denied delivery
rejects the background task without changing the destination. A Lambda destination is invoked
asynchronously, so the delivery succeeds once the target invocation has been accepted.

```typescript sim-lambda-async-destinations
/**
 * Asynchronous invocation retries and an OnFailure destination.
 */

import {
  CreateFunctionCommand,
  InvokeCommand,
  PutFunctionEventInvokeConfigCommand,
} from "@aws-sdk/client-lambda";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateQueueCommand, ReceiveMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";
import {
  makeLambdaZipFileInput,
  type SimLambdaDestinationRecord,
} from "@kensio/yulin/lambda";

const simAws = new SimAws({ defaultAccountId: "111111111111" });
const iam = simAws.iam();
const lambda = simAws.lambda();
const sqs = simAws.sqs();
const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:order-failures`;

const created = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "order-failures" }),
);

const role = await iam.createRole(
  new CreateRoleCommand({
    RoleName: "OrdersRole",
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
const roleArn = role.Role.Arn;

await iam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "OrdersRole",
    PolicyName: "SendFailedOrders",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "sqs:SendMessage",
        Resource: queueArn,
      },
    }),
  }),
);

const attempts: string[] = [];
await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: roleArn,
    Code: {
      ZipFile: makeLambdaZipFileInput((event: { id: number }) => {
        attempts.push(`tried order ${event.id}`);
        throw new Error("orders handler failed");
      }),
    },
  }),
);

await lambda.putFunctionEventInvokeConfig(
  new PutFunctionEventInvokeConfigCommand({
    FunctionName: "orders",
    MaximumRetryAttempts: 1,
    DestinationConfig: {
      OnFailure: {
        Destination: queueArn,
      },
    },
  }),
);

await lambda.invoke(
  new InvokeCommand({
    FunctionName: "orders",
    InvocationType: "Event",
    Payload: JSON.stringify({ id: 7 }),
  }),
);

// The first attempt runs behind the caller. The retry waits on the clock.
await simAws.backgroundTasksComplete();
console.log(attempts.length);

await simAws.clock().advanceBy({ minutes: 2 });
console.log(attempts.length);

const received = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl: created.QueueUrl }),
);
const record = JSON.parse(
  String(received.Messages?.[0]?.Body),
) as SimLambdaDestinationRecord;
console.log(record.requestContext.condition);
console.log(record.requestContext.approximateInvokeCount);
console.log(record.requestPayload);
```

The queue receives the record real Lambda sends, carrying the event that was invoked as
`requestPayload`, the handler error as `responsePayload`, how many attempts were made, and a
`condition` of `Success`, `RetriesExhausted` or `EventAgeExceeded`. An event that outlives
`MaximumEventAgeInSeconds` is given up on before its next attempt and reported under that last
condition.

`GetFunctionEventInvokeConfigCommand`, `UpdateFunctionEventInvokeConfigCommand`,
`DeleteFunctionEventInvokeConfigCommand` and `ListFunctionEventInvokeConfigsCommand` read and change
what was written. `Put` writes the whole config, returning a setting it leaves out to its default,
and `Update` changes only the settings it names. A `Qualifier` gives a published version or an alias
a config of its own, and an invocation of a qualifier with no config of its own uses the function's.

### Dead-letter targets

`DeadLetterConfig` sends a failed asynchronous event to SQS or SNS. Configure it with
`CreateFunction` or `UpdateFunctionConfiguration`. The target receives the original event rather
than a destination record. The execution role needs `sqs:SendMessage` or `sns:Publish`.

```typescript sim-lambda-dead-letter-queue
/**
 * A simulated Lambda function with a dead-letter queue.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { CreateQueueCommand, ReceiveMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws({ defaultAccountId: "111111111111" });
const iam = simAws.iam();
const lambda = simAws.lambda();
const sqs = simAws.sqs();
const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:orders-dlq`;

const created = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders-dlq" }),
);

const role = await iam.createRole(
  new CreateRoleCommand({
    RoleName: "OrdersRole",
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
const roleArn = role.Role.Arn;

await iam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "OrdersRole",
    PolicyName: "SendFailedOrders",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "sqs:SendMessage",
        Resource: queueArn,
      },
    }),
  }),
);

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: roleArn,
    DeadLetterConfig: {
      TargetArn: queueArn,
    },
    Code: {
      ZipFile: makeLambdaZipFileInput(() => {
        throw new Error("orders handler failed");
      }),
    },
  }),
);

await lambda.invoke(
  new InvokeCommand({
    FunctionName: "orders",
    InvocationType: "Event",
    Payload: JSON.stringify({ id: 7 }),
  }),
);

// Past both retries, so the invocation has been given up on.
await simAws.backgroundTasksComplete();
await simAws.clock().advanceBy({ minutes: 5 });

const received = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl: created.QueueUrl }),
);
console.log(received.Messages?.[0]?.Body);
```

A function carrying both a dead-letter target and an `OnFailure` destination sends to both.

## Versions and aliases

`PublishVersionCommand` creates an immutable numbered copy of the function's code and configuration.
Versions start at `1`. `CreateAliasCommand` gives a version a name, and `UpdateAliasCommand` moves
that name to another version.

`InvokeCommand` and `GetFunctionCommand` take a `Qualifier` naming a version number or an alias.
The same qualifier can travel on the `FunctionName` instead, appended to the name (`orders:live`)
or to a function ARN. `ExecutedVersion` on the invocation output is the version number that ran,
and an invocation through an alias reports the version behind it. Inside the handler, `context`
carries that number as `functionVersion` and the qualified ARN as `invokedFunctionArn`.

```typescript sim-lambda-versions-and-aliases
/**
 * Publishing a simulated Lambda function version, pointing an alias at it,
 * invoking through the alias, and granting a permission on the alias alone.
 */

import {
  AddPermissionCommand,
  CreateAliasCommand,
  CreateFunctionCommand,
  GetPolicyCommand,
  InvokeCommand,
  ListVersionsByFunctionCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: "arn:aws:iam::111111111111:role/OrdersRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((_event, context) => ({
        ranAs: context.functionVersion,
      })),
    },
  }),
);

const published = await lambda.publishVersion(
  new PublishVersionCommand({ FunctionName: "orders" }),
);
console.log(published.Version);
console.log(published.FunctionArn);

await lambda.createAlias(
  new CreateAliasCommand({
    FunctionName: "orders",
    Name: "live",
    FunctionVersion: published.Version,
  }),
);

const invoked = await lambda.invoke(
  new InvokeCommand({ FunctionName: "orders", Qualifier: "live" }),
);
console.log(invoked.ExecutedVersion);

const versions = await lambda.listVersionsByFunction(
  new ListVersionsByFunctionCommand({ FunctionName: "orders" }),
);
console.log(versions.Versions.map((version) => version.Version));

await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "orders",
    Qualifier: "live",
    StatementId: "AllowReporting",
    Action: "lambda:InvokeFunction",
    Principal: "222222222222",
  }),
);

// The statements granted on the alias, and on nothing else.
const aliasPolicy = await lambda.getPolicy(
  new GetPolicyCommand({ FunctionName: "orders", Qualifier: "live" }),
);
console.log(aliasPolicy.Policy);
```

A function with no qualifier is `$LATEST`, which is what every caller that passes none reaches, and
what `ListVersionsByFunctionCommand` lists ahead of the published versions. An alias points at a
published version, and `$LATEST` is refused with a `ValidationException` on the version pattern, as
it is on real Lambda. A qualifier naming no version and no alias fails with
`ResourceNotFoundException` against the qualified ARN.

`GetAliasCommand`, `ListAliasesCommand` and `DeleteAliasCommand` read and remove aliases.
`ListAliasesCommand` takes a `FunctionVersion` to narrow the answer to the aliases on one version,
and a version nothing published is reported as missing rather than answered with an empty listing.
Deleting an alias leaves the version it pointed at invokable by its number. Deleting the function
takes its versions and aliases with it.

`AddPermissionCommand`, `RemovePermissionCommand` and `GetPolicyCommand` take the same `Qualifier`.
The statement is held against the version or the alias it names, and carries that qualified ARN as
its `Resource`. `GetPolicy` reads back the statements of the one resource it was asked for, and a
request with no qualifier reads the function's own. An `Invoke` is authorized against the resource
it names. A grant on `live` admits a call through `live`, and a call on the function itself or on
the version behind the alias needs a grant of its own. See
[Resource-based policies](#resource-based-policies).

An alias keeps the grants made on it when `UpdateAliasCommand` moves it to another version. That is
what makes an alias a stable thing for another Account or another service to be granted (the grant
belongs to the name that was integrated against).

The version and alias commands act on the function itself, so they take its name or its unqualified
ARN. A `FunctionName` carrying a qualifier (`orders:live`) is refused with an
`InvalidParameterValueException` rather than acted on as though the qualifier were absent.

## Triggering a function from an SQS queue

An event source mapping polls a [simulated queue](https://yulinsim.dev/services/sqs/ "Simulated SQS docs") and invokes the function
with an SQS `Records` event.

Polling runs on the simulation's background scheduler. A test awaits
`simAws.backgroundTasksComplete()` and then asserts, without sleeping.

`BatchSize` says how many messages one invocation may be given, and defaults to 10. The queue and
the function have to be in the same account and region, as they do on real AWS.

```typescript sim-lambda-sqs-event-source
/**
 * Delivering messages from a simulated queue to a simulated function.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import { CreateQueueCommand, SendMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";
import {
  makeLambdaZipFileInput,
  type SimLambdaSqsEvent,
} from "@kensio/yulin/lambda";

const simAws = new SimAws();
const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:orders`;

const { QueueUrl } = await simAws
  .sqs()
  .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

// The execution role needs the three SQS actions Lambda polls a queue with.
const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrderConsumerRole",
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
    RoleName: "OrderConsumerRole",
    PolicyName: "ConsumeOrders",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
        ],
        Resource: queueArn,
      },
    }),
  }),
);

const consumed: string[] = [];

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "order-consumer",
    Role: role.Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimLambdaSqsEvent) => {
        for (const record of event.Records) {
          consumed.push(record.body);
        }
      }),
    },
  }),
);

await simAws.lambda().createEventSourceMapping(
  new CreateEventSourceMappingCommand({
    EventSourceArn: queueArn,
    FunctionName: "order-consumer",
    BatchSize: 5,
  }),
);

await simAws
  .sqs()
  .sendMessage(new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }));

// Delivery happens in the background, so wait for the simulation to settle.
await simAws.backgroundTasksComplete();

console.log(consumed); // ["order-1"]
```

Each record carries `messageId`, `receiptHandle`, `body`, `md5OfBody`, `messageAttributes`,
`eventSource`, `eventSourceARN`, `awsRegion`, and the `attributes` map holding `SentTimestamp`,
`ApproximateReceiveCount` and `ApproximateFirstReceiveTimestamp`. `SimLambdaSqsEvent` and
`SimLambdaSqsEventRecord` are exported from `@kensio/yulin/lambda` for typing a handler, and are
minimal structural equivalents of the `SQSEvent` and `SQSRecord` types from the `aws-lambda` typings
package, and a handler already written against those can be passed in unchanged. `SenderId` is left
out, because a simulated caller has no user or role id to report it as.

Creating the mapping checks the two things real Lambda checks. The queue has to exist, and the
function's execution role has to be allowed `sqs:ReceiveMessage`, `sqs:DeleteMessage` and
`sqs:GetQueueAttributes` on it. A role missing one of them fails with
`InvalidParameterValueException` naming the operation, before the mapping exists.

`GetEventSourceMappingCommand`, `ListEventSourceMappingsCommand` and
`DeleteEventSourceMappingCommand` read and remove mappings. A mapping is `Creating` when the command
returns and `Enabled` once the simulation has caught up, as on real Lambda. Deleting it stops the
polling.

### Mapping onto a version or an alias

A `FunctionName` can carry a version number or an alias name on the end, or be a qualified function
ARN, and batches then go to the version that qualifier names. `FunctionArn` on the mapping is the
alias, and the version behind it is what runs:

```typescript sim-lambda-event-source-alias
/**
 * An event source mapping onto an alias, polling for the version it points at.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateAliasCommand,
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";
import { CreateQueueCommand, SendMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();
const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:orders`;

const { QueueUrl } = await simAws
  .sqs()
  .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrderConsumerRole",
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
    RoleName: "OrderConsumerRole",
    PolicyName: "ConsumeOrders",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
        ],
        Resource: queueArn,
      },
    }),
  }),
);

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "order-consumer",
    Role: role.Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput((_event, context) => {
        console.log(context.functionVersion); // "1", the version behind `live`

        return "handled";
      }),
    },
  }),
);

const published = await lambda.publishVersion(
  new PublishVersionCommand({ FunctionName: "order-consumer" }),
);

await lambda.createAlias(
  new CreateAliasCommand({
    FunctionName: "order-consumer",
    Name: "live",
    FunctionVersion: published.Version,
  }),
);

const mapping = await lambda.createEventSourceMapping(
  new CreateEventSourceMappingCommand({
    EventSourceArn: queueArn,
    FunctionName: "order-consumer:live",
  }),
);

console.log(mapping.FunctionArn); // ...:function:order-consumer:live

await simAws
  .sqs()
  .sendMessage(new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }));
await simAws.backgroundTasksComplete();
```

The qualifier is resolved on every poll, so `UpdateAlias` moves what an existing mapping delivers to.
The version has to be there when the mapping is made. A qualifier naming none fails with
`ResourceNotFoundException`, the way a function that is not there does. Polling still runs as the
function's execution role, which a published version carries over from the function it was published
from.

### When the handler fails

A successful handler deletes the batch from the queue. When the handler throws, every message stays
in flight until its visibility timeout expires, then becomes available for another delivery. Advance
the simulated clock to reach that retry:

```typescript
await simAws.clock().advanceBy({ seconds: 31 });
```

A queue with a `RedrivePolicy` eventually gives up on a message the handler keeps throwing on and
moves it to the dead-letter queue, exactly as it would for any other failing consumer. See
[dead-letter queues](https://yulinsim.dev/services/sqs/#dead-letter-queues "Simulated SQS dead-letter queue docs").

The handler error itself goes unreported to whoever sent the message, as it does on real AWS. What
the sender sees is the message coming back.

### Reporting individual message failures

A queue mapping with `FunctionResponseTypes: ["ReportBatchItemFailures"]` reads the handler's
`batchItemFailures`. Named message IDs return to the queue and the remaining messages are deleted.

```typescript
await simAws.lambda().createEventSourceMapping(
  new CreateEventSourceMappingCommand({
    EventSourceArn: queueArn,
    FunctionName: "order-consumer",
    FunctionResponseTypes: ["ReportBatchItemFailures"],
  }),
);

// The handler reports the message ids it could not handle.
const handler = (event: SimLambdaSqsEvent) => ({
  batchItemFailures: event.Records.filter((record) => !canHandle(record)).map(
    (record) => ({ itemIdentifier: record.messageId }),
  ),
});
```

A report naming an id that was not in the batch returns the whole batch, as real Lambda does with a
report it cannot trust. So does an entry with no `itemIdentifier`. A handler that returns no list,
or an empty `batchItemFailures` list, has handled the whole batch.

### Making an SQS event without a queue

Use `lambdaSqsEventFactory` and `lambdaSqsEventRecordFactory` to call an SQS handler without creating
a queue or event source mapping:

```typescript sim-lambda-sqs-event-factory
/**
 * Making an SQS event to call a handler with.
 */

import {
  lambdaSqsEventFactory,
  lambdaSqsEventRecordFactory,
  type SimLambdaSqsEvent,
} from "@kensio/yulin/lambda";

function ordersHandler(event: SimLambdaSqsEvent): readonly string[] {
  return event.Records.map(
    (record) => (JSON.parse(record.body) as { orderId: string }).orderId,
  );
}

const batch = lambdaSqsEventFactory.make({
  Records: [{ body: '{"orderId":"YL-1"}' }, { body: '{"orderId":"YL-2"}' }],
});

// [ 'YL-1', 'YL-2' ]
console.log(ordersHandler(batch));

// The record factory makes one on its own, for a test about a single message.
const record = lambdaSqsEventRecordFactory.make({
  body: '{"orderId":"YL-9"}',
  eventSourceARN: "arn:aws:sqs:eu-west-2:888888888888:orders",
});

// eu-west-2
console.log(record.awsRegion);
```

The default is the single-message batch a quiet queue delivers. Each record is completed as a
delivered one is, including the message id, the receipt handle and the three system `attributes` a
simulated mapping reports. Two fields a record repeats are computed from the rest. `md5OfBody` is
the digest of the body given, which a handler checking the digest compares against, and `awsRegion`
is the Region of the queue ARN given.

Reporting individual failures can be tested against a made event too. The handler's
`batchItemFailures` name `messageId` values, and those are the ids of the records the factory made.

### Event source mappings in templates

`AWS::Lambda::EventSourceMapping` deploys the same thing, and CDK's
`fn.addEventSource(new SqsEventSource(queue))` emits one. `EventSourceArn` and `FunctionName` accept the
`Fn::GetAtt` and `Ref` values a template gives them, `Ref` on the mapping returns its UUID, and
`Fn::GetAtt` exposes `Id` and `EventSourceMappingArn`. A queue mapping has no `StartingPosition`, and
a template naming one is refused. The same Resource deploys a
[stream mapping](#stream-mappings-in-templates), which has to have one.

`Tags` is the one property recorded rather than refused. A template's tags are usually the whole
stack's (a CDK app calling `Tags.of(app).add(...)` tags every mapping in it), and a mapping delivers
the same records whether it carries them or not. The deploy stands and nothing reads them back.

## Triggering a function from a DynamoDB stream

An event source mapping can also poll a
[simulated DynamoDB stream](https://yulinsim.dev/services/dynamodb/#capturing-changes-with-a-stream "Simulated DynamoDB streams docs").
Table changes reach the handler as a DynamoDB `Records` event.

`StartingPosition` is required for a stream and is `TRIM_HORIZON` or `LATEST`. `TRIM_HORIZON` reads
what the stream still holds, so changes made before the mapping existed are delivered too. `LATEST`
reads only what the table changes from the moment the mapping starts reading. `AT_TIMESTAMP` is for
[a Kinesis stream](#triggering-a-function-from-a-kinesis-stream) and is refused by name here.

`BatchSize` says how many records one invocation may be given, and defaults to 100, the number
CDK's `DynamoEventSource` also asks for. The table and the function have to be in the same account
and region, as they do on real AWS.

```typescript sim-lambda-dynamodb-stream-event-source
/**
 * Delivering a simulated table's changes to a simulated function.
 */

import {
  CreateTableCommand,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import {
  makeLambdaZipFileInput,
  type SimLambdaDynamoDbStreamEvent,
} from "@kensio/yulin/lambda";

const simAws = new SimAws();

const { TableDescription } = await simAws.dynamoDb().createTable(
  new CreateTableCommand({
    TableName: "orders",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: "NEW_AND_OLD_IMAGES",
    },
  }),
);

const streamArn = TableDescription?.LatestStreamArn;

// The projection goes into a second table. A function writing back into the
// table whose stream invoked it would be delivered its own writes, which the
// simulator refuses rather than looping on.
await simAws.dynamoDb().createTable(
  new CreateTableCommand({
    TableName: "order-totals",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);

// The execution role needs the three stream actions Lambda reads a stream
// with, plus ListStreams, which is on every stream rather than on one, and
// whatever the function itself does.
const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrderProjectorRole",
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
    RoleName: "OrderProjectorRole",
    PolicyName: "ProjectOrders",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "dynamodb:DescribeStream",
            "dynamodb:GetRecords",
            "dynamodb:GetShardIterator",
          ],
          Resource: streamArn,
        },
        { Effect: "Allow", Action: "dynamodb:ListStreams", Resource: "*" },
        {
          Effect: "Allow",
          Action: "dynamodb:PutItem",
          Resource: `arn:aws:dynamodb:${simAws.defaultRegionName}:${simAws.defaultAccountId}:table/order-totals`,
        },
      ],
    }),
  }),
);

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "order-projector",
    Role: role.Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput(
        async (event: SimLambdaDynamoDbStreamEvent) => {
          await Promise.all(
            event.Records.map(async (record) =>
              simAws.dynamoDb().putItem(
                new PutItemCommand({
                  TableName: "order-totals",
                  Item: {
                    orderId: { S: record.dynamodb.Keys?.["orderId"]?.S ?? "" },
                    total: { N: record.dynamodb.NewImage?.["total"]?.N ?? "0" },
                  },
                }),
              ),
            ),
          );
        },
      ),
    },
  }),
);

await simAws.lambda().createEventSourceMapping(
  new CreateEventSourceMappingCommand({
    EventSourceArn: streamArn,
    FunctionName: "order-projector",
    StartingPosition: "TRIM_HORIZON",
  }),
);

await simAws.dynamoDb().putItem(
  new PutItemCommand({
    TableName: "orders",
    Item: { orderId: { S: "order-1" }, total: { N: "42" } },
  }),
);

// Delivery happens in the background, so wait for the simulation to settle.
await simAws.backgroundTasksComplete();

const projected = await simAws.dynamoDb().getItem(
  new GetItemCommand({
    TableName: "order-totals",
    Key: { orderId: { S: "order-1" } },
  }),
);

console.log(projected.Item?.["total"]?.N); // "42"
```

Each record carries `eventID`, `eventName`, `eventVersion`, `eventSource`, `awsRegion`,
`eventSourceARN` and a `dynamodb` body holding `Keys`, the images the stream's view type selects,
`SequenceNumber`, `SizeBytes`, `StreamViewType` and `ApproximateCreationDateTime` as whole seconds
since the epoch. A time to live removal also carries
`userIdentity: { type: "Service", principalId: "dynamodb.amazonaws.com" }`. A handler tells an
expiry from a deletion the application asked for by that. The event lower-cases those two fields
where [the Streams API capitalizes them](https://yulinsim.dev/services/dynamodb/#reading-a-streams-records "Simulated DynamoDB Streams docs").

`SimLambdaDynamoDbStreamEvent` and `SimLambdaDynamoDbStreamEventRecord` are exported from
`@kensio/yulin/lambda` for typing a handler, and are minimal structural equivalents of the
`DynamoDBStreamEvent` and `DynamoDBRecord` types from the `aws-lambda` typings package.

A binary attribute reaches the handler as a base64 string, as it does on AWS. The event arrives as
JSON, and JSON has no bytes. `Buffer.from(value.B, "base64")`
therefore reads the same here as it does deployed. The
[Streams API](https://yulinsim.dev/services/dynamodb/#reading-a-streams-records "Simulated DynamoDB Streams docs") hands out
bytes for the same attribute, because its client decodes them. Nesting makes no difference, and
binary inside a list or a map is encoded too.

Creating the mapping checks what real Lambda checks. The stream has to exist, and the function's
execution role has to be allowed `dynamodb:DescribeStream`, `dynamodb:GetRecords` and
`dynamodb:GetShardIterator` on it, plus `dynamodb:ListStreams` on `*`. Those four are what both the
AWS managed policy and CDK's own grant give a stream consumer. A role missing one of them fails with
`InvalidParameterValueException` naming the operation.

### When the handler fails

A stream behaves differently from a queue here. A queue hands a message out and hides it, and a
batch the handler threw on becomes the queue's problem afterwards. A stream hands out a place, and
the mapping is the only thing that remembers it. A batch the handler threw on is read again from
exactly where it was, and everything behind it waits until it is through. That is what blocking a
shard means.

Advancing the simulation's clock is what hands the batch over again:

```typescript
await simAws.clock().advanceBy({ seconds: 30 });
```

A mapping that asks for no limit of its own delivers the batch again five times, after 1, 2, 4, 8
and 16 seconds, so six deliveries in all. Then it is discarded and the mapping carries on with the
stream, as AWS does once a stream mapping's error handling has run out.

The delays are a simulator constraint. AWS documents no delay between attempts. A delay of zero here
would fall due at the instant the clock already reads, and a handler that always throws would leave
`advanceBy` with work falling due forever. The growing delay is also what lets a test walk through
the attempts by advancing the clock.

The five attempts are a cap on a mapping that named neither of the limits below. AWS retries until
the records age out of the stream, a day later, and waiting out a simulated day is the same hang
with more steps.

### Limiting the retries and the record age

`MaximumRetryAttempts` and `MaximumRecordAgeInSeconds` govern the same failed-batch lifecycle, and a
stream mapping keeps both. `MaximumRetryAttempts: 0` makes one delivery and no retries, and a
positive value allows that many retries after the first delivery. `MaximumRecordAgeInSeconds`
discards expired records before each invocation, including the first poll. Lambda's `-1` means no limit
(that is what a mapping naming neither reports back).

```typescript sim-lambda-stream-retry-limits
/**
 * Giving up on a stream batch once its retries have run out.
 */

import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import {
  makeLambdaZipFileInput,
  type SimLambdaDynamoDbStreamEvent,
} from "@kensio/yulin/lambda";

const simAws = new SimAws();

const { TableDescription } = await simAws.dynamoDb().createTable(
  new CreateTableCommand({
    TableName: "orders",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: "NEW_AND_OLD_IMAGES",
    },
  }),
);

const streamArn = TableDescription?.LatestStreamArn;

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrderProjectorRole",
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
    RoleName: "OrderProjectorRole",
    PolicyName: "ReadOrdersStream",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "dynamodb:DescribeStream",
            "dynamodb:GetRecords",
            "dynamodb:GetShardIterator",
          ],
          Resource: streamArn,
        },
        { Effect: "Allow", Action: "dynamodb:ListStreams", Resource: "*" },
      ],
    }),
  }),
);

// The handler never gets through the batch, so the retries are what decide
// how many times it is given one.
const deliveries: SimLambdaDynamoDbStreamEvent[] = [];

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "order-projector",
    Role: role.Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput(
        (event: SimLambdaDynamoDbStreamEvent): undefined => {
          deliveries.push(event);

          throw new Error("Projector could not handle the batch");
        },
      ),
    },
  }),
);

await simAws.lambda().createEventSourceMapping(
  new CreateEventSourceMappingCommand({
    EventSourceArn: streamArn,
    FunctionName: "order-projector",
    StartingPosition: "TRIM_HORIZON",
    MaximumRetryAttempts: 2,
    MaximumRecordAgeInSeconds: 120,
  }),
);

await simAws.dynamoDb().putItem(
  new PutItemCommand({
    TableName: "orders",
    Item: { orderId: { S: "order-1" }, total: { N: "42" } },
  }),
);

await simAws.backgroundTasksComplete();

// The two retries fall due 1 and 2 seconds after the deliveries they follow.
await simAws.clock().advanceBy({ seconds: 30 });

console.log(deliveries.length); // 3
```

Records age out of the front of a batch, since a batch is in stream order. A batch whose oldest
records are past the age goes over again from the first record that is still young enough, and the
shard keeps moving. A batch that has had its retries, or whose records have all aged out, is
discarded, and the mapping reads on from behind it.

`GetEventSourceMapping` and `ListEventSourceMappings` report both values, and
`AWS::Lambda::EventSourceMapping` takes both in a template. A value outside Lambda's range (`-1` to
10,000 retries, `-1` to 604,800 seconds) is a `ValidationException`. A queue mapping takes neither,
because a message the handler never takes is left to the queue's own redrive policy.

### Splitting a failed batch around the record that broke it

`BisectBatchOnFunctionError` splits a batch the handler threw on in half, and delivers each half as
its own batch. A half that fails is split again, down to a single record. That is how the records
beside a poison record get through, and how the poison record ends up delivered on its own and
discarded on its own.

```json
{
  "StartingPosition": "TRIM_HORIZON",
  "BatchSize": 100,
  "MaximumRetryAttempts": 10,
  "BisectBatchOnFunctionError": true
}
```

A batch of four whose third record the handler cannot take is delivered as `1, 2, 3, 4`, then
`1, 2`, then `3, 4`, then `3` on its own, and finally `4`. The record that broke every batch it was
in leaves the mapping under the retry and record-age limits, and reaches the
[failure destination](#sending-discarded-stream-batches-to-a-destination) naming one record rather
than four.

Splitting puts the retry count back to the start, so a batch always reaches a single record before
the count decides anything. Once it is down to one record, the limits count as they do for any other
failing batch. A batch the handler reported partial failures on is left whole, because the report
already says which record to go back to. The limit is dropped as soon as a batch goes through, so
the rest of a split batch is read at the mapping's own batch size again.

`GetEventSourceMapping` and `ListEventSourceMappings` report the setting, and
`AWS::Lambda::EventSourceMapping` takes it in a template. Both stream sources have it. A queue
mapping is refused for naming it, the way real Lambda refuses one.

### Sending discarded stream batches to a destination

DynamoDB Streams and Kinesis mappings accept `DestinationConfig.OnFailure` with a standard SQS
queue or SNS topic ARN. Supply it to `CreateEventSourceMapping` or the
`AWS::Lambda::EventSourceMapping` resource alongside the retry and record-age limits:

```json
{
  "MaximumRetryAttempts": 10,
  "MaximumRecordAgeInSeconds": 3600,
  "DestinationConfig": {
    "OnFailure": {
      "Destination": "arn:aws:sqs:eu-west-2:111111111111:stream-failures"
    }
  }
}
```

CDK's `DynamoEventSource` and `KinesisEventSource` accept `onFailure: new SqsDlq(queue)` or
`onFailure: new SnsDlq(topic)`. Their synthesized destination configuration is passed through to
the simulated mapping. Create, Get, List and Delete responses preserve that configuration.

The function's execution role needs `sqs:SendMessage` on the queue or `sns:Publish` on the topic.
Delivery goes through the simulated destination service, so its IAM checks and SNS subscriptions
apply. An IAM denial or a missing destination rejects `backgroundTasksComplete()` or the clock
advance that exhausted the batch. The discarded records have already advanced the checkpoint.
Yulin attempts destination delivery once and does not retry a failed send.

The JSON message follows the AWS
[DynamoDB Streams](https://docs.aws.amazon.com/lambda/latest/dg/services-dynamodb-errors.html) and
[Kinesis](https://docs.aws.amazon.com/lambda/latest/dg/kinesis-on-failure-destination.html)
notification formats. Import `SimLambdaStreamFailureRecord` from `@kensio/yulin/lambda` to type it.

- `version` is `"1.0"` and `timestamp` is the simulated discard time in ISO 8601 format.
- `requestContext` contains a generated `requestId`, the mapping's `functionArn`,
  `approximateInvokeCount`, and either `RetryAttemptsExhausted` or `RecordAgeExceeded` as `condition`.
- `responseContext` reports `statusCode: 200` and `executedVersion`. A handler error adds
  `functionError: "Unhandled"`. A valid partial-batch failure response leaves that field out.
  Records discarded before any invocation omit `responseContext`.
- `DDBStreamBatchInfo` or `KinesisBatchInfo` identifies the stream ARN, shard ID, first and last
  sequence numbers, first and last arrival times, and batch size. Arrival times are ISO 8601 strings.

The original record payloads are absent. A successful batch produces no notification. After a
partial-batch response, the notification covers the discarded suffix starting at the failed
checkpoint. When only an older prefix expires, its notification excludes the younger records.
Records already expired on their first poll report zero invocations. Request IDs are generated for
the notification and are not correlated with the handler's invocation context.

S3 destinations, FIFO queues or topics, and `OnSuccess` are refused. SQS source mappings cannot
have this destination configuration. The simulator's existing five-retry cap for mappings with
neither limit also produces a failure notification when it discards a batch.

### Reporting individual record failures

A stream mapping with `FunctionResponseTypes: ["ReportBatchItemFailures"]` reads the handler's
`batchItemFailures`. Each item identifies a record by `SequenceNumber`:

```typescript
await simAws.lambda().createEventSourceMapping(
  new CreateEventSourceMappingCommand({
    EventSourceArn: streamArn,
    FunctionName: "order-projector",
    StartingPosition: "TRIM_HORIZON",
    FunctionResponseTypes: ["ReportBatchItemFailures"],
  }),
);

// The handler reports the sequence numbers it could not handle.
const handler = (event: SimLambdaDynamoDbStreamEvent) => ({
  batchItemFailures: event.Records.filter((record) => !canHandle(record)).map(
    (record) => ({ itemIdentifier: record.dynamodb.SequenceNumber }),
  ),
});
```

A stream reads that report differently from a queue. A queue takes back the messages the report
names and deletes the rest. A stream moves its checkpoint to the lowest sequence
number the report names and delivers everything from there again, including the records after it
that the handler did handle. That is real AWS behaviour rather than a simulation artifact, and it is
why a stream consumer has to be idempotent.

So a report naming only the last record of a batch delivers that record again. A report naming the
first record delivers the whole batch again. The redelivery is a retry like any other. It waits out
the same backoff, counts against the same retries, and what is left is discarded when they run
out.

A report naming a sequence number that was not in the batch delivers the whole batch again, as real
Lambda does with a report it cannot trust. So does an entry with no `itemIdentifier`. A handler that
returns no list, or an empty `batchItemFailures` list, has handled the whole batch. A mapping
created without `FunctionResponseTypes` ignores a report entirely.

### Writing back to the source table

A handler that writes into the table whose stream invoked it is delivered its own write, which
writes again. Real Lambda runs that loop for as long as the account is willing to pay for it. The
simulation refuses instead, with an error naming the function, the stream and the table, before the
test times out.

The write itself succeeds. The refusal comes afterwards, from whatever is waiting for the simulation
to settle:

```typescript
await simAws.backgroundTasksComplete(); // throws SimLambdaStreamCascadeError
```

Only the handler's own writes count. Items written at the same time by the test, or by anything else
in the simulation, are an ordinary batch however many of them there are, because the guard tells them
apart by where the write came from, and never by when it landed.

Writing the projection into a second table is what the guard is asking for, and is what a real
aggregation or search index does anyway.

### Making a stream event without a table

`lambdaDynamoDbStreamEventFactory` and `lambdaDynamoDbStreamEventRecordFactory` make the same events
for a test that calls the handler directly, with no table and no mapping:

```typescript sim-lambda-dynamodb-stream-event-factory
/**
 * Making a DynamoDB stream event to call a handler with.
 */

import {
  lambdaDynamoDbStreamEventFactory,
  type SimLambdaDynamoDbStreamEvent,
} from "@kensio/yulin/lambda";

function shippedOrders(event: SimLambdaDynamoDbStreamEvent): readonly string[] {
  return event.Records.filter(
    (record) => record.dynamodb.NewImage?.["status"]?.S === "shipped",
  ).map((record) => record.dynamodb.Keys?.["orderId"]?.S ?? "");
}

const event = lambdaDynamoDbStreamEventFactory.make({
  Records: [
    {
      eventName: "MODIFY",
      dynamodb: {
        Keys: { orderId: { S: "YL-1" } },
        OldImage: { orderId: { S: "YL-1" }, status: { S: "placed" } },
        NewImage: { orderId: { S: "YL-1" }, status: { S: "shipped" } },
      },
    },
    { eventName: "INSERT" },
  ],
});

// [ 'YL-1' ]
console.log(shippedOrders(event));

// NEW_AND_OLD_IMAGES, because that is what this record carries
console.log(event.Records[0]?.dynamodb.StreamViewType);
```

The default is the single-record batch one changed item produces. What a record says in more than
one place is computed from the rest, and the result is a record a stream could have delivered. An
`INSERT` carries a new image, a `REMOVE` an old one and a `MODIFY` both, `StreamViewType` names the
images
the record actually carries, and `awsRegion` is the Region of the stream ARN given. A record for a
`KEYS_ONLY` stream is one with the images explicitly taken away, as in
`make({ dynamodb: { NewImage: undefined, OldImage: undefined } })`.

`SizeBytes` is a plausible default, and measures nothing about the images given. A test asserting
on it should say what it expects.

### Stream mappings in templates

`AWS::Lambda::EventSourceMapping` deploys a stream mapping too. `EventSourceArn` takes the
`Fn::GetAtt … StreamArn` of a
[streamed table](https://yulinsim.dev/services/dynamodb/#deploying-a-table-with-a-stream "Simulated DynamoDB table stream in CloudFormation docs")
in the same template. That reference is also what makes the mapping wait for the table.
`StartingPosition` is required, as it is for an SDK caller, and the properties go to
`CreateEventSourceMapping` unjudged. A template that gets one wrong is refused in the words the
command refuses it in.

```typescript sim-lambda-cloudformation-dynamodb-event-source
/**
 * Deploying a table's stream, a function, and the mapping between them.
 */

import { PutItemCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";
import type { SimLambdaDynamoDbStreamEvent } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const projected: string[] = [];

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrdersTable: {
        Type: "AWS::DynamoDB::Table",
        Properties: {
          TableName: "orders",
          KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
          AttributeDefinitions: [
            { AttributeName: "orderId", AttributeType: "S" },
          ],
          BillingMode: "PAY_PER_REQUEST",
          StreamSpecification: { StreamViewType: "NEW_AND_OLD_IMAGES" },
        },
      },
      ProjectorRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "OrderProjectorRole",
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
          Policies: [
            {
              PolicyName: "ReadOrdersStream",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: [
                      "dynamodb:DescribeStream",
                      "dynamodb:GetRecords",
                      "dynamodb:GetShardIterator",
                    ],
                    Resource: { "Fn::GetAtt": ["OrdersTable", "StreamArn"] },
                  },
                  {
                    Effect: "Allow",
                    Action: "dynamodb:ListStreams",
                    Resource: "*",
                  },
                ],
              },
            },
          ],
        },
      },
      ProjectorFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "order-projector",
          Role: { "Fn::GetAtt": ["ProjectorRole", "Arn"] },
        },
      },
      OrderProjectorMapping: {
        Type: "AWS::Lambda::EventSourceMapping",
        Properties: {
          EventSourceArn: { "Fn::GetAtt": ["OrdersTable", "StreamArn"] },
          FunctionName: { Ref: "ProjectorFunction" },
          BatchSize: 100,
          StartingPosition: "TRIM_HORIZON",
        },
      },
    },
  },
  bindings: [
    {
      logicalId: "ProjectorFunction",
      handler: (event: SimLambdaDynamoDbStreamEvent): void => {
        for (const record of event.Records) {
          projected.push(record.dynamodb.Keys?.["orderId"]?.S ?? "");
        }
      },
    },
  ],
});
await stack.waitForDeployComplete();

await simAws.dynamoDb().putItem(
  new PutItemCommand({
    TableName: "orders",
    Item: { orderId: { S: "order-1" }, total: { N: "101" } },
  }),
);
await simAws.backgroundTasksComplete();

console.log(projected); // ["order-1"]
```

CDK's `fn.addEventSource(new DynamoEventSource(table, { startingPosition }))` synthesises exactly
this, and deploys without hand-editing. The grant CDK writes alongside it is an inline policy with
the three stream actions on the stream ARN and `dynamodb:ListStreams` on every stream, exactly what
the mapping's execution-role check is looking for.

`bisectBatchOnError` is simulated, and is covered under
[Splitting a failed batch around the record that broke it](#splitting-a-failed-batch-around-the-record-that-broke-it).
The other properties a non-default `DynamoEventSource` adds are recorded rather than acted on. Those
are `FilterCriteria`, `ParallelizationFactor` and `TumblingWindowInSeconds`.
The mapping deploys, delivers every record whole and unfiltered, and each property it was created
without is listed in
[`stack.ignoredProperties`](https://yulinsim.dev/services/cloudformation/#properties-a-resource-was-created-without "Properties a Resource was created without")
with what the mapping does in its place. `CreateEventSourceMapping` still refuses the same
properties, since a caller naming one is asking for behaviour by hand.

A hand-written template or a SAM application usually gives the function the AWS managed policy
`AWSLambdaDynamoDBExecutionRole` instead. Simulated IAM has no model for managed policy ARNs, so
that role reaches the mapping with no stream permissions and the mapping is refused when it is
created.
Write the grant as an inline policy, as the example above and CDK both do.

## Triggering a function from a Kinesis stream

An event source mapping can poll a
[simulated Kinesis stream](https://yulinsim.dev/services/kinesis/ "Simulated Kinesis Data Streams docs") and invoke the function
with a Kinesis `Records` event.

Yulin reads every shard in a Kinesis stream. Each shard tracks its own iterator, delivers its own
batches and backs off independently after a failure. An invocation receives records from one shard.
Use one partition key when the handler requires ordered records.

`StartingPosition` is required for a stream. A Kinesis stream takes all three positions.
`TRIM_HORIZON` reads what the stream still holds, `LATEST` reads only what arrives from the moment
the mapping starts reading, and `AT_TIMESTAMP` reads from the instant `StartingPositionTimestamp`
names.

`BatchSize` says how many records one invocation may be given, and defaults to 100, the number CDK's
`KinesisEventSource` also asks for. The stream and the function have to be in the same account and
region, as they do on real AWS.

```typescript sim-lambda-kinesis-event-source
/**
 * Delivering a simulated Kinesis stream's records to a simulated function.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateStreamCommand, PutRecordCommand } from "@aws-sdk/client-kinesis";
import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import {
  makeLambdaZipFileInput,
  type SimLambdaKinesisStreamEvent,
} from "@kensio/yulin/lambda";

const simAws = new SimAws();

await simAws
  .kinesis()
  .createStream(new CreateStreamCommand({ StreamName: "orders" }));

const streamArn = `arn:aws:kinesis:${simAws.defaultRegionName}:${simAws.defaultAccountId}:stream/orders`;

const { Role } = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrderProjectorRole",
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
    RoleName: "OrderProjectorRole",
    PolicyName: "ReadOrders",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "kinesis:DescribeStream",
            "kinesis:GetRecords",
            "kinesis:GetShardIterator",
          ],
          Resource: streamArn,
        },
        { Effect: "Allow", Action: "kinesis:ListStreams", Resource: "*" },
      ],
    }),
  }),
);

const projected: string[] = [];

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "order-projector",
    Role: Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput(
        (event: SimLambdaKinesisStreamEvent): void => {
          for (const record of event.Records) {
            // The payload arrives base64 encoded, as it does on AWS.
            projected.push(
              Buffer.from(record.kinesis.data, "base64").toString("utf8"),
            );
          }
        },
      ),
    },
  }),
);

await simAws.lambda().createEventSourceMapping(
  new CreateEventSourceMappingCommand({
    EventSourceArn: streamArn,
    FunctionName: "order-projector",
    StartingPosition: "TRIM_HORIZON",
  }),
);

await simAws.kinesis().putRecord(
  new PutRecordCommand({
    StreamName: "orders",
    PartitionKey: "customer-1",
    Data: new TextEncoder().encode('{"id":"order-1"}'),
  }),
);

// Delivery happens in the background, so wait for the simulation to settle.
await simAws.backgroundTasksComplete();

console.log(projected[0]); // {"id":"order-1"}
```

Each record carries `eventID`, `eventName`, `eventVersion`, `eventSource`, `awsRegion`,
`eventSourceARN`, `invokeIdentityArn` and a `kinesis` body holding `kinesisSchemaVersion`,
`partitionKey`, `sequenceNumber`, `data` and `approximateArrivalTimestamp`. `eventID` is the shard
identifier and the sequence number joined by a colon, so it is unique across the whole stream rather
than within one shard. `invokeIdentityArn` is the execution role the records were read with.

The two translations worth knowing are the payload and the instant. `data` is base64 of the bytes
that were put, because the event is JSON and JSON has no bytes, and `approximateArrivalTimestamp` is
seconds since the epoch where
[the Kinesis API](https://yulinsim.dev/services/kinesis/#putting-a-record-and-reading-it-back "Simulated Kinesis docs") hands
out a `Date`. Both are what a deployed function receives.

`SimLambdaKinesisStreamEvent` and `SimLambdaKinesisStreamEventRecord` are exported from
`@kensio/yulin/lambda` for typing a handler, and are minimal structural equivalents of the
`KinesisStreamEvent` and `KinesisStreamRecord` types from the `aws-lambda` typings package.

Creating the mapping checks what real Lambda checks. The stream has to exist, and the function's
execution role has to be allowed `kinesis:DescribeStream`, `kinesis:GetRecords` and
`kinesis:GetShardIterator` on it, plus `kinesis:ListStreams` on `*`. Those four are what both the
AWS managed policy and CDK's own grant give a stream consumer. A role missing one of them fails with
`InvalidParameterValueException` naming the operation.

`FunctionResponseTypes: ["ReportBatchItemFailures"]` works as it does for a DynamoDB stream. A
handler names a record by its `sequenceNumber`, and the mapping goes back to the lowest one the
report names, so that record and everything after it on that shard is delivered again. A failing
batch blocks its own shard and no other.
[`MaximumRetryAttempts` and `MaximumRecordAgeInSeconds`](#limiting-the-retries-and-the-record-age)
work the same way here, and each shard counts its own attempts.

A mapping naming an enhanced fan-out consumer ARN is refused, since consumers are unsimulated.
`AWS::Lambda::EventSourceMapping` deploys a Kinesis mapping the same way it deploys a DynamoDB one.

## Function URLs

A Function URL is an HTTP endpoint for one function. Creating one with
`CreateFunctionUrlConfigCommand` returns an AWS-shaped endpoint:

```text
https://<url-id>.lambda-url.<region>.on.aws/
```

Serve that URL with `serveSimAws` and application code, a frontend dev server, or curl can make real
HTTP requests to the function, alongside the other simulated services on the same local server. Pass
the Function URL through `srv.localUrl(...)`, which keeps the endpoint's hostname but sends the
request to the local server, in the same way it adapts simulated S3 website and CloudFront URLs.

```typescript sim-lambda-function-url
/**
 * Serving a simulated Lambda Function URL on localhost.
 */

import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import {
  type SimLambdaFunctionUrlEvent,
  makeLambdaZipFileInput,
} from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "greeter",
    Role: "arn:aws:iam::111111111111:role/GreeterRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimLambdaFunctionUrlEvent) => ({
        statusCode: 200,
        headers: { "content-type": "text/plain" },
        body: `Hello ${event.queryStringParameters?.["name"] ?? "world"}`,
      })),
    },
  }),
);

const urlConfig = await lambda.createFunctionUrlConfig(
  new CreateFunctionUrlConfigCommand({
    FunctionName: "greeter",
    AuthType: "NONE",
  }),
);

// https://<url-id>.lambda-url.us-east-1.on.aws/
console.log(urlConfig.FunctionUrl);

const srv = await serveSimAws({ simAws });

try {
  const response = await fetch(
    srv.localUrl(`${urlConfig.FunctionUrl}greet?name=Yulin`),
  );

  console.log(response.status);
  console.log(await response.text());
} finally {
  await srv.close();
}
```

On localhost the endpoint hostname becomes
`<url-id>.lambda-url.<region>.sim-aws.localhost:<port>`, dropping the `.on.aws` tail the way
simulated S3 endpoints drop `.amazonaws.com`. Requests are routed by that hostname. A Function URL
created in a non-default account or region reaches the right function without any extra
configuration.

### The invocation event and the response

The handler receives the API Gateway HTTP API payload format 2.0 event that real Function URLs
send, the only format they use:

```json
{
  "version": "2.0",
  "routeKey": "$default",
  "rawPath": "/greet",
  "rawQueryString": "name=Yulin",
  "headers": { "host": "...", "user-agent": "..." },
  "queryStringParameters": { "name": "Yulin" },
  "cookies": ["session=abc"],
  "requestContext": {
    "http": { "method": "GET", "path": "/greet", "sourceIp": "127.0.0.1" }
  },
  "isBase64Encoded": false
}
```

Cookies arrive in their own `cookies` field rather than in `headers`, and a request body arrives on
`body` as text or, for binary content types, as base64 with `isBase64Encoded` set.

A handler can answer in either of the two shapes real Lambda accepts:

- a structured response, recognised by its `statusCode`, whose `headers`, `body`, `cookies` (sent
  as `set-cookie` headers) and `isBase64Encoded` control the HTTP response
- any other value, which becomes a `200` JSON response, as in
  `return { greeting: "hello" }`

If the handler throws, the endpoint answers `502` with an AWS-like error document. The handler's
error stays visible to the test, as the thrown error would be through `InvokeCommand`.

### Making an invocation event without a request

A test of the handler on its own, with no endpoint serving it, still has to pass it a whole event.
`lambdaFunctionUrlEventFactory` makes one. Such a test then says what the request was and leaves the
rest to the factory:

```typescript sim-lambda-function-url-event-factory
/**
 * Making a Lambda Function URL invocation event to call a handler with.
 */

import { VariantFactory } from "@kensio/part-factory";

import {
  lambdaFunctionUrlEventFactory,
  type SimLambdaFunctionUrlEvent,
  type SimLambdaFunctionUrlResult,
} from "@kensio/yulin/lambda";

function greeter(event: SimLambdaFunctionUrlEvent): SimLambdaFunctionUrlResult {
  return {
    statusCode: 200,
    headers: { "content-type": "text/plain" },
    body: `Hello ${event.queryStringParameters?.["name"] ?? "world"}`,
  };
}

const event = lambdaFunctionUrlEventFactory.make({
  rawPath: "/greet",
  rawQueryString: "name=Yulin",
});

// Hello Yulin
console.log(greeter(event).body);

// A named variation of a request is a VariantFactory around it, as with any
// other @kensio/part-factory factory.
const formPostFactory = new VariantFactory(lambdaFunctionUrlEventFactory, {
  headers: { "content-type": "application/x-www-form-urlencoded" },
  requestContext: { http: { method: "POST" } },
});

const formPost = formPostFactory.make({
  rawPath: "/subscribe",
  body: "email=someone%40yulin.test",
});

// POST /subscribe
console.log(
  `${formPost.requestContext.http.method} ${formPost.requestContext.http.path}`,
);
```

The defaults describe an anonymous `GET /` to a `NONE` auth Function URL, down to the headers AWS
stamps on a proxied request. A handler reading `host`, `x-forwarded-for` or `x-amzn-trace-id` finds
what it would find on AWS. The fields a Function URL invocation never carries (`pathParameters` and
`stageVariables`) are absent, as they are in a served event.

A real event says several things twice, and the factory computes its defaults from the overrides so
that supplying either copy sets both:

| What the request says | Where the event says it                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| the path              | `rawPath` and `requestContext.http.path`                                                          |
| the query             | `rawQueryString` and the parsed `queryStringParameters`                                           |
| the endpoint          | `requestContext.apiId`, `requestContext.domainPrefix`, `requestContext.domainName`, `host` header |
| the caller            | `requestContext.http.sourceIp` and `userAgent`, the `x-forwarded-for` and `user-agent` headers    |
| the time              | `requestContext.timeEpoch` and the Common Log Format `requestContext.time`                        |

So `make({ rawPath: "/user/status" })` is a request for `/user/status` in both places, and the
request context follows the override. Overriding both copies with different values is still allowed,
for a test that wants an event no real invocation produces.

The same events go to a handler through
[the API Gateway HTTP API](https://yulinsim.dev/services/apigatewayv2/ "Simulated API Gateway HTTP API usage docs") too, where
the route key, the stage and the path parameters are the endpoint's rather than a Function URL's
`$default`. An event for one of those is this factory with those fields overridden.

### Managing a Function URL

`GetFunctionUrlConfigCommand` reads the configuration back, `UpdateFunctionUrlConfigCommand`
changes the `AuthType`, `InvokeMode` or `Cors` while keeping the same endpoint, and
`DeleteFunctionUrlConfigCommand` removes it, after which the hostname stops resolving and returns
`404`. `ListFunctionUrlConfigsCommand` lists what a function has, which is one configuration or
none, since a function has at most one Function URL.

A `Cors` block on an update replaces the whole block the URL was created with. An update that leaves
`Cors` out keeps the block already in place.

### Cross-origin resource sharing

A Function URL created with a `Cors` block sends the CORS headers that block describes on every
response it serves, and answers a browser preflight from the block alone.

```typescript sim-lambda-function-url-cors
/**
 * Serving a simulated Lambda Function URL configured for CORS.
 */

import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "rates",
    Role: "arn:aws:iam::111111111111:role/RatesRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(() => ({
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gbp: 1.27 }),
      })),
    },
  }),
);

const urlConfig = await lambda.createFunctionUrlConfig(
  new CreateFunctionUrlConfigCommand({
    FunctionName: "rates",
    AuthType: "NONE",
    Cors: {
      AllowOrigins: ["https://shop.example.com"],
      AllowMethods: ["GET", "POST"],
      AllowHeaders: ["content-type"],
      ExposeHeaders: ["x-request-id"],
      AllowCredentials: true,
      MaxAge: 600,
    },
  }),
);

const srv = await serveSimAws({ simAws });
const endpoint = srv.localUrl(urlConfig.FunctionUrl);

try {
  const preflight = await fetch(endpoint, {
    method: "OPTIONS",
    headers: {
      origin: "https://shop.example.com",
      "access-control-request-method": "GET",
    },
  });

  // 200 https://shop.example.com GET,POST
  console.log(
    preflight.status,
    preflight.headers.get("access-control-allow-origin"),
    preflight.headers.get("access-control-allow-methods"),
  );

  const response = await fetch(endpoint, {
    headers: { origin: "https://shop.example.com" },
  });

  // {"gbp":1.27} x-request-id
  console.log(
    await response.text(),
    response.headers.get("access-control-expose-headers"),
  );
} finally {
  await srv.close();
}
```

`AllowOrigins` decides what goes in `Access-Control-Allow-Origin`. A list holding `*` allows every
Origin. Any other list is matched against the `Origin` header the request carried, and a request
from an Origin the list does not name gets no `Access-Control-Allow-Origin` header. `AllowMethods`,
`AllowHeaders` and `ExposeHeaders` each go out as one comma-separated header, and an empty list
leaves its header off. `AllowCredentials` sends `Access-Control-Allow-Credentials: true` when it is
set. `MaxAge` sets `Access-Control-Max-Age` in seconds.

A preflight is an `OPTIONS` request carrying both `Origin` and `Access-Control-Request-Method`.
Lambda answers it from the configuration and the function never runs. Every other method reaches the
handler, and the configured headers are added to the response it returned. A handler that sends CORS
headers of its own leaves the response carrying both values, which is what real Lambda serves.
Browsers report the duplicate as an error, so keep CORS on the Function URL and leave it out of the
handler.

An `AWS_IAM` Function URL authorizes a preflight the way it authorizes any other request. A browser
cannot sign the preflight it sends, and an unsigned request to that URL is answered with `403`.

### IAM-authenticated Function URLs

A URL created with `AuthType: "AWS_IAM"` invokes the function only for a caller allowed
`lambda:InvokeFunctionUrl` on the function ARN, and answers `403` otherwise. That is a different
action from `lambda:InvokeFunction`, which the Invoke API uses. Real AWS separates the two so a
policy can grant the HTTP endpoint without granting the SDK operation, and a policy naming only one
of them grants only that one here as well.

The caller comes from the request itself, through either a SigV4 signature or an `x-sim-aws-caller`
header naming a principal directly. A request that offers no caller at all is anonymous, owns no
policies, and is refused. See [callers of HTTP requests](https://yulinsim.dev/services/iam/#callers-of-http-requests) in the IAM docs for how
that resolution works and how to sign a served request.

A grant conditioned on `AWS:SourceArn` or `AWS:SourceAccount` is evaluated against what the request
says it is being made for. That is how a permission granting `cloudfront.amazonaws.com` names one
Distribution. Sim CloudFront states that itself when it reaches a Function URL Origin through an
origin access control, and a Function URL behind a Distribution runs for that Distribution and
refuses everything else. See
[origin access controls](https://yulinsim.dev/services/cloudfront/#origin-access-controls) in the CloudFront docs.

A request declaring what its body hashes to in an `x-amz-content-sha256` header is held to it,
whichever method it used. The header is checked against the bytes that arrived, and a request
declaring `UNSIGNED-PAYLOAD` is refused with `403` and `The request signature we calculated does not
match the signature you provided`, because Lambda supports no unsigned payload. A request that
declares no hash is invoked as before. That is what makes a POST through a CloudFront origin access
control need the viewer's own digest. See
[posting to a Function URL Origin](https://yulinsim.dev/services/cloudfront/#posting-to-a-function-url-origin) in the
CloudFront docs.

CloudFront is the exception to the two actions being separate. A request from
`cloudfront.amazonaws.com` is authorized against `lambda:InvokeFunctionUrl` and
`lambda:InvokeFunction`, and needs a grant for both, exactly what real Lambda asks an origin access
control for. A caller signing its own request still needs only `lambda:InvokeFunctionUrl`.

An `AWS_IAM` invocation carries its caller into the event as `requestContext.authorizer.iam`, the
part a handler reads. The `authorizer` block is absent for a `NONE` invocation, as it is on real
AWS, and `requestContext.accountId` carries the caller's Account, where a `NONE` invocation reports
`anonymous`. The block is
shared with simulated API Gateway HTTP APIs, whose JWT authorizers would fill a `jwt` member
instead, and `iam` is optional on the type.

```typescript sim-lambda-function-url-iam-auth
/**
 * Invoking a simulated Lambda Function URL that requires IAM authentication.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import {
  type SimLambdaFunctionUrlEvent,
  makeLambdaZipFileInput,
} from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const roleArn = "arn:aws:iam::888888888888:role/Reporter";

const created = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "reporter",
    Role: "arn:aws:iam::888888888888:role/ReporterExecutionRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimLambdaFunctionUrlEvent) => ({
        statusCode: 200,
        body: `called by ${event.requestContext.authorizer?.iam?.userArn ?? "nobody"}`,
      })),
    },
  }),
);

const urlConfig = await simAws.lambda().createFunctionUrlConfig(
  new CreateFunctionUrlConfigCommand({
    FunctionName: "reporter",
    AuthType: "AWS_IAM",
  }),
);

// The Role that is allowed to call the endpoint.
await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "Reporter",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::888888888888:root" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "Reporter",
    PolicyName: "InvokeReporterUrl",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "lambda:InvokeFunctionUrl",
        Resource: created.FunctionArn,
      },
    }),
  }),
);

const srv = await serveSimAws({ simAws });

try {
  const url = srv.localUrl(urlConfig.FunctionUrl);

  // Unauthenticated, so anonymous, so refused.
  const refused = await fetch(url);
  console.log(refused.status); // 403

  // Named as the Role that is allowed to invoke.
  const allowed = await fetch(url, {
    headers: { "x-sim-aws-caller": roleArn },
  });

  console.log(allowed.status); // 200
  console.log(await allowed.text()); // called by arn:aws:iam::888888888888:role/Reporter
} finally {
  await srv.close();
}
```

## Resource-based policies

A function's resource-based policy is the other half of Lambda authorization. An identity policy
says what a principal may do, and a resource policy says who may act on the function. Either one is
enough to allow a call within the same Account. A principal from another Account needs both, the
grant on the function and an identity policy in its own Account allowing the action. That is how AWS
decides a cross-Account request. See
[Cross-Account requests](https://yulinsim.dev/services/iam/#cross-account-requests).

`AddPermissionCommand` grants a statement, `RemovePermissionCommand` revokes it by `StatementId`,
and `GetPolicyCommand` returns the assembled document. `AddPermission` is a shorthand. Lambda expands
its parts into one statement, and reading that statement back shows what the grant means:

```typescript sim-lambda-add-permission
/**
 * Granting another Account permission to invoke a simulated Lambda function.
 */

import {
  AddPermissionCommand,
  CreateFunctionCommand,
  GetPolicyCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "greeter",
    Role: "arn:aws:iam::888888888888:role/GreeterRole",
    Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
  }),
);

const added = await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "greeter",
    StatementId: "AllowOtherAccount",
    Action: "lambda:InvokeFunctionUrl",
    Principal: "222222222222",
    FunctionUrlAuthType: "AWS_IAM",
  }),
);

// The statement the shorthand expanded into.
console.log(added.Statement);

const policy = await simAws
  .lambda()
  .getPolicy(new GetPolicyCommand({ FunctionName: "greeter" }));

console.log(policy.Policy);
```

`Principal` takes the same shorthand real Lambda does, and is expanded the same way. A 12-digit
Account id becomes `{"AWS": "arn:aws:iam::<id>:root"}`, an ARN becomes `{"AWS": "<arn>"}`, anything
else is read as a service principal, and `*` stays `*`.

`FunctionUrlAuthType` becomes a `lambda:FunctionUrlAuthType` condition, evaluated when a Function
URL is invoked. That is what a Function URL grant conditions on in practice. A permission granted
for `AWS_IAM` leaves a URL later switched to `NONE` closed.

`SourceArn` becomes an `ArnLike` condition on `AWS:SourceArn`, and `SourceAccount` a `StringEquals`
condition on `AWS:SourceAccount`. Both are evaluated when another simulated service invokes the
function on a resource's behalf, and every simulated service that does so supplies them. That covers
a simulated API Gateway HTTP API invoking it through a Lambda proxy integration or as a `REQUEST`
authorizer, a simulated S3 Bucket delivering an event notification, a simulated SNS topic delivering
a message, a simulated Cognito user pool running a Lambda trigger, and an EventBridge or ELBv2
target. The source ARN is what that service is invoking the function for, and the source Account is
that service's resource's own. See
[Granting the API permission to invoke the function](https://yulinsim.dev/services/apigatewayv2/#granting-the-api-permission-to-invoke-the-function)
and [Lambda triggers](https://yulinsim.dev/services/cognito/#lambda-triggers). A served Function URL request carries a
source ARN when it says what it is being made for, which is how a CloudFront origin access control
reaches one. A direct `Invoke` and an SQS event source mapping supply no value for either, and a
statement carrying one matches no request of theirs.

`PrincipalOrgID` and `InvokedViaFunctionUrl` are written into the statement so `GetPolicy` reports
the grant that was made. No value is supplied for them at request time, and a statement carrying one
of those never matches.

All three commands take a `Qualifier` naming a published version or an alias, and each qualified
resource holds its own policy. See
[Versions and aliases](#versions-and-aliases) for what a grant on one covers.

A function with no grant on it has no policy at all. `GetPolicy` reports that as a
`ResourceNotFoundException`, and never as an empty document. Granting a `StatementId` that is
already in use is a `ResourceConflictException`, and removing one that was never granted is a
`ResourceNotFoundException`, as on AWS.

### Permissions in templates

`AWS::Lambda::Permission` creates the same permission from a CloudFormation template, which matters
because CDK emits one for every `grantInvoke` and `grantInvokeUrl` to a principal outside the
stack's own Account. The Resource has no `StatementId` property. CloudFormation names the statement
after the logical ID, and so does this.

```json
{
  "AllowOtherAccount": {
    "Type": "AWS::Lambda::Permission",
    "Properties": {
      "FunctionName": { "Ref": "GreeterFunction" },
      "Action": "lambda:InvokeFunctionUrl",
      "Principal": "222222222222",
      "FunctionUrlAuthType": "AWS_IAM"
    }
  }
}
```

`FunctionName` accepts either a `Ref` to the function, giving its name, or an `Fn::GetAtt` on it,
giving the ARN. A synthesized CDK app deploys either way with no special casing.

A `FunctionName` carrying a version number or an alias name grants on that qualified resource, and
the statement's `Resource` is the qualified ARN. This is how CDK writes `grantInvoke` on a
`lambda.Alias`, and a grant made that way admits a call through the alias while `$LATEST` keeps a
policy of its own. See [versions and aliases](#versions-and-aliases).

## Environment variables

A function can declare its own environment variables with `Environment.Variables`, as on real
Lambda. While the function runs, its code reads those variables from `process.env`, alongside the
AWS-provided runtime variables (`AWS_REGION`, `AWS_LAMBDA_FUNCTION_NAME`, and the rest). Those
include placeholder execution role credentials in `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and
`AWS_SESSION_TOKEN`, where an AWS SDK in the function code finds credentials, as it does on real
Lambda. Their values authorize nothing. A call from function code is attributed to the execution
Role because the invocation is running as it.

```typescript sim-lambda-environment-variables
/**
 * Giving a simulated Lambda function its own environment variables, read by
 * a real in-process handler function.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "greeter",
    Role: "arn:aws:iam::111111111111:role/GreeterRole",
    Environment: {
      Variables: { GREETING: "Hello", TABLE_NAME: "widgets" },
    },
    Code: {
      ZipFile: makeLambdaZipFileInput((event: { name: string }) => ({
        // Read inside the handler, so this sees the function's own
        // variables rather than the ones the test process happens to have.
        message: `${process.env["GREETING"] ?? "Hi"} ${event.name}`,
        tableName: process.env["TABLE_NAME"],
        region: process.env["AWS_REGION"],
      })),
    },
  }),
);

const invokeOutput = await lambda.invoke(
  new InvokeCommand({
    FunctionName: "greeter",
    Payload: JSON.stringify({ name: "Yulin" }),
  }),
);

if (invokeOutput.Payload === undefined) throw new Error("No invoke Payload");
// {"message":"Hello Yulin","tableName":"widgets","region":"eu-west-2"}
console.log(Buffer.from(invokeOutput.Payload).toString());
```

A function that declares variables gets only those and the AWS-provided ones. Variables that happen
to be set in the process running your tests stay invisible to it, and a function cannot accidentally
pass because your shell or CI environment had the right variable set. Two functions declaring the
same variable name with different values each see their own, including when their invocations
overlap.

The same applies to zip-packaged code in the vm runtime and to functions deployed from an
`AWS::Lambda::Function` template with an `Environment` property, including ones backed by an
[executable binding](#executable-bindings).

A function backed by a real in-process handler and declaring no variables at all is the exception.
It keeps reading the test process's environment, with the AWS-provided variables laid over it, since
that is where such a handler's configuration comes from when nothing declares it. Declaring the
variables on the function keeps the test explicit about where they came from. Zip-packaged code in
the vm runtime gets the function's own variables either way, and never the test process's.

This is also how a function reaches something outside the simulation, such as a Redis or a
Postgres. See [non-AWS dependencies](https://yulinsim.dev/non-aws-dependencies/).

Variable names are validated as on real AWS. A name must match the Lambda name pattern
`[a-zA-Z]([a-zA-Z0-9_])+`, meaning it starts with a letter, is at least two characters, and otherwise
holds letters, digits and underscores. A name breaking that pattern is rejected with
`ValidationException`. The names Lambda reserves for the runtime (`AWS_REGION`,
`AWS_LAMBDA_FUNCTION_NAME`, `LAMBDA_TASK_ROOT` and so on) cannot be declared, and are rejected with
`InvalidParameterValueException`. As on AWS, the pattern is checked first, and a reserved name that
also breaks it, such as `_HANDLER`, is reported as the constraint violation.

### Read environment variables inside the handler

A function backed by a real in-process handler behaves differently here. That handler is an ordinary
function in your test process rather than code loaded into a sandbox. It only gets the function's
own `process.env` while it is actually running.

That means a variable read at module scope is read too early:

```typescript
// Evaluated when your test file imports this module, before any invocation,
// so it sees the test process's environment, not the function's.
const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async () => {
  // Read during the invocation, so this sees the function's own value.
  return { tableName: process.env.TABLE_NAME };
};
```

Moving the read inside the handler fixes it. Zip code in the vm runtime is unaffected, because it is
imported at cold start, during an invocation.

This rarely comes up, because test suites commonly export the same variables they configure their
functions with, and then a module-scope read gets the right value anyway. Sim Lambda warns on the
console in the two situations where the difference changes what your code sees:

- a declared variable whose name the host process also sets, with a different value
- two simulated functions declaring the same variable name with different values

## The time inside a handler

A function runs on its simulation's clock, and so does the function code. `Date.now()` and
`new Date()` inside a handler report simulated time. Freezing the clock gives an invocation a
constant `Date.now()`, and advancing it changes what the next invocation reads.
`context.getRemainingTimeInMillis()` counts down against the same clock. A frozen clock leaves a
handler with a constant budget, where it would otherwise drain in real time.

Zip code gets this from its own vm sandbox. A real in-process handler gets it from a substituted
global `Date` that reports the invocation's clock while an invocation is running and the host clock
otherwise. A time read at module scope is therefore read too early, exactly as it is for environment
variables. See [simulated time](https://yulinsim.dev/time/) for the whole picture, including where real
AWS puts the time on the event.

## Timers and the invocation deadline

A handler's `setTimeout`, `clearTimeout`, `setInterval` and `clearInterval` measure their delays on
the simulation's clock. A handler that sleeps wakes when a test advances time past its delay, and a
frozen clock holds it asleep for as long as the test wants. The timers belong to one invocation. Two
simulations running at once each keep their own, and code outside an invocation keeps the host
timers it already had.

A sleeping handler is released by the clock. A test asks for the invocation and moves time before
waiting on the answer.

```typescript sim-lambda-handler-timers
/**
 * A simulated Lambda handler sleeping on the simulation's clock.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "batcher",
    Role: "arn:aws:iam::111111111111:role/BatcherRole",
    Timeout: 60,
    Code: {
      ZipFile: makeLambdaZipFileInput(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 30_000);
        });

        return "batched";
      }),
    },
  }),
);

// Asked for and left running, because the handler is waiting on the clock.
const invocation = lambda.invoke(
  new InvokeCommand({ FunctionName: "batcher" }),
);

await simAws.clock().advanceBy({ seconds: 30 });

const output = await invocation;
if (output.Payload === undefined) throw new Error("No invoke Payload");
console.log(Buffer.from(output.Payload).toString());
```

An interval runs once for each period an advance covers. Advancing eleven seconds past a two second
interval runs it five times. A delay of zero, or none at all, is due at the instant it was asked
for, and a handler yielding with `setTimeout(resolve, 0)` gets going again without the clock moving.

The function's `Timeout` is a deadline on the same clock. Where it arrives before the handler
answers, the invocation ends in the error the real runtime reports.

```typescript sim-lambda-invocation-timeout
/**
 * A simulated Lambda invocation running out of the time its Timeout allows.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "slowcoach",
    Role: "arn:aws:iam::111111111111:role/SlowcoachRole",
    Timeout: 3,
    Code: {
      ZipFile: makeLambdaZipFileInput(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 60_000);
        });

        return "too late";
      }),
    },
  }),
);

const invocation = lambda.invoke(
  new InvokeCommand({ FunctionName: "slowcoach" }),
);

await simAws.clock().advanceBy({ seconds: 10 });

const output = await invocation;
if (output.Payload === undefined) throw new Error("No invoke Payload");

// Unhandled
console.log(output.FunctionError);

const failure = JSON.parse(Buffer.from(output.Payload).toString()) as {
  errorType: string;
  errorMessage: string;
};

// Sandbox.Timedout
console.log(failure.errorType);
// <deadline instant> <request id> Task timed out after 3.00 seconds
console.log(failure.errorMessage);
```

The log group gets the `ERROR Invoke Error` line the runtime writes, and `AWS/Lambda` counts an
`Errors` datapoint beside the `Invocations`. A handler that answers after its deadline reaches
nobody, and the timers it left running are given up with the rest of the invocation.

For an `Event` invocation a timeout is a failed attempt. It goes to the same
[retries and destinations](#asynchronous-retries-and-destinations) an attempt that threw goes to.

A frozen clock never reaches the deadline. A handler under one runs for as long as the host process
lets it, and `context.getRemainingTimeInMillis()` reports the same budget throughout.

## What an invocation counts in CloudWatch

Every invocation publishes `Invocations` and a `Duration` into `AWS/Lambda`, dimensioned by
`FunctionName`. One whose handler threw publishes an `Errors` beside them. Real Lambda counts a
failed invocation under both, so an alarm reading one against the other gets a failure rate.

Nothing has to be turned on for it, and the execution Role needs no permission, which is how real
Lambda behaves. An alarm on `AWS/Lambda` `Errors` can therefore be driven to a state change by
invoking a function that fails, rather than by publishing a datapoint by hand. `PutMetricData` still
refuses the `AWS/Lambda` namespace, exactly as an account does. See the
[CloudWatch docs](../cloudwatch/README.md) for an alarm reading these.

`Duration` is measured on the simulation's clock. A handler that moves the clock reports the time it
moved, and one that returns without touching it reports nothing spent.

A stream event source mapping publishes `IteratorAge` as well, in milliseconds, once a batch of
DynamoDB Streams or Kinesis records has been handled. It is the distance between the newest record
in the batch and the moment the batch finished, measured on the simulation's clock. A test that lets
records age before anything reads them gets back the interval it let pass. A batch whose handler
threw is counted too, because the retry leaves the function further behind rather than caught up. A
queue mapping publishes none of it, and neither does a direct invocation.

`Throttles` and `ConcurrentExecutions` are absent. Both count what a concurrency limit turned away,
and this simulation applies none.

A function built outside a `SimAws` instance has no simulated CloudWatch to publish into. It runs and
counts nothing.

## CloudFormation functions

Sim CloudFormation can create Lambda functions from `AWS::Lambda::Function`, typically alongside a
same-stack `AWS::IAM::Role` referenced as the execution role. Inline `ZipFile` template source is
packaged and run in the vm runtime, exactly as if it had been zipped and passed to
`CreateFunctionCommand`.

```typescript sim-lambda-cloudformation-function
/**
 * Creating an invokable Lambda function through simulated CloudFormation.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "greeter-stack",
  template: {
    Resources: {
      GreeterRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "GreeterRole",
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
      GreeterFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "greeter",
          Role: {
            "Fn::GetAtt": ["GreeterRole", "Arn"],
          },
          Handler: "index.handler",
          Runtime: "nodejs20.x",
          Code: {
            ZipFile:
              "exports.handler = async (event) => 'Hello ' + event.name;",
          },
        },
      },
    },
    Outputs: {
      FunctionName: {
        Value: {
          Ref: "GreeterFunction",
        },
      },
      FunctionArn: {
        Value: {
          "Fn::GetAtt": ["GreeterFunction", "Arn"],
        },
      },
    },
  },
});
await stack.waitForDeployComplete();

console.log(stack.output("FunctionName"));
console.log(stack.output("FunctionArn"));

const output = await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "greeter",
    Payload: JSON.stringify({ name: "Yulin" }),
  }),
);

if (output.Payload === undefined) throw new Error("No invoke Payload");
console.log(Buffer.from(output.Payload).toString());

await simAws.backgroundTasksComplete();
```

For `AWS::Lambda::Function`, `Ref` returns the function name and `Fn::GetAtt` supports `Arn`.

Supported function properties:

- `FunctionName` (a function with none is named after the stack and the logical ID)
- `Role` (typically a `Ref`/`Fn::GetAtt` to a same-stack `AWS::IAM::Role`, both resolving to the
  role's ARN)
- `Code` (inline `ZipFile` source string, or `S3Bucket`/`S3Key` fetched from same-scope sim S3)
- `Handler`
- `Runtime`
- `Description`
- `Timeout`
- `MemorySize`
- `Environment`
- `DeadLetterConfig`, whose `TargetArn` names a queue or a topic. See
  [retries and destinations in templates](#retries-and-destinations-in-templates)

A function with no `FunctionName` is named from the stack name, the logical ID and a tail derived
from both. A `RatesFunction` in `orders-stack` becomes `orders-stack-RatesFunction-` and twelve more
characters, where real CloudFormation ends the name in twelve random ones. The name is trimmed to
the 64 characters a function name allows, and [the CloudFormation docs](https://yulinsim.dev/services/cloudformation/#names-cloudformation-generates "Names CloudFormation generates")
cover how the stack name and the logical ID share what is left.

Code in a missing bucket fails the deploy AWS-style with a `NoSuchBucket` diagnostic.

### CDK asset code

`lambda.Code.fromAsset(...)` and the constructs built on it stage function code in the CDK cloud
assembly, and synthesize a `Code.S3Bucket`/`S3Key` pointing at the CDK bootstrap staging bucket.
Deploying a synthesized template file with `deployTemplateFile` publishes the cloud assembly's
assets into that bucket in sim S3 before creating any resource, mirroring the way a real
`cdk deploy` runs `cdk-assets` before CloudFormation. Asset-bundled functions then resolve their
code through the ordinary sim S3 fetch and run their real handler modules.

Both shapes of staged asset are published. A handler directory is zipped on the way into sim S3,
as `cdk-assets` zips it on the way to a real bucket. An asset that is already an archive, such as
`Code.fromAsset("handler.zip")` or a bundler's archived output, is published as it stands.

Asset code runs under the same rules as any other sim Lambda code. Modules are evaluated as
CommonJS in a vm, so everything the handler imports has to be in the asset, and only Node.js
runtimes are simulated.

Two cases are skipped with a diagnostic, and the stack deploys around them:

- A function declaring a non-Node.js `Runtime`, such as the Python provider function CDK
  synthesizes for `BucketDeployment`. Sim CloudFormation simulates that custom resource directly,
  so its provider never needs to run. Bind a real in-process handler to simulate a function whose
  runtime Yulin cannot run.
- A CDK-shaped template deployed without its cloud assembly, such as a template object passed
  inline to `deployTemplate`, where there is no asset to publish and no staging bucket.

### Container image functions

A function with `PackageType: Image` names a container image instead of code, as CDK's
`DockerImageFunction` and `lambda.DockerImageCode` synthesize it. Yulin never reads an image, and
has nothing to run. The Resource is skipped with a diagnostic naming the image, and the rest of the
stack deploys.

There are two ways to give that function a real in-process handler to run instead, and they suit
different shapes of test:

- Bind one to the function for this deploy, the same mechanism as
  [executable bindings](#executable-bindings) and shown below.
- Register one as the image in a
  [simulated ECR repository](https://yulinsim.dev/services/ecr/ "Simulated ECR usage docs"). That is a standing statement about
  what the image is, made once and good for every stack that runs it, and for a function created
  directly through `CreateFunction`.

Either way the handler replaces the image, and the function is created and invoked like any other. A
binding is looked at first, because it is about one deploy where a repository is about the image
everywhere.

```typescript sim-lambda-container-image-function
/**
 * Simulating a container image Lambda function with a bound handler.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";

const imageFunctionTemplate = {
  Resources: {
    OrdersFunction: {
      Type: "AWS::Lambda::Function",
      Properties: {
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        PackageType: "Image",
        Code: {
          ImageUri:
            "111111111111.dkr.ecr.eu-west-2.amazonaws.com/orders:latest",
        },
      },
    },
  },
};

// Without a binding, the function is skipped and the stack still deploys.
const skippedSimAws = new SimAws();

const skippedStack = await skippedSimAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: imageFunctionTemplate,
});

console.log(skippedStack.getResource("OrdersFunction")?.skippedReason);

await skippedSimAws.backgroundTasksComplete();

// With a binding, the handler replaces the image and the function runs.
const simAws = new SimAws();

await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: imageFunctionTemplate,
  bindings: [
    {
      logicalId: "OrdersFunction",
      handler: (event: { orderId: string }): string =>
        `Processed ${event.orderId}`,
    },
  ],
});

const output = await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "orders",
    Payload: JSON.stringify({ orderId: "order-1" }),
  }),
);

if (output.Payload === undefined) throw new Error("No invoke Payload");
console.log(Buffer.from(output.Payload).toString());

await simAws.backgroundTasksComplete();
```

A function declaring `Code.ImageUri` without `PackageType` is treated the same way. `ImageConfig`
is ignored, because `Command`, `EntryPoint` and `WorkingDirectory` have no meaning for a handler
running in this process.

A binding can also name the image repository instead of the function, which covers every function
running that image without repeating the binding per stack. See
[binding by container image repository](#binding-by-container-image-repository).

The skip reason says what was looked for. An image whose repository no simulated ECR holds is
reported apart from one whose repository holds no image, since those send you to different places.
The first is a repository name disagreeing with the template, and the second a handler that was
never registered.

## Function URLs in templates

`AWS::Lambda::Url` creates a Function URL for a deployed function, and CDK's
`Function.addFunctionUrl(...)` emits one. `TargetFunctionArn` accepts either an `Fn::GetAtt` ARN or a
`Ref` to the function, and `Fn::GetAtt` on the URL exposes `FunctionUrl` and `FunctionArn`.

```typescript sim-lambda-cloudformation-function-url
/**
 * Deploying a simulated Lambda Function URL from a CloudFormation template.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "greeter-stack",
  template: {
    Resources: {
      GreeterRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "GreeterRole",
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
      GreeterFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "greeter",
          Role: { "Fn::GetAtt": ["GreeterRole", "Arn"] },
          Handler: "index.handler",
          Runtime: "nodejs22.x",
          Code: {
            ZipFile:
              "exports.handler = async (event) => " +
              "({ statusCode: 200, body: 'Hello ' + event.rawPath });",
          },
        },
      },
      GreeterUrl: {
        Type: "AWS::Lambda::Url",
        Properties: {
          TargetFunctionArn: { "Fn::GetAtt": ["GreeterFunction", "Arn"] },
          AuthType: "NONE",
        },
      },
    },
    Outputs: {
      GreeterFunctionUrl: {
        Value: { "Fn::GetAtt": ["GreeterUrl", "FunctionUrl"] },
      },
    },
  },
});
await stack.waitForDeployComplete();

const functionUrl = stack.output("GreeterFunctionUrl");
const srv = await serveSimAws({ simAws });

try {
  const response = await fetch(srv.localUrl(`${functionUrl}hello`));

  console.log(await response.text());
} finally {
  await srv.close();
}
```

CDK templates work the same way. Synth the app, deploy the template file, and read
`functionUrl.url` from the stack outputs. CDK pairs a public Function URL with an
`AWS::Lambda::Permission`, which deploys alongside it as
[permissions in templates](#permissions-in-templates) covers.

## Versions and aliases in templates

`AWS::Lambda::Version` publishes a version of the function its `FunctionName` names, and
`AWS::Lambda::Alias` gives one of those versions a name. CDK emits both for `fn.currentVersion` and
`new lambda.Alias(...)`, and the integrations in such an app point at the alias.

`FunctionName` accepts either a `Ref` to the function, giving its name, or an `Fn::GetAtt` on it,
giving the ARN. `Ref` on the version resolves to the qualified function ARN
(`arn:aws:lambda:us-east-1:888888888888:function:greeter:1`) and `Fn::GetAtt` `Version` to the
number on the end of it. An alias's `FunctionVersion` is usually written from that number. `Ref` on
the alias resolves to the alias ARN. `Fn::GetAtt` also supports `FunctionArn` on a version and
`AliasArn` on an alias.

```typescript sim-lambda-cloudformation-alias
/**
 * Deploying a Lambda version and an alias on it from a CloudFormation
 * template, and invoking the function through the alias.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "greeter-stack",
  template: {
    Resources: {
      GreeterFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "greeter",
          Role: "arn:aws:iam::111111111111:role/GreeterRole",
          Handler: "index.handler",
          Runtime: "nodejs22.x",
          Code: {
            ZipFile:
              "exports.handler = async (event, context) => " +
              "context.functionVersion;",
          },
        },
      },
      GreeterVersion: {
        Type: "AWS::Lambda::Version",
        Properties: {
          FunctionName: { Ref: "GreeterFunction" },
        },
      },
      GreeterAlias: {
        Type: "AWS::Lambda::Alias",
        Properties: {
          FunctionName: { Ref: "GreeterFunction" },
          Name: "live",
          FunctionVersion: { "Fn::GetAtt": ["GreeterVersion", "Version"] },
        },
      },
    },
    Outputs: {
      GreeterAliasArn: { Value: { Ref: "GreeterAlias" } },
    },
  },
});
await stack.waitForDeployComplete();

console.log(stack.output("GreeterAliasArn"));

const invoked = await simAws
  .lambda()
  .invoke(new InvokeCommand({ FunctionName: "greeter", Qualifier: "live" }));

console.log(invoked.ExecutedVersion);

await simAws.backgroundTasksComplete();
```

Supported `AWS::Lambda::Version` properties:

- `FunctionName`
- `Description`, which describes the published version and leaves the function's own description
  alone

Supported `AWS::Lambda::Alias` properties:

- `FunctionName`
- `Name`
- `FunctionVersion`
- `Description`

An `AWS::Lambda::Permission` naming a version or an alias grants on it. See
[permissions in templates](#permissions-in-templates).

Deleting the Stack deletes the alias. Lambda has no operation that deletes one published version.
The version Resource has nothing of its own to do on teardown, and the version it published goes
when the function does.

## Retries and destinations in templates

`AWS::Lambda::EventInvokeConfig` writes the event invoke config of the function, version or alias
its `FunctionName` and `Qualifier` name. CDK emits one for `onFailure`, `onSuccess`, `retryAttempts`
and `maxEventAge` on a function. `DeadLetterConfig` on `AWS::Lambda::Function` is what CDK's
`deadLetterQueue` emits, and it sets the same dead-letter target `CreateFunction` takes.

```typescript sim-lambda-cloudformation-event-invoke-config
/**
 * Deploying a Lambda failure destination and a dead-letter queue from a
 * CloudFormation template.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";
import type { SimLambdaDestinationRecord } from "@kensio/yulin/lambda";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrderFailures: {
        Type: "AWS::SQS::Queue",
        Properties: { QueueName: "order-failures" },
      },
      OrderDeadLetters: {
        Type: "AWS::SQS::Queue",
        Properties: { QueueName: "orders-dlq" },
      },
      OrdersRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "OrdersRole",
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
          Policies: [
            {
              PolicyName: "SendFailedOrders",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: "sqs:SendMessage",
                    Resource: [
                      { "Fn::GetAtt": ["OrderFailures", "Arn"] },
                      { "Fn::GetAtt": ["OrderDeadLetters", "Arn"] },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
      OrdersFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "orders",
          Role: { "Fn::GetAtt": ["OrdersRole", "Arn"] },
          Handler: "index.handler",
          Runtime: "nodejs22.x",
          Code: {
            ZipFile:
              "exports.handler = async () => { throw new Error('failed'); };",
          },
          DeadLetterConfig: {
            TargetArn: { "Fn::GetAtt": ["OrderDeadLetters", "Arn"] },
          },
        },
      },
      OrdersInvokeConfig: {
        Type: "AWS::Lambda::EventInvokeConfig",
        Properties: {
          FunctionName: { Ref: "OrdersFunction" },
          Qualifier: "$LATEST",
          MaximumRetryAttempts: 0,
          DestinationConfig: {
            OnFailure: {
              Destination: { "Fn::GetAtt": ["OrderFailures", "Arn"] },
            },
          },
        },
      },
    },
    Outputs: {
      FailuresQueueUrl: {
        Value: { "Fn::GetAtt": ["OrderFailures", "QueueUrl"] },
      },
    },
  },
});
await stack.waitForDeployComplete();

await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "orders",
    InvocationType: "Event",
    Payload: JSON.stringify({ id: 7 }),
  }),
);
await simAws.backgroundTasksComplete();

const received = await simAws
  .sqs()
  .receiveMessage(
    new ReceiveMessageCommand({ QueueUrl: stack.output("FailuresQueueUrl") }),
  );
const record = JSON.parse(
  String(received.Messages?.[0]?.Body),
) as SimLambdaDestinationRecord;

console.log(record.requestContext.condition);
console.log(record.requestPayload);
```

Supported `AWS::Lambda::EventInvokeConfig` properties:

- `FunctionName`, as a `Ref` to the function giving its name or an `Fn::GetAtt` on it giving the ARN
- `Qualifier`, naming a published version or an alias. `$LATEST` addresses the function itself
- `MaximumRetryAttempts`
- `MaximumEventAgeInSeconds`
- `DestinationConfig`, holding `OnSuccess` and `OnFailure`

A destination and a `DeadLetterConfig.TargetArn` name a queue or a topic by `Fn::GetAtt` on its ARN
or by `Ref`. `Ref` on an `AWS::SQS::Queue` resolves to the queue URL, and both forms reach the same
queue.

Where a destination names something simulated Lambda has nowhere to send to, such as a service
outside the template or a Resource the deployment skipped, the Resource is deployed without that
destination and the omission is recorded in `stack.ignoredProperties` under the property that named
it. The function still deploys, and a stack keeps the destination it can reach when the other end
names one it cannot. Refusing a whole stack over one destination would leave a test with nothing to
run.

Deleting the Stack takes the config off the function, ahead of the function itself.

## Executable bindings

Deploy-time `bindings` let a template function be backed by a real in-process handler instead of its
template code. They are the CloudFormation counterpart of `makeLambdaZipFileInput(...)`. The bound
handler runs with the same execution-role attribution as template code, can close over test state,
and can be stepped through in a debugger.

```typescript sim-lambda-cloudformation-bindings
/**
 * Binding a real in-process handler to a CloudFormation Lambda function.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const observedEvents: unknown[] = [];

await simAws.cloudFormation().deployTemplate({
  stackName: "bound-greeter-stack",
  template: {
    Resources: {
      GreeterFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "bound-greeter",
          Role: "arn:aws:iam::111111111111:role/BoundGreeterRole",
        },
      },
    },
  },
  bindings: [
    {
      logicalId: "GreeterFunction",
      handler: (event: { name: string }): string => {
        observedEvents.push(event);
        return `Hello ${event.name} from the bound handler`;
      },
    },
  ],
});

const output = await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "bound-greeter",
    Payload: JSON.stringify({ name: "Yulin" }),
  }),
);

if (output.Payload === undefined) throw new Error("No invoke Payload");
console.log(Buffer.from(output.Payload).toString());
console.log(observedEvents.length);

await simAws.backgroundTasksComplete();
```

A binding can target the function by `logicalId` (which also matches a CDK construct ID from
`aws:cdk:path` metadata), by `functionName`, by `arn`, by full `cdkPath`, or by `imageRepository`
for a function packaged as a container image. A bound function may omit template `Code` and
`Handler` entirely, and unbound functions in the same template keep their template code on the vm
path. A binding that resolves to no template resource fails the deploy with the unmatched target
named for diagnosis. Where two bindings could both back the same function, the one listed first is
the one that backs it.

### Invoking a function bound by construct ID

A CDK function usually leaves `FunctionName` out of the template, and sim Lambda creates it under
the synthesized logical ID. `stack.getResource` takes the construct ID the binding named. The
Resource it answers with carries that logical ID, and it is the name to invoke. The hash CDK
generated stays out of the test.

```typescript sim-lambda-construct-id-invoke
/**
 * Invoking a Lambda function bound by its CDK construct ID.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "uploads-stack",
  template: {
    Resources: {
      UploadFunction8A7B6C5D: {
        Type: "AWS::Lambda::Function",
        Metadata: {
          "aws:cdk:path": "UploadsStack/UploadFunction/Resource",
        },
        Properties: {
          Role: "arn:aws:iam::111111111111:role/UploadFunctionRole",
        },
      },
    },
  },
  bindings: [
    {
      logicalId: "UploadFunction",
      handler: (event: { key: string }): string => `stored ${event.key}`,
    },
  ],
});

const upload = stack.getResource("UploadFunction");
if (upload === undefined) throw new Error("No UploadFunction Resource");

const output = await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: upload.logicalId,
    Payload: JSON.stringify({ key: "receipt.pdf" }),
  }),
);

if (output.Payload === undefined) throw new Error("No invoke Payload");
console.log(Buffer.from(output.Payload).toString());
// "stored receipt.pdf"

await simAws.backgroundTasksComplete();
```

A function with a `FunctionName` in the template is invoked by that name. The caller wrote it and
already holds it.

### Binding by container image repository

`imageRepository` matches any function whose resolved `Code.ImageUri` names that repository. One
binding covers every function running that image, in every stack deployed from the same `SimAws`.
A logical ID belongs to one construct tree.

The image tag is ignored on both sides of the match. No tag is stable enough to write into a test.
A CDK image asset is tagged with the asset content hash, which changes whenever the image source
does, and a pipeline-built image is usually tagged with a git sha or a build number passed in as a
stack parameter. The registry host is part of the repository, so the account and region have to
match too, and an `ImageUri` built by `Fn::Sub` or from a stack parameter is matched on what it
resolves to.

```typescript sim-lambda-image-repository-binding
/**
 * Binding a handler to a container image function by its image repository.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Parameters: {
      ImageTag: { Type: "String" },
    },
    Resources: {
      OrdersFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "orders",
          Role: "arn:aws:iam::111111111111:role/OrdersRole",
          PackageType: "Image",
          Code: {
            ImageUri: {
              "Fn::Sub":
                // eslint-disable-next-line no-template-curly-in-string
                "${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com/orders:${ImageTag}",
            },
          },
        },
      },
    },
  },
  parameters: { ImageTag: "build-4172" },
  bindings: [
    {
      imageRepository:
        `${simAws.defaultAccountId}.dkr.ecr.` +
        `${simAws.defaultRegionName}.amazonaws.com/orders`,
      handler: (event: { orderId: string }): string =>
        `Processed ${event.orderId}`,
    },
  ],
});

const output = await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "orders",
    Payload: JSON.stringify({ orderId: "order-1" }),
  }),
);

if (output.Payload === undefined) throw new Error("No invoke Payload");
console.log(Buffer.from(output.Payload).toString());

await simAws.backgroundTasksComplete();
```

A function matched this way is created from the bound handler, and never reaches the
[container image skip](#container-image-functions). Functions in the same template running an image
from another repository are skipped as usual.

A binding like this and a handler registered in
[simulated ECR](https://yulinsim.dev/services/ecr/ "Simulated ECR usage docs") match on the same thing, and the binding is what
backs the function where both could. Reach for the binding when the handler belongs to one deploy,
and for the repository when it belongs to the image.

## Available functionality

Sim Lambda currently supports:

- `CreateFunctionCommand` and `GetFunctionCommand`, including a function created from the
  [simulated ECR](https://yulinsim.dev/services/ecr/ "Simulated ECR usage docs") image its `Code.ImageUri` names
- `UpdateFunctionCodeCommand`, replacing the code `$LATEST` runs while the function keeps its
  policy, Function URL, versions and aliases
- `UpdateFunctionConfigurationCommand`, changing the `Role`, `Handler`, `Runtime`, `Description`,
  `Timeout`, `MemorySize` and `Environment` a function runs with
- `ListFunctionsCommand`, reporting every function in the Account and Region, and their published
  versions with `FunctionVersion: "ALL"`
- `InvokeCommand`, with the `RequestResponse`, `Event` and `DryRun` invocation types
- Handler timers on the simulation's clock, and the function's `Timeout` as a deadline on the same
  clock, reported as real Lambda reports a timeout
- Asynchronous invocation retries on the simulated clock, and `OnSuccess`/`OnFailure` destinations
  written with `PutFunctionEventInvokeConfigCommand`, delivering the AWS destination record to a
  simulated SQS queue, SNS topic, EventBridge event bus or Lambda function after authorizing the
  target operation against the source function's execution role
- `GetFunctionEventInvokeConfigCommand`, `UpdateFunctionEventInvokeConfigCommand`,
  `DeleteFunctionEventInvokeConfigCommand` and `ListFunctionEventInvokeConfigsCommand`, each taking
  a `Qualifier` for a version's or an alias's own config
- `DeadLetterConfig` on `CreateFunction` and `UpdateFunctionConfiguration`, sending an abandoned
  event to a simulated SQS queue or SNS topic
- Function URLs, created with `CreateFunctionUrlConfigCommand` and served over HTTP on localhost
  with `serveSimAws`
- `Cors` on a Function URL, adding the configured headers to every response and answering a browser
  preflight without invoking the function
- `iam:PassRole` authorization of the execution role named by `CreateFunctionCommand` and
  `UpdateFunctionConfigurationCommand`, with `iam:PassedToService` supplied
- `AuthType: "AWS_IAM"` Function URLs, authorizing `lambda:InvokeFunctionUrl` against the caller
  resolved from the request, and `lambda:InvokeFunction` as well for a CloudFront origin access
  control
- `lambdaFunctionUrlEventFactory`, making a Function URL invocation event for a test that calls a
  handler directly
- `AddPermissionCommand`, `RemovePermissionCommand` and `GetPolicyCommand`, for resource-based
  policies evaluated alongside identity policies
- SQS, DynamoDB stream and Kinesis stream event source mappings, created with
  `CreateEventSourceMappingCommand` and read with `GetEventSourceMappingCommand`,
  `ListEventSourceMappingsCommand` and `DeleteEventSourceMappingCommand`, delivering real-shaped SQS,
  DynamoDB stream and Kinesis events and honouring `BatchSize`
- `StartingPosition: "TRIM_HORIZON"` and `"LATEST"` on a stream mapping, and `"AT_TIMESTAMP"` on a
  Kinesis one, with a failing batch blocking its shard until it is through or discarded
- `MaximumRetryAttempts` and `MaximumRecordAgeInSeconds` on a stream mapping, ending the retries at
  a quota or at a record age
- Every shard of a Kinesis stream read by a processor of its own, as real Lambda reads one
- `FunctionResponseTypes: ["ReportBatchItemFailures"]` on a queue mapping, returning only the
  message ids the handler reported, and on a stream mapping, rewinding to the lowest sequence number
  the handler reported
- Function code from three sources:
  - an in-process handler function passed via `makeLambdaZipFileInput(...)`
  - zip archive bytes on `Code.ZipFile` (build them with `makeLambdaCodeZip(...)`)
  - a zip object stored in sim S3 via `Code.S3Bucket`/`S3Key`
- A Node.js `vm` runtime for zip-packaged code, with warm module state across invocations, and
  writable standard streams for handler output, including a bundled AWS Lambda Powertools logger's
  own console
- Handler output recorded into the function's log group and forwarded to the host console, with
  `simAws.lambda().output().captureOnly()` to drop the forwarding
- Per-function environment variables with `Environment.Variables`
- Runtime-provided `@aws-sdk/*` packages inside function code, routed into the owning simulated AWS
  environment
- `fetch`, `node:http` and `node:https` requests from function code, answered by the simulation for
  every hostname it serves, including a Cognito user pool domain's OAuth endpoints and the JWKS a
  token verifier fetches from the regional Cognito endpoint
- Execution roles, evaluated against simulated IAM
- Published versions and aliases, with `PublishVersion`, `ListVersionsByFunction`, `CreateAlias`,
  `UpdateAlias`, `GetAlias`, `ListAliases` and `DeleteAlias`, and a `Qualifier` on `Invoke`,
  `GetFunction` and the permission commands, each qualified resource holding its own policy
- IAM authorization of the Lambda commands themselves (`lambda:CreateFunction`,
  `lambda:GetFunction`, `lambda:UpdateFunctionCode`, `lambda:InvokeFunction`, the Function URL
  config actions, and the version and alias actions), and `lambda:ListFunctions` on `*` for the
  listing
- AWS-like validation and errors, such as `ResourceConflictException` for a duplicate function name
- The `AWS::Lambda::Function`, `AWS::Lambda::Url`, `AWS::Lambda::Permission`,
  `AWS::Lambda::Version`, `AWS::Lambda::Alias`, `AWS::Lambda::EventSourceMapping` and
  `AWS::Lambda::EventInvokeConfig` CloudFormation resources, with `Ref`/`Fn::GetAtt` support and
  deploy-time executable bindings
- A CDK app built on `fn.currentVersion` or a `lambda.Alias`, which deploys with the alias its
  integrations point at, and where an `AWS::Lambda::Permission` naming that alias grants on the
  alias
- `AWS::Lambda::EventSourceMapping` on a queue, on a table's stream or on a Kinesis stream,
  including the `StartingPosition` a stream mapping needs, so a CDK `SqsEventSource`,
  `DynamoEventSource` or `KinesisEventSource` deploys as it is synthesised
- A CDK function given `onFailure`, `onSuccess`, `retryAttempts`, `maxEventAge` or
  `deadLetterQueue`, which deploys the `AWS::Lambda::EventInvokeConfig` and the `DeadLetterConfig`
  those synthesise

## Limitations

Current documented limitations:

- Only `CreateFunctionCommand`, `GetFunctionCommand`, `UpdateFunctionCodeCommand`,
  `UpdateFunctionConfigurationCommand`, `ListFunctionsCommand`, `DeleteFunctionCommand`,
  `InvokeCommand`, the permission commands (`AddPermissionCommand`, `RemovePermissionCommand`,
  `GetPolicyCommand`), the version and alias commands, the Function URL config commands and the
  event source mapping commands are supported. `GetFunctionConfiguration` and the concurrency and
  tagging commands are absent so far.
- `UpdateFunctionCode` leaves out the `RevisionId` and `DryRun` preconditions real Lambda takes,
  along with `Architectures` and `SourceKMSKeyArn`. `UpdateFunctionConfiguration` takes only the
  settings simulated Lambda models, leaving out `Layers`, `VpcConfig`, `TracingConfig`, `KMSKeyArn`,
  `EphemeralStorage`, `SnapStart`, `LoggingConfig` and `RevisionId`. `ListFunctions` leaves out
  `Marker`/`MaxItems` paging and `MasterRegion`.
- SAM's `EventInvokeConfig` and `DeadLetterQueue` on `AWS::Serverless::Function` are left out. A
  SAM application declaring either deploys a function with the default retries, no destinations and
  no dead-letter target. The `AWS::Lambda::EventInvokeConfig` Resource and the `DeadLetterConfig`
  property a CloudFormation or CDK template writes are both deployed. See
  [retries and destinations in templates](#retries-and-destinations-in-templates).
- Throttling does not drive a retry. A retry follows a handler that threw or ran out of time, and
  the `MaximumEventAgeInSeconds` a config carries is measured from when the invocation was
  accepted.
- Stream mappings support standard SQS and SNS `DestinationConfig.OnFailure` destinations.
  S3 destinations and `OnSuccess` are refused. Destination delivery is attempted once. A delivery
  failure rejects the background task after the discarded records have advanced the checkpoint.
  Destination delivery retries and `DestinationDeliveryFailures` metrics are not simulated.
- A settings change takes effect at once. Real Lambda reports `LastUpdateStatus: "InProgress"` while
  it rolls the change out, and neither that member nor the wait it implies is simulated.
- A cross-account grant is only half of what admits a call. The caller's own Account has to allow
  the action too, and its IAM has to be part of the same `SimAws` instance for its policies to be
  found. A caller from an Account outside the simulation is denied.
- `lambda:FunctionUrlAuthType`, `AWS:SourceArn` and `AWS:SourceAccount` are the only condition keys
  given a value at request time. The first is supplied when a Function URL is invoked, and the other
  two when another simulated service invokes the function on a resource's behalf. See
  [Resource-based policies](#resource-based-policies) for which paths those are.
  `PrincipalOrgID` and `InvokedViaFunctionUrl` are written into the statement so `GetPolicy` reports
  the grant that was made, and no value is supplied for them, so a statement carrying one never
  matches.
- `RevisionId` and `EventSourceToken` on the permission commands are left out.
- `requestContext.authorizer.iam` reports `accessKey` as empty, and `callerId` and `userId` as the
  caller ARN rather than the opaque unique id real AWS uses. `cognitoIdentity` and `principalOrgId`
  are always null.
- A Function URL's `Cors` block is checked against the bounds the Lambda API documents for each
  member. Values inside those bounds are taken as they are. An `AllowOrigins` entry that is not a
  well-formed Origin is stored and matches no request.
- `InvokeMode: "RESPONSE_STREAM"` is accepted and reported, but responses are always served
  buffered.
- A function has at most one Function URL, and qualified (version or alias) Function URLs are left
  out.
- A published version keeps what it was published with, so `UpdateFunctionCode` moves `$LATEST`
  alone. The `CodeSha256` and `RevisionId` checks `PublishVersion` makes are left out, along with
  alias `RoutingConfig` weights, provisioned concurrency, and the `Marker`/`MaxItems` paging on the
  two listings. `CodeSha256`, `RuntimePolicy`
  and `ProvisionedConcurrencyConfig` on `AWS::Lambda::Version`, and `RoutingConfig` and
  `ProvisionedConcurrencyConfig` on `AWS::Lambda::Alias`, are accepted and ignored. SAM's
  `AutoPublishAlias` is left out.
- A qualified function ARN reaches a function through S3 notifications, SNS subscriptions,
  CloudWatch Logs subscriptions, Cognito triggers, EventBridge targets, event source mappings and
  API Gateway integration and authorizer URIs, and `AWS::Lambda::Permission`. The
  `AWS::Lambda::Url` and `AWS::Lambda::EventSourceMapping` template readers still refuse or drop a
  qualifier.
- The vm runtime supports CommonJS function code only. An ES module deployment package is refused
  at cold start, whether the handler file ends in `.mjs` or a `.js` file opens on `import`.
  Evaluating one would need `vm.SourceTextModule`, which Node.js gates behind
  `--experimental-vm-modules` at process launch, and a simulator that made every consumer pass a
  Node.js flag would cost more than it repaid. Back the function with an in-process handler, or
  deploy a CommonJS build of the same source. See
  [zip-packaged code and the vm runtime](#zip-packaged-code-and-the-vm-runtime).
- A handler function reference is recorded through the process console and the process standard
  streams, both of which a test runner is free to replace. `console.trace` and `console.dir`
  decorate what they print, and either one reaches the log group only where the host console passes
  it on to `process.stdout`. See [What a handler prints](#what-a-handler-prints).
- The platform `START`, `END` and `REPORT` lines a real log stream carries are left out, and
  execution environments are never recycled, so a function keeps one log stream for as long as it
  exists.
- Container image functions are never run. Yulin never reads a container image, and stays
  Docker-free.
  A function with `PackageType: Image` is skipped, or refused on `CreateFunction`, unless a real
  in-process handler stands in for its image, either one bound to it or one registered in the
  [simulated ECR](https://yulinsim.dev/services/ecr/ "Simulated ECR usage docs") repository the image URI names. See
  [Container image functions](#container-image-functions).
- Lambda Layers are left out.
- Environment variables declared with `Environment.Variables` reach a real in-process handler
  function only while it runs, so a variable read at module scope sees the host process value
  instead. See [Environment variables](#environment-variables).
- Outbound HTTP is routed for `fetch`, `node:http` and `node:https` alone. A handler using another
  client, or a request made from a handler module while it is being imported, reaches the network.
  A routed response comes back as the simulation answered it, with redirects left for the caller to
  follow. See [The HTTP requests function code makes](#the-http-requests-function-code-makes).
- The AWS service API endpoints answered as Commands are the ones a request can be read back from,
  and the hostnames answered over HTTP are the ones simulated Route53 resolves. The endpoints AWS
  issues for one resource, a Lambda Function URL and an API Gateway HTTP API, resolve under the
  hostnames the simulator serves them on. A request to the AWS form of one of those reaches the
  network.
- An unsigned request to a service API endpoint is served over HTTP when the simulation serves that
  endpoint, which today means Cognito's regional endpoint and the S3 endpoints. Anywhere else it is
  read as a Command and refused as one.
- A handler is interrupted at its deadline only where it yields. The deadline waits on the
  simulation's clock like any other work, and dispatching it needs the event loop, so a handler
  looping over the CPU without awaiting anything runs to the end of its loop.
- The global `setTimeout`, `clearTimeout`, `setInterval` and `clearInterval` are the timers on the
  simulation's clock. `node:timers`, `node:timers/promises` and `util.promisify(setTimeout)` are
  imported directly rather than read from the globals, and they wait in real time.
- Module-scope initialization time and execution environment recycling are left out. A cold start
  costs nothing against the deadline, and a function keeps one warm environment for as long as it
  exists.
- A time read at module scope, like an environment variable read there, is read before any
  invocation and sees the host clock. See [The time inside a handler](#the-time-inside-a-handler).
- `Event` invocation retries and failure destinations are left out, and handler errors are dropped.
- The S3 object version a code location names is accepted but ignored, as sim S3 has no object
  versioning yet. That covers `Code.S3ObjectVersion` on `CreateFunction` and on a template
  function, and `S3ObjectVersion` on `UpdateFunctionCode`. A versioned location loads the object as
  it stands.
- SQS queues, DynamoDB streams and Kinesis streams are the only event sources. Kafka, DocumentDB and
  Kinesis enhanced fan-out consumers are refused outright. `CreateEventSourceMapping` also refuses
  `FilterCriteria`, `ScalingConfig`, `ParallelizationFactor`, `TumblingWindowInSeconds` and the
  other inputs this simulation has no behaviour for. An
  `AWS::Lambda::EventSourceMapping` naming any of them deploys instead, and records each one against
  the Resource (see
  [Properties a Resource was created without](https://yulinsim.dev/services/cloudformation/#properties-a-resource-was-created-without "Properties a Resource was created without")).
- A failed stream batch waits 1, 2, 4, 8 and 16 seconds between attempts, where AWS documents no
  delay. That is deliberate. A delay of zero falls due at the instant the clock already reads, and a
  handler that always throws would leave `advanceBy` with work falling due forever. A mapping that
  names neither `MaximumRetryAttempts` nor `MaximumRecordAgeInSeconds` gets five retries and then
  discards the batch, where AWS goes on until the records age out a day later. A batch item failure
  report counts against the same retries, and never starts them again for the records it rewound
  to.
- Splitting a batch under `BisectBatchOnFunctionError` puts the retry count back to the start, where
  AWS counts a bisected batch's deliveries against the same quota. Without that, the simulator's own
  cap of five attempts would discard a batch of a hundred long before it was down to one record. The
  splitting still ends on its own, because a batch halves at every step.
- A handler writing into the table whose stream invoked it is refused with
  `SimLambdaStreamCascadeError` rather than being delivered its own writes forever. Real Lambda runs
  that loop.
- A shard iterator never expires, where a real one is good for 15 minutes.
- `MaximumBatchingWindowInSeconds` is only simulated as 0. A partial batch is delivered as soon as
  anything is on the event source, leaving a batching window nothing to wait for. A non-zero value
  is refused, which also caps a queue mapping's `BatchSize` at 10. The documented rule that a
  `BatchSize` above 10 needs a batching window goes unenforced, because the same AWS documentation
  gives a stream mapping `BatchSize` 100 and window 0 as simultaneous defaults, and CDK emits
  exactly that.
- An execution role that gets its stream permissions from the AWS managed policy
  `AWSLambdaDynamoDBExecutionRole` has none here, since simulated IAM has no model for managed
  policy ARNs, so the mapping is refused when it is created. A hand-written template and a SAM application
  usually attach that policy where CDK writes an inline one, so the two declaration paths differ.
  Write the grant inline to deploy either.
- `UpdateEventSourceMapping` is absent, and a mapping's batch size or enabled state is fixed once it
  is created. `Enabled: false` at creation is simulated.
- One poll of one shard delivers one batch. Real Lambda runs several pollers at once and scales them
  with the event source, and what that concurrency does to ordering or to a downstream service is
  invisible here. A simulated DynamoDB stream has one shard and never splits, so a mapping on one has
  a single thing to read either way. A Kinesis stream has the shards it was created with, each read
  by a processor of its own, and none of them ever splits or merges.
- CloudFormation resource types other than `AWS::Lambda::Function`, `AWS::Lambda::Url`,
  `AWS::Lambda::Permission`, `AWS::Lambda::Version`, `AWS::Lambda::Alias`,
  `AWS::Lambda::EventSourceMapping` and `AWS::Lambda::EventInvokeConfig` (`LayerVersion`,
  `CodeSigningConfig`, ...) are skipped with an "Unsupported" diagnostic.
- The `vm` context is a namespacing convenience rather than a security boundary. Function code runs
  in-process with the same trust as the test suite itself. Do not run untrusted code through the
  simulator.
- `serveSimAws` serves nineteen of these operations over HTTP, listed in the
  [serving docs](https://yulinsim.dev/serve/#lambda-over-the-endpoint). The version and alias operations have no
  route there yet, and reach the simulation through `SimAws` or
  [SDK interception](https://yulinsim.dev/sdk/) instead.
