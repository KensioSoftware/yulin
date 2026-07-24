# Simulated Lambda implementation

This directory contains the simulated Lambda service implementation.

The implementation focuses on Lambda behaviour that is useful for isolated tests and local
development: creating functions and invoking them in-process. It does not try to reproduce every
Lambda feature, but supported behaviour should be predictable and AWS-like enough that application
code can interact with it through familiar AWS SDK commands.

## Entry points

- `sim-lambda.ts` is the main in-memory service object for one account/region scope.
- `index.ts` exports the public Lambda simulator API for `@kensio/yulin/lambda`.

A `SimLambda` instance owns an in-memory map of functions:

```typescript
Map<SimLambdaFunctionName, SimLambdaFunction>;
```

The simulator is scoped to an AWS account and region. Function ARNs are built from that scope, so a
function created in account `666666666666` and region `eu-west-2` gets an ARN like:

```text
arn:aws:lambda:eu-west-2:666666666666:function:greeter
```

When used through `SimAws`, Lambda is available from account/region containers, for example
`simAws.lambda()`, `simAws.account("...").lambda()`, or
`simAws.account("...").region("...").lambda()`.

## Command handling

AWS SDK-style operations are implemented under `command/`.

Each supported command has its own directory containing:

- command input/output typing
- a handler that applies validation, IAM authorization, and state changes
- tests for the simulated command behaviour

As with other service implementations, implementation code under `src/` should not import real AWS
SDK packages. Instead, the simulator defines minimal structural interfaces that match the shape of
the AWS SDK command objects closely enough for users and tests to pass in real SDK command
instances.

Current command areas include:

- `create-function/`
- `get-function/`
- `invoke/`

The main `SimLambda` class delegates command execution to handlers rather than keeping command
handling logic inline.

## Function model

Function state lives under `function/`.

`SimLambdaFunction` is the stored simulated resource: name, execution role ARN, scope, AWS-like
configuration metadata, and the real handler function reference that backs it. A new function
starts in the `Pending` state and becomes `Active` asynchronously via the shared
`BackgroundScheduler`, mirroring how real Lambda creation returns before the function is ready.

### Function code input

Real Lambda receives zip-packaged function code in exactly two ways: zip archive bytes directly on
the request (`Code.ZipFile`) or a zip object stored in S3 (`Code.S3Bucket`/`S3Key`). Every
non-container deployment tool — vanilla CloudFormation, SAM, CDK, the console editor — reduces to
one of those two API primitives. The simulator supports both, plus a sim-only convenience:

1. **Handler function reference** — a real function smuggled through the SDK-shaped `Code.ZipFile`
   input with the same `Uint8Array` "stowaway" trick used by simulated CloudFront Functions:

   ```typescript
   new CreateFunctionCommand({
     FunctionName: "greeter",
     Role: "arn:aws:iam::111111111111:role/GreeterRole",
     Code: {
       ZipFile: makeLambdaZipFileInput(
         async (event: { name: string }) => `Hello ${event.name}`,
       ),
     },
   });
   ```

2. **Real zip archive bytes** on `Code.ZipFile`. `makeLambdaCodeZip(...)` builds real zip bytes
   from a source string (becoming `index.js`, like CloudFormation inline `ZipFile` source) or from
   a files map (like a bundled deployment package). Bytes that are not a zip archive fail with the
   AWS-like `InvalidParameterValueException: Could not unzip uploaded file`.

3. **A zip object in sim S3** via `Code.S3Bucket`/`S3Key`. The fetch goes through the sim S3
   GetObject operation as the creating caller, so simulated IAM applies to the code object, and S3
   lookup failures are wrapped AWS-style (`Error occurred while GetObject. S3 Error Code:
NoSuchKey. ...`). `S3ObjectVersion` is accepted but ignored, as sim S3 has no object versioning
   yet. A standalone `SimLambda` has no sim S3; `SimAws`-created Lambda wires the same-scope sim S3
   automatically (real Lambda requires a same-region code bucket).

