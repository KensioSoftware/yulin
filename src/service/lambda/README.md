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
- `create-function-url-config/`, `get-function-url-config/`,
  `update-function-url-config/`, `delete-function-url-config/`,
  `list-function-url-configs/`
- `add-permission/`, `remove-permission/`, `get-policy/`
- `event-source-mapping/`

Commands sharing a set of collaborators are grouped behind one class per area — `command/function/`,
`command/function-url/`, `command/permission/`, `command/event-source-mapping/` — so the `SimLambda`
facade stays a delegation rather than repeating the same wiring block per command.
`command/sim-lambda-command.types.ts` gathers the command types for the same reason.

The main `SimLambda` class delegates command execution to handlers rather than keeping command
handling logic inline. `sim-lambda-commands.ts` holds the wiring of those command areas, so the
facade itself is state and delegation and nothing else.

## Function model

Function state lives under `function/`.

`function/policy/` holds the function's resource-based policy: a map of `SimLambdaPermission`
statements keyed by `StatementId`, which is how `AddPermission` and `RemovePermission` address
them. `AddPermission` is a shorthand for writing a policy statement, so the permission holds the
parts it was given and expands them into a statement on demand, rather than storing a statement
nothing can address. The policy belongs to the function because it survives exactly as long as the
function does, and because it is this Account's half of admitting a principal from another Account:
the other half is that Account's own identity policy, which IAM asks it for.

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
fails with a clear hint. The sandbox exposes common globals and an AWS-like `process.env` holding
the standard runtime variables and any declared for the function (see "Environment variables"
below).

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

### Environment variables

`function/environment/` owns what a function runs with. `SimLambdaEnvironment` merges the
AWS-provided runtime variables with the ones declared through `Environment.Variables`, and is built
at creation time because vm zip code takes it into its sandbox. Name validation lives at
CreateFunction (`command/create-function/create-function-environment.ts`) and follows AWS's two
stages in order: the API name-pattern constraint (`ValidationException`), then the reserved names
real Lambda refuses to let function configuration override
(`InvalidParameterValueException`). Rejecting the reserved names means the AWS-provided runtime
variables and the declared ones can never collide, so neither set needs to win over the other.

Zip code needs nothing special: the vm context already owns its `process` object. A function backed
by a real in-process handler is the harder case, because that handler is a closure over its own
module scope and reads the host `process.env` like any other code in the test run.
`sim-lambda-process-environment.ts` bridges that with `AsyncLocalStorage`: `process.env` is a plain
configurable data property on `process`, so it is redefined once as a getter that resolves to the
current invocation's variables while one is set, and to the untouched host environment object
otherwise. The store follows the invocation across `await` points and keeps concurrent invocations
apart, which swapping and restoring `process.env` around the handler call could not.

This is the only place the simulator patches a process global, so it is deliberately narrow. The
patch is only installed when a function actually declares variables, it is inert whenever no
invocation is running, and it is never removed, since removing it would be unsafe while another
invocation is in flight and buys nothing.

The limitation it cannot reach is a read that already happened: a handler module doing
`const TABLE = process.env.TABLE_NAME` at module scope is evaluated when the test file imports it,
before any invocation. `SimLambdaEnvironmentConflicts` warns about that in the two cases where it
changes what the code sees, and stays quiet otherwise (see the usage docs section on reading
environment variables inside the handler).

### The clock function code reads

A function is given its simulation's clock, and the code it runs reads that clock rather than the
host's when it asks JavaScript for the time. `makeSimClockDate` (`src/util/clock/`) builds the
substitute: a `Proxy` over the host `Date` whose no-argument construction and `now()` read a
`SimClock`, and which passes everything else through. A Proxy rather than a subclass because
`Date.prototype` and `instanceof` have to keep meaning what they meant; a second Date identity
would quietly stop dates built elsewhere being recognised as dates.

