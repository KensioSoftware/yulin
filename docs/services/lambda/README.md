# Simulated Lambda

Yulin includes a simulated AWS Lambda service for tests and local development. Functions are
created and invoked entirely in-process and in-memory. There is no need for containers or real AWS
infrastructure.

Sim Lambda can be used through `SimAws` to create functions, inspect their configuration, invoke
them, and create functions from sim CloudFormation templates. Handlers run with their execution
role as the simulated caller, so AWS calls made inside a handler are authorized by simulated IAM,
similar to real Lambda.

Lambda-specific helpers are imported from the `@kensio/yulin/lambda` subpath.

## Available functionality

Sim Lambda currently supports:

- Creating functions with `CreateFunctionCommand`
- Fetching function configuration with `GetFunctionCommand`
- Invoking functions with `InvokeCommand`, including the `RequestResponse`, `Event`, and `DryRun`
  invocation types
- Function URLs, created with `CreateFunctionUrlConfigCommand` and served over real HTTP on
  localhost with `serveSimAws`, so application code can call a simulated function the way it calls
  a deployed one
- `AuthType: "AWS_IAM"` Function URLs, authorizing `lambda:InvokeFunctionUrl` against the caller
  resolved from the request and reporting it to the handler as
  `requestContext.authorizer.iam`
- Function code from three sources:
  - an in-process handler function passed via `makeLambdaZipFileInput(...)`
  - zip archive bytes on `Code.ZipFile` (build them with `makeLambdaCodeZip(...)`)
  - a zip object stored in sim S3 via `Code.S3Bucket`/`S3Key`
- A Node.js `vm` runtime for zip-packaged code: warm module state across invocations, relative
  requires between archived files, Node.js built-in modules, and AWS-like runtime environment
  variables
- Per-function environment variables with `Environment.Variables`, isolated from the host process
  and from other functions
- Runtime-provided `@aws-sdk/*` packages inside function code, routed into the owning simulated
  AWS environment
- Execution roles: handlers run as their execution `Role`, evaluated against simulated IAM
- IAM authorization of the Lambda commands themselves (`lambda:CreateFunction`,
  `lambda:GetFunction`, `lambda:InvokeFunction`, and the Function URL config actions)
- AWS-like validation and errors, such as `ResourceConflictException` for duplicate function names
  and `Could not unzip uploaded file` for invalid zip bytes
- CloudFormation resources `AWS::Lambda::Function` and `AWS::Lambda::Url`, with `Ref`/`Fn::GetAtt`
  support and deploy-time executable bindings

Real `LambdaClient` instances can also be routed into sim Lambda with
[SDK interception](../../sdk/ "Simulated AWS SDK interception docs").

The simulator focuses on useful behavior for isolated tests and local development rather than full
Lambda feature parity.

## Creating and invoking a function

The quickest way to a working function is to pass a real in-process handler function through the
SDK-shaped `Code.ZipFile` input with `makeLambdaZipFileInput(...)`. The handler is an ordinary
function in your Node.js process, so it can be stepped through in a debugger and can close over
local state.

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
`Pending` state and becomes `Active` in the background; wait with
`simAws.backgroundTasksComplete()` when a test asserts on the `Active` state.

Handlers use the same signature as real Node.js Lambda handlers — `(event, context, callback)` —
and all the real completion styles work: returning a promise, returning a plain value, calling the
callback, or the legacy context `done`/`fail`/`succeed` methods. Typed handlers written against
the `aws-lambda` typings package can be passed in unchanged.

A handler that throws is reported AWS-style: the invocation output has `FunctionError:
"Unhandled"` and the payload is an error document with `errorType`, `errorMessage`, and `trace`,
rather than the invoke call itself throwing.

## Zip-packaged code and the vm runtime