`function/code/` owns this: `lambda-code-source.ts` validates the `Code` input into a discriminated
source, `sim-lambda-code-resolver.ts` resolves it into executable code (fetching S3 code and
checking zip validity at creation time, as real AWS does), and `store/` holds the sim S3-backed
code store behind a narrow interface.

### The vm runtime

Zip-sourced code runs in a Node.js `vm` context (`function/code/vm/`), like simulated CloudFront
Functions run their function code. `SimLambdaVmZipCode` mirrors real cold start semantics: the
module is imported once, on first invocation, and module state stays warm across invocations.
Import and handler problems surface as invocation errors with the real runtime errorTypes —
`Runtime.ImportModuleError`, `Runtime.HandlerNotFound`, `Runtime.UserCodeSyntaxError`,
`Runtime.MalformedHandlerName` — rather than failing creation.

`SimLambdaVmModules` provides a CommonJS module system over the archive: relative requires between
archived files, Node.js built-ins from the host (as the real runtime provides them), and a minimal
`node_modules` lookup for dependencies bundled into the archive. The `Handler` string selects the
module and export (`index.handler`, `src/app.handler`). ES module source is not supported yet and
fails with a clear hint. The sandbox exposes common globals and an AWS-like `process.env` with the
standard runtime variables.

### Runtime-provided AWS SDK

Like the real Lambda Node.js runtime, the simulated runtime provides AWS SDK v3 packages without
them being bundled in the code archive: `require("@aws-sdk/client-s3")` (and other `@aws-sdk/*`
packages installed in the host project) resolves to the real host module with its client classes
intercepted into the owning simulated AWS environment. Calls the function code makes are routed
per send with the function's execution role as the caller, so simulated IAM authorizes them just
like real Lambda execution roles. A client constructed without a region defaults to the function's
Account/Region scope, as the real runtime's `AWS_REGION` provides; an explicit region wins.

The archive always takes precedence: a package bundled under the archive's `node_modules/` is used
as-is, uninstrumented. Interception is per client instance (`function/code/vm/sdk/`,
`src/sdk/module/`), so the host package's classes are never patched globally. A standalone
`SimLambda` constructed outside `SimAws` has no simulated environment to route to; SDK requires
fail with `Runtime.ImportModuleError` and guidance to wire a `vmSdkModuleProvider` or bundle the
package.

Note that the `vm` context is a namespacing convenience, not a security boundary: function code
runs in-process with the same trust as the test suite itself, in keeping with the simulator's
in-process, Docker-free design. Do not run untrusted code through the simulator.

The zip support itself is a dependency-free reader/writer pair in `src/util/zip/`, so archives
interoperate with real tooling in both directions.

### Handler typing and completion styles

`function/sim-lambda-handler.type.ts` defines `SimLambdaHandler` and `SimLambdaContext` as minimal
structural equivalents of the `aws-lambda` typings package's `Handler` and `Context`, so real typed
handlers can be passed in unchanged. `SimLambdaHandlerRunner` mirrors the Node.js runtime's
completion styles: returning a promise, returning a plain value synchronously, calling the
callback, or using the legacy context `done`/`fail`/`succeed` methods.

## Invocation

`InvokeCommand` supports the three AWS invocation types:

- `RequestResponse` (default): parses the JSON payload into the handler event, awaits the handler,
  and returns the JSON-serialised result as the response payload. A handler error is reported
  AWS-style with `FunctionError: "Unhandled"` and an error document payload rather than a thrown
  error.
- `Event`: returns `202` immediately and runs the handler asynchronously via the
  `BackgroundScheduler`; handler errors are dropped (failure destinations are not simulated yet).
- `DryRun`: returns `204` without invoking the handler.

### Execution role