Where it is installed follows the same split as environment variables, for the same reason.
Sandboxed zip code is simply handed the substitute as the sandbox's `Date`
(`makeSimLambdaVmContext`), touching nothing outside. A real in-process handler is a closure over
its own module scope, so `sim-lambda-process-clock.ts` substitutes the global `Date` and resolves
it through an `AsyncLocalStorage` store holding the invocation's clock, reporting the host time
whenever no invocation is running.

Two details in there are load-bearing. The store is read outside itself
(`AsyncLocalStorage.exit`) when consulting the invocation's clock, because a simulation's clock is
usually built on `new Date()` and would otherwise re-enter the substitute forever. And the patch is
installed lazily, on the first invocation of an in-process handler, so a test run using only zip
code never has its `Date` replaced at all: `Date` is a much busier global than `process.env`, so
`SimLambdaExecutableCode.runsInHostScope` decides which invocations need it.

`getRemainingTimeInMillis()` reads the same clock (`sim-lambda-invoke-context-builder.ts`), so a
stopped clock leaves a handler with a constant budget.

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

## Event source mappings

`event-source/` owns delivery from a simulated SQS queue or DynamoDB stream to a function.

The machinery is split by event source kind rather than assuming one.
`sim-lambda-event-source-arn.ts` reads the ARN a mapping names into a union discriminated by `kind`,
and that value carries what the rest of the machinery would otherwise have had to assume: the
service label a refusal names, the `{action, resource}` permissions the execution role is checked
for, the batch size rules the request is measured against (`SimLambdaEventSourceBatchRules`), and
whether the source has a starting position at all
(`SimLambdaEventSourceStartingPositionRules` — required for a stream, refused for a queue). It is
also the one place that decides which sources a mapping may name, so a refusal anywhere lists the
same supported set.

Real Lambda polls a queue continuously, and nothing in this simulation runs continuously, so the
queue says when there is something to poll for. `SimSqsQueueActivity` (in sim SQS) holds the
watchers on a queue, `SimSqsQueue.add` tells them a message has arrived, and
`SimLambdaSqsEventSourcePoller` schedules a poll in response. A message moved to a dead-letter queue
arrives the same way, so a mapping on a dead-letter queue is polled too.

`SimLambdaEventSourcePollSchedule` decides when that poll happens. A message that is receivable now
schedules a background task; one sent with a delay is scheduled for the instant it becomes
receivable; and a batch that came back is scheduled for the end of its visibility timeout, on the
clock, so advancing simulated time is what redelivers it. Scheduling a failed batch's retry on the
clock even for a zero visibility timeout is deliberate: a poll that ran straight back round would
spin on a batch the function keeps failing.

An announcement only reaches a mapping that was already watching, so a poll that finds nothing asks
the queue when its earliest hidden message comes back and schedules itself for then. That is what
delivers the messages a mapping was created alongside, rather than stranding a queue whose messages
were all in flight when the mapping was made.

`queue/` is the port onto SQS. `SimLambdaEventSourceQueues` is what polling needs from a queue, and
`SimSqsEventSourceQueues` implements it over the ordinary SQS commands, as the function's execution
role, so simulated IAM authorizes each poll the way real IAM does. A standalone `SimLambda` has no
sim SQS, and `SimLambdaNoEventSourceQueues` refuses with guidance rather than silently delivering
nothing. `SimLambdaSqsEventSourceArn` is the SQS member of the event source ARN union: it reads a
queue ARN into the URL requests name it by and the Region event records report, and carries the
queue's own polling permissions and batch size rules.

Creating a mapping checks what real Lambda checks before it will make one: that the event source
exists, and that the execution role may perform the operations polling it takes
(`SimLambdaEventSourceRolePermissions`, which reads those operations off the ARN — for a queue,
`ReceiveMessage`, `DeleteMessage` and `GetQueueAttributes`). Both failures are the mapping's, not
the poller's: a mapping that cannot poll looks like a working subscription and delivers nothing.