Real Lambda receives function code as a zip archive. `makeLambdaCodeZip(...)` builds real zip
bytes from a source string (which becomes a single `index.js` module) or from a files map keyed by
archive path (like a bundled deployment package). The archive runs in a Node.js `vm` context with
real cold-start semantics: the module is imported once, on first invocation, and module state
stays warm across invocations.

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
- Import and handler problems surface as invocation errors with the real runtime error types —
  `Runtime.ImportModuleError`, `Runtime.HandlerNotFound`, `Runtime.UserCodeSyntaxError`,
  `Runtime.MalformedHandlerName` — rather than failing creation.

Code is CommonJS, as zipped `.js` files are on the real `nodejs` runtimes; ES module source
(`export` syntax) is not supported yet and fails with a clear hint. `Code.ZipFile` bytes that are
not a real zip archive are rejected at creation with the AWS-like
`InvalidParameterValueException: Could not unzip uploaded file`.

The archives are real zip files, so they interoperate with real tooling in both directions: a zip
built by any other tool works as `Code.ZipFile` input, and `makeLambdaCodeZip` output can be
unzipped normally.

## Function code from S3

Function code can also be fetched from a zip object stored in sim S3, as SAM and CDK deployments
do on real AWS. The code object is fetched once at creation time, as the creating caller, so
simulated IAM applies to the code object read.

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
yet. A standalone `SimLambda` (constructed directly rather than through `SimAws`) has no sim S3 to
fetch from; `SimAws`-created Lambda wires the same-scope sim S3 automatically, matching real
Lambda's requirement for a same-region code bucket.

## The runtime-provided AWS SDK

Like the real Lambda Node.js runtime, the simulated runtime provides AWS SDK v3 packages without
them being bundled in the code archive: `require("@aws-sdk/client-s3")` (or any other `@aws-sdk/*`
package installed in the host project) resolves to the real package with its clients routed into
the owning simulated AWS environment. Calls the function code makes run as the function's
execution role, so simulated IAM authorizes them just like real Lambda execution roles.

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
real runtime's `AWS_REGION` provides; an explicit region on the client wins. The archive always
takes precedence: a package bundled under the archive's `node_modules/` is used as-is rather than
being intercepted.

## Invocation types

`InvokeCommand` supports the three AWS invocation types. `RequestResponse` (the default) awaits
the handler and returns its JSON-serialised result as the response payload. `Event` returns `202`
immediately and runs the handler in the background. `DryRun` returns `204` without invoking the
handler at all.

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

`Event` invocation handler errors are dropped, as sim Lambda does not simulate asynchronous
retries or failure destinations yet.

## Function URLs

A Function URL is an HTTP endpoint for one function. Creating one with
`CreateFunctionUrlConfigCommand` returns an AWS-shaped endpoint:

```text
https://<url-id>.lambda-url.<region>.on.aws/
```