Creating a function requires an execution `Role` ARN, as on real AWS. While a handler runs,
`SimLambdaFunction.invoke` uses the ambient caller mechanism
(`src/service/aws/caller/sim-aws-run-as-context.ts`) to run the handler with the execution role as
the ambient simulated caller for the owning `SimAws` instance. Simulated AWS operations performed
inside the handler — including SDK commands routed through `SimSdk` interception — are therefore
attributed to the execution role and evaluated against simulated IAM, just like real Lambda
execution roles.

A standalone `SimLambda` (constructed directly rather than through `SimAws`) is its own run-as
owner, keeping its ambient callers isolated.

## IAM authorization

Command handlers authorize with per-command authorizers against the function ARN, using the
account-scoped simulated IAM implementation when constructed through `SimAws`
(`lambda:CreateFunction`, `lambda:GetFunction`, `lambda:InvokeFunction`), with the same
allow-all fallback as other services for direct standalone construction.

## CloudFormation

`cfn/` owns `AWS::Lambda::*` resource creation, following the shared per-service factory pattern
(see `src/service/cloudformation/README.md`). `SimLambdaCloudFormationResourceFactory` is exposed
via `SimLambda.cfnResourceFactory()` and resolved by the generic CloudFormation engine, so
deploying a template containing `AWS::Lambda::Function` creates a real `SimLambdaFunction`,
reachable afterwards through `simAws.lambda()` and invokable via the SDK `InvokeCommand`.

Supported `AWS::Lambda::Function` properties: `FunctionName` (defaults to the logical ID), `Role`
(typically a `Ref`/`Fn::GetAtt` to a same-stack `AWS::IAM::Role`), `Code`, `Handler`, `Runtime`,
`Description`, `Timeout`, and `MemorySize`. Malformed property values fail AWS-style with a
`TypeError` naming the property and logical ID.

Template `Code` supports two source forms:

- **Inline `ZipFile` source string** — packaged into a single-module `index.js` zip with
  `makeLambdaCodeZip(...)`, mirroring how real CloudFormation packages inline source.
- **`S3Bucket`/`S3Key`** — passed through to the CreateFunction handler, which fetches the code
  zip from same-scope sim S3.

The handler-reference stowaway trick stays SDK-only: template values are JSON, so a `Uint8Array`
cannot appear in a template `Code.ZipFile`. Inline template code does not need it to reach AWS:
the vm runtime provides `@aws-sdk/*` packages routed to the owning simulated environment (see
"Runtime-provided AWS SDK" above), so a CDK `Code.fromInline` function can read sim S3 as its
execution role.

### Executable bindings

Deploy-time `bindings` (shared with simulated CloudFront Functions — see
`src/service/cloudformation/bind/`) let `deployTemplate`/`deployTemplateFile` back an
`AWS::Lambda::Function` with a real in-process handler instead of template code. The
`SimCfnLambdaFunctionCreator` swaps the bound handler in through the same stowaway code input the
SDK path uses, so execution-role attribution and invocation behaviour are identical, tests can
close over test state, and handlers can be stepped through in a debugger. Bindings target the
logical ID (or CDK construct ID), the function name, or the function ARN; a bound function may
omit template `Code` and `Handler`. Unbound functions keep their template code on the vm path.

`Ref` on the function returns the function name and `Fn::GetAtt` exposes `Arn`, implemented by the
`SimLambdaFunctionCfn` value adapter under
`src/service/cloudformation/resource/cfn/lambda/`, keeping the function model free of
CloudFormation concerns.

Other `AWS::Lambda::*` resource types (`Version`, `Alias`, `Permission`, `EventSourceMapping`, ...)
are not supported and are skipped by the CloudFormation engine with an "Unsupported" diagnostic.

## Not simulated yet

- `AWS::Lambda::*` CloudFormation resource types other than `AWS::Lambda::Function`
- ES module function code (`.mjs` / `export` syntax) in the vm runtime
- container image functions (`Code.ImageUri`) — the simulator stays Docker-free
- `UpdateFunctionCode`, versions, aliases and qualifiers
- Lambda Layers
- environment variable configuration (`Environment.Variables`)
- timeouts interrupting handler execution
- asynchronous invocation retries and failure destinations