`poll/` holds what one poll does. `SimLambdaEventSourcePoller` is the three-method interface
(`watch`, `pollNow`, `stop`) the mapping's pollers are held behind, and
`makeSimLambdaEventSourcePoller` picks the one for the kind of source the ARN names.
`SimLambdaEventSourceDelivery` invokes the function directly rather than through the Invoke command,
because the handler error has to be seen: the asynchronous invoke path drops it, and this is what
decides whether the batch goes back on the source. It is handed the event builder and the batch
response rather than building them, since both are the source's own.

`SimLambdaSqsBatchResponse` reads what the function said about a batch of messages, including a
`batchItemFailures` report when the mapping was told to expect one, and returns the whole batch for
a report it cannot trust. Reading the report itself is shared in `SimLambdaBatchItemFailures`, which
is also where a malformed entry becomes an id no message has. `SimLambdaSqsEventBuilder` turns a
batch into the event's own shape, which is the lower-case record naming and the base64 binary
attribute values real AWS uses.

### DynamoDB streams

`stream/` is the port onto simulated DynamoDB, and `SimLambdaDynamoDbStreamEventSourcePoller` is a
sibling of the queue poller rather than a generalisation of it. Every step differs and the last one
inverts: a queue mapping polls again when a batch came back, because the batch is on the queue
waiting; a stream mapping polls again when a batch went through, because the records stay on the
stream either way and it is the checkpoint that moved.