Serving that URL with `serveSimAws` is the point of the feature: application code, a frontend dev
server, or curl can make real HTTP requests to a simulated Lambda function, alongside the other
simulated services on the same local server. Pass the Function URL through `srv.localUrl(...)`,
which keeps the endpoint's hostname but sends the request to the local server, in the same way it
adapts simulated S3 website and CloudFront URLs.

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
  srv.close();
}
```

On localhost the endpoint hostname becomes
`<url-id>.lambda-url.<region>.sim-aws.localhost:<port>`, dropping the `.on.aws` tail the way
simulated S3 endpoints drop `.amazonaws.com`. Requests are routed by that hostname, so a Function
URL created in a non-default account or region reaches the right function without any extra
configuration.

### The invocation event and the response

The handler receives the API Gateway HTTP API payload format 2.0 event that real Function URLs
send, which is the only format they use:

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

If the handler throws, the endpoint answers `502` with an AWS-like error document rather than the
handler's error, which stays visible to the test as the thrown error would be through
`InvokeCommand`.

### Managing a Function URL

`GetFunctionUrlConfigCommand` reads the configuration back, `UpdateFunctionUrlConfigCommand`
changes the `AuthType` or `InvokeMode` while keeping the same endpoint, and
`DeleteFunctionUrlConfigCommand` removes it, after which the hostname stops resolving and returns
`404`. `ListFunctionUrlConfigsCommand` lists what a function has, which is either nothing or one
configuration, since a function has at most one Function URL.

### IAM-authenticated Function URLs

A URL created with `AuthType: "AWS_IAM"` invokes the function only for a caller allowed
`lambda:InvokeFunctionUrl` on the function ARN, and answers `403` otherwise. That is a different
action from `lambda:InvokeFunction`, which the Invoke API uses: real AWS separates the two so a
policy can grant the HTTP endpoint without granting the SDK operation, and a policy naming only one
of them does not grant the other here either.

The caller comes from the request itself — a SigV4 signature, or an `x-sim-aws-caller` header
naming a principal directly. A request that offers neither is anonymous, owns no policies, and is
refused. See [callers of HTTP requests](../iam/#callers-of-http-requests) in the IAM docs for how
that resolution works and how to sign a served request.

An `AWS_IAM` invocation carries its caller into the event as
`requestContext.authorizer.iam`, which is the part a handler reads. It is absent for a `NONE`
invocation, as it is on real AWS, and `requestContext.accountId` is the caller's Account rather
than `anonymous`.

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
        body: `called by ${event.requestContext.authorizer?.iam.userArn ?? "nobody"}`,
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
  srv.close();
}
```

## Environment variables

A function can declare its own environment variables with `Environment.Variables`, as on real
Lambda. While the function runs, its code reads those variables from `process.env`, alongside the
AWS-provided runtime variables (`AWS_REGION`, `AWS_LAMBDA_FUNCTION_NAME`, and the rest).

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

Each function gets only the variables it declares. Variables that happen to be set in the process
running your tests are not visible to it, so a function cannot accidentally pass because your
shell or CI environment had the right variable set. Two functions declaring the same variable name
with different values each see their own, including when their invocations overlap.