`SimLambdaStreamProgress` holds that checkpoint (`SimLambdaStreamCheckpoint`, the shard iterator the
last read handed back) alongside the retry backoff and the poll schedule, because they are one
decision. A batch the function took moves the checkpoint and the mapping reads on. A batch it threw
on leaves the checkpoint where it is, so the same records are read again and nothing behind them is
delivered until they are through: that is a stream mapping blocking its shard.
`SimLambdaStreamRetryBackoff` is why the wait is strictly positive and why the attempts are counted.
A retry scheduled at the instant the clock already reads falls due inside every interval
`advanceBy` walks, so a handler that always throws would never let it return, and both that trap and
its guard tests are in
[issue 341](https://github.com/KensioSoftware/yulin/issues/341).

Two polls must never overlap, which a queue mapping does not have to care about: a received message
is hidden and a read record is not, so a second poll from the same checkpoint would deliver the same
records twice. `SimLambdaEventSourcePollTurn` is the one-at-a-time guard, and it reschedules from
its `finally` block rather than dropping a poll that was asked for mid-turn, because
`SimLambdaEventSourcePollSchedule` clears its own flag when the task starts.

`SimLambdaStreamCascadeGuard` is what stops a function writing back into the table whose stream
invoked it. The delivery runs inside an asynchronous context
(`sim-lambda-event-source-delivery-context.ts`), so a record written by the handler is told apart
from one written by anything else that happened to be running at the same time. Several items
written in one `Promise.all` are an ordinary batch; a handler feeding its own source is a loop, and
is refused with `SimLambdaStreamCascadeError` once the delivery is over rather than left to spin.

`SimDynamoDbEventSourceStreams` implements the port over the DynamoDB Streams commands, as the
execution role, and `SimDynamoDbEventSourceStreamShard` is the part that finds the table and the
shard and reads records off it. The port is SDK-shaped for the same reason the Streams API exists at
all: a bespoke read interface would be `GetRecords` under another name, and would not authorize.
The `SimLambdaEventSourceStreamService` and `SimLambdaEventSourceStreamActivity` interfaces are
declared here and satisfied structurally by `SimDynamoDb`, so neither service imports the other.

## Function URLs

`function/url/` owns Function URLs: `SimLambdaFunctionUrl` is the stored resource and
`SimLambdaFunctionUrlStore` holds one per function for an Account/Region scope. Creating one
allocates a URL id and builds the AWS-shaped endpoint from it:

```text
https://<url-id>.lambda-url.<region>.on.aws/
```

The URL id is the routing key, so it is allocated from `SimLambdaUrlRegistry` (`registry/`), which
maps ids to the Accounts that own them across one `SimAws` instance. A served request carries its
region in the hostname but not its Account, and Lambda state is per Account/Region, so without that
registry a Function URL host could not be resolved to a function. `SimCloudFrontRegistry` has the
same shape for a different reason: CloudFront is not region-scoped, whereas this registry exists
purely for the hostname-to-Account hop.

### Serving

`serve/` is the localhost HTTP side, reached through `serveSimAws` like the S3 and CloudFront
controllers. Routing goes through simulated Route53: `<url-id>.lambda-url.<region>` is a terminal
service target, with `SimAwsLocalUrl` dropping the real `.on.aws` tail exactly as it drops
`.amazonaws.com` from S3 endpoints, giving:

```text
http://<url-id>.lambda-url.<region>.sim-aws.localhost:<port>/
```

`SimLambdaUrlRouter` turns that target back into a Function URL and function, then
`SimLambdaServiceController` converts the request into a payload format 2.0 event and the handler
result back into a response. That conversion lives in `src/serve/payload-2/`, shared with simulated
API Gateway HTTP APIs, which speak the same format. `serve/event/sim-lambda-url-endpoint.ts` is this
service's half of it: what a Function URL calls itself, which is the URL id as the API id and
`$default` for both the route key and the stage. Payload format 2.0 is the only format real Function
URLs use, so there is no version to choose. Text bodies cross as strings and everything else as
base64, in both directions, decided by content type in `SimPayload2BodyEncoding`. A handler
returning a structured result (one carrying `statusCode`) controls the response, including `cookies`
becoming `set-cookie` headers; any other return value becomes a 200 JSON response, as on AWS.

A `NONE` auth URL is invokable by anyone on AWS, so its requests are not attributed to a simulated
principal and the controller invokes the function directly rather than through the Invoke command's
IAM path.

An `AWS_IAM` URL goes through `serve/auth/`, which evaluates `lambda:InvokeFunctionUrl` on the
function ARN against the caller the HTTP boundary resolved (`SimAwsServiceRequest.caller`, see
`src/service/iam/request/`). That is a different IAM action from the `lambda:InvokeFunction` the
Invoke command uses, as it is on AWS. The caller is passed to IAM as a `resolved` caller so an
assumed-role session is judged against the Role behind it; a request that carried no identity is
anonymous, owns no policies, and is denied by the same evaluation.

Authorization is evaluated by the IAM of the Account that owns the function, against two policy
sources: identity policies belonging to the caller, and the function's own resource policy, passed
in by `command/authorize/sim-lambda-resource-policies.ts`. For a caller from another Account, IAM
resolves that Account through the simulation's IAM registry and reads its identity policies from
there, then requires an allow from both sides — a resource policy on its own is not enough, exactly
as on AWS. The URL's auth type travels with the request as the `lambda:FunctionUrlAuthType`
condition value, which is what a Function URL grant conditions on.

Only an authorized `AWS_IAM` invocation is given a caller to describe in its event, which is what
puts `requestContext.authorizer.iam` there and leaves it out for `NONE`
(`src/serve/payload-2/sim-payload-2-iam-caller.ts`). Either way the function runs as its execution
Role: who invoked it and what it runs as are separate questions.

The endpoint's own error responses (403 for a denied caller, 404 for an unknown or deleted URL, 502
for a handler error) are AWS-shaped JSON documents, though the exact wording is an approximation.

### CloudFormation

`cfn/url/` creates `AWS::Lambda::Url`, which is what CDK's `Function.addFunctionUrl()` emits.
`TargetFunctionArn` accepts both an `Fn::GetAtt` ARN and a `Ref` function name, dropping any
version or alias qualifier. `Fn::GetAtt` exposes `FunctionUrl` and `FunctionArn`, and `Ref`
returns the endpoint URL, implemented by the `SimLambdaFunctionUrlCfn` value adapter alongside the
function's own adapter.

## IAM authorization

Command handlers authorize with per-command authorizers against the function ARN, using the
account-scoped simulated IAM implementation when constructed through `SimAws`
(`lambda:CreateFunction`, `lambda:GetFunction`, `lambda:InvokeFunction`, and the
`lambda:*FunctionUrlConfig*` actions), with the same allow-all fallback as other services for
direct standalone construction. The Function URL commands share one `FunctionUrlAuthorizer` taking
the action as a constructor value, since only the action name varies between them.

`command/authorize/sim-lambda-service-invoke-authorizer.ts` answers the other question: whether
another simulated service may invoke a function. The caller is a service principal, which owns no
identity policies, so the function's resource policy is the whole decision. The calling service
supplies what it knows about the invocation as condition values, `AWS:SourceArn` for what it is
invoking the function for and `AWS:SourceAccount` for the Account its own resource belongs to, and
gets a decision back rather than a thrown error, since what a refusal means is the calling service's
business. Simulated API Gateway calls it through `SimHttpApiInvokeAuthorizer`, which fills in the
`execute-api` ARN and the API's Account. This lives here rather than in the calling service because
who may invoke a function is Lambda's rule, and a second copy of it would drift.

## CloudFormation

`cfn/` owns `AWS::Lambda::*` resource creation, following the shared per-service factory pattern
(see `src/service/cloudformation/README.md`). `SimLambdaCloudFormationResourceFactory` is exposed
via `SimLambda.cfnResourceFactory()` and resolved by the generic CloudFormation engine, so
deploying a template containing `AWS::Lambda::Function` creates a real `SimLambdaFunction`,
reachable afterwards through `simAws.lambda()` and invokable via the SDK `InvokeCommand`.

Supported `AWS::Lambda::Function` properties: `FunctionName` (defaults to the logical ID), `Role`
(typically a `Ref`/`Fn::GetAtt` to a same-stack `AWS::IAM::Role`), `Code`, `Handler`, `Runtime`,
`Description`, `Timeout`, `MemorySize`, and `Environment`. Malformed property values fail AWS-style
with a `TypeError` naming the property and logical ID, down to the individual variable for
`Environment.Variables`.

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

`cfn/event-source-mapping/` creates `AWS::Lambda::EventSourceMapping`, which is what CDK's
`fn.addEventSource(new SqsEventSource(queue))` emits. The properties this simulation has no
behaviour for fail the resource rather than being dropped, worded as an invalid resource so the
engine does not skip it: a stack that deployed the queue and the function and nothing between them
would look like a working subscription.

Other `AWS::Lambda::*` resource types (`Version`, `Alias`, ...) are not supported and are skipped by
the CloudFormation engine with an "Unsupported" diagnostic.

## Not simulated yet

- `AWS::Lambda::*` CloudFormation resource types other than `AWS::Lambda::Function`,
  `AWS::Lambda::Url`, `AWS::Lambda::Permission` and `AWS::Lambda::EventSourceMapping`
- event sources other than SQS queues and DynamoDB streams, `FilterCriteria`,
  `UpdateEventSourceMapping`, `ReportBatchItemFailures` for a stream, and polling concurrency
- Function URL `Cors` configuration and OPTIONS preflight handling
- `InvokeMode: RESPONSE_STREAM`, which is accepted and reported but always served buffered
- ES module function code (`.mjs` / `export` syntax) in the vm runtime
- container image functions (`Code.ImageUri`) — the simulator stays Docker-free
- `UpdateFunctionCode`, versions, aliases and qualifiers
- Lambda Layers
- environment variables reaching a real in-process handler's module scope (see "Environment
  variables" above), and the same limitation for a time read there
- timers: `setTimeout` inside a handler is a host timer, not one the simulation's clock releases
- timeouts interrupting handler execution
- asynchronous invocation retries and failure destinations