The same applies to zip-packaged code in the vm runtime and to functions deployed from an
`AWS::Lambda::Function` template with an `Environment` property, including ones backed by an
[executable binding](#executable-bindings).

Variable names are validated as on real AWS. A name must match the Lambda name pattern
`[a-zA-Z]([a-zA-Z0-9_])+` — starting with a letter, at least two characters, and otherwise letters,
digits and underscores — or it is rejected with `ValidationException`. The names Lambda reserves
for the runtime (`AWS_REGION`, `AWS_LAMBDA_FUNCTION_NAME`, `LAMBDA_TASK_ROOT` and so on) cannot be
declared, and are rejected with `InvalidParameterValueException`. As on AWS, the pattern is checked
first, so a reserved name that also breaks it, such as `_HANDLER`, is reported as the constraint
violation.

### Read environment variables inside the handler

There is one thing to know about functions backed by a real in-process handler function. Because
that handler is an ordinary function in your test process rather than code loaded into a sandbox,
it only gets the function's own `process.env` while it is actually running.

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

Moving the read inside the handler is the fix, and is worth doing anyway for testability. Zip
code in the vm runtime is unaffected, because it is imported at cold start, during an invocation.

In practice this often does not come up: test suites commonly export the same variables they
configure their functions with, and then a module-scope read gets the right value regardless. Sim
Lambda warns on the console when that is not the case, in the two situations where the difference
actually changes what your code sees:

- a declared variable whose name the host process also sets, with a different value
- two simulated functions declaring the same variable name with different values

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

console.log(stack.outputs.get("FunctionName")?.value);
console.log(stack.outputs.get("FunctionArn")?.value);

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

- `FunctionName` (defaults to the logical ID)
- `Role` (typically a `Ref`/`Fn::GetAtt` to a same-stack `AWS::IAM::Role`; both resolve to the
  role's ARN)
- `Code` — inline `ZipFile` source string, or `S3Bucket`/`S3Key` fetched from same-scope sim S3
- `Handler`
- `Runtime`
- `Description`
- `Timeout`
- `MemorySize`

A function whose `Code` points at a missing CDK bootstrap assets bucket
(`cdk-*-assets-*`) is skipped with a diagnostic rather than failing the stack, so CDK-synthesized
templates deploy without their asset staging. Code in any other missing bucket fails the deploy
AWS-style with a `NoSuchBucket` diagnostic.

## Function URLs in templates

`AWS::Lambda::Url` creates a Function URL for a deployed function, which is what CDK's
`Function.addFunctionUrl(...)` emits. `TargetFunctionArn` accepts either an `Fn::GetAtt` ARN or a
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

const functionUrl = stack.outputs.get("GreeterFunctionUrl")?.value as string;
const srv = await serveSimAws({ simAws });

try {
  const response = await fetch(srv.localUrl(`${functionUrl}hello`));

  console.log(await response.text());
} finally {
  srv.close();
}
```

CDK templates work the same way: synth the app, deploy the template file, and read
`functionUrl.url` from the stack outputs. Note that CDK pairs a public Function URL with an
`AWS::Lambda::Permission`, which is not simulated and is skipped with a diagnostic rather than
failing the deployment.

## Executable bindings

Deploy-time `bindings` let a template function be backed by a real in-process handler instead of
its template code — the CloudFormation counterpart of `makeLambdaZipFileInput(...)`. The bound
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
`aws:cdk:path` metadata), by `functionName`, by `arn`, or by full `cdkPath`. A bound function may
omit template `Code` and `Handler` entirely; unbound functions in the same template keep their
template code on the vm path. A binding that does not resolve to any template resource fails the
deploy with the unmatched target named for diagnosis.

## Limitations

Current documented limitations:

- Only `CreateFunctionCommand`, `GetFunctionCommand`, `InvokeCommand`, and the Function URL config
  commands are supported — no `UpdateFunctionCode`, `DeleteFunction`, or function listing yet.
- `AuthType: "AWS_IAM"` Function URLs evaluate `lambda:InvokeFunctionUrl` against identity policies
  in the function's own Account. Cross-account invocation needs a Lambda resource-based policy,
  which is not simulated yet.
- `requestContext.authorizer.iam` reports `accessKey` as empty, and `callerId` and `userId` as the
  caller ARN rather than the opaque unique id real AWS uses. `cognitoIdentity` and `principalOrgId`
  are always null.
- The Function URL `Cors` configuration is not simulated, including OPTIONS preflight handling.
- `InvokeMode: "RESPONSE_STREAM"` is accepted and reported, but responses are always served
  buffered.
- A function has at most one Function URL, and qualified (version or alias) Function URLs are not
  simulated.
- Function versions, aliases, and qualifiers are not simulated (`Version` is always `$LATEST`).
- The vm runtime supports CommonJS function code only; ES module source (`.mjs` / `export`
  syntax) is not supported yet.
- Container image functions (`Code.ImageUri`) are not supported — the simulator stays Docker-free.
- Lambda Layers are not simulated.
- Environment variables declared with `Environment.Variables` reach a real in-process handler
  function only while it runs, so a variable read at module scope sees the host process value
  instead. See [Environment variables](#environment-variables).
- `Timeout` is recorded but does not interrupt handler execution.
- `Event` invocations do not simulate retries or failure destinations; handler errors are dropped.
- `Code.S3ObjectVersion` is accepted but ignored, as sim S3 has no object versioning yet.
- CloudFormation resource types other than `AWS::Lambda::Function` and `AWS::Lambda::Url`
  (`Version`, `Alias`, `Permission`, `EventSourceMapping`, ...) are skipped with an "Unsupported"
  diagnostic.
- The `vm` context is a namespacing convenience, not a security boundary: function code runs
  in-process with the same trust as the test suite itself. Do not run untrusted code through the
  simulator.
- Only Function URLs are served over HTTP by `serveSimAws`; the Lambda control-plane API itself is
  not served, so SDK commands go through `SimAws` or [SDK interception](../../sdk/) rather than
  over the local server.
