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
- `publish-version/`, `list-versions-by-function/`
- `create-alias/`, `update-alias/`, `get-alias/`, `list-aliases/`, `delete-alias/`
- `event-source-mapping/`

Commands sharing a set of collaborators are grouped behind one class per area — `command/function/`,
`command/function-url/`, `command/permission/`, `command/version/`, `command/alias/`,
`command/event-source-mapping/` — so the `SimLambda`
facade stays a delegation rather than repeating the same wiring block per command.
`command/sim-lambda-command.types.ts` gathers the command types for the same reason.

The main `SimLambda` class delegates command execution to handlers rather than keeping command
handling logic inline. `sim-lambda-commands.ts` holds the wiring of those command areas, so the
facade itself is state and delegation and nothing else.

## Function model

Function state lives under `function/`.

`function/policy/` holds a resource-based policy: a map of `SimLambdaPermission` statements keyed by
`StatementId`, which is how `AddPermission` and `RemovePermission` address them. `AddPermission` is
a shorthand for writing a policy statement, so the permission holds the parts it was given and
expands them into a statement on demand, rather than storing a statement nothing can address. A
policy survives exactly as long as the thing it is granted on does, and it is this Account's half of
admitting a principal from another Account: the other half is that Account's own identity policy,
which IAM asks it for.

A function, each of its published versions and each of its aliases holds one of these.
`SimLambdaPolicyResource` is the interface the three share, an ARN and a policy. Real Lambda holds a
policy per qualified resource. A grant made on the alias `live` decides a call on `live`, and the
version behind it needs a grant of its own.

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

The sandbox has writable standard streams (`SimLambdaVmOutputStream`), and its `console` is built
over them as the real runtime's is. Both matter: a library that builds its own console over
`process.stdout` and `process.stderr` rather than using the global one, as AWS Lambda Powertools'
logger does at module scope, throws `ERR_CONSOLE_WRITABLE_STREAM` at import without the streams and
never runs. What is written is both recorded into the function's log group and forwarded to the
matching host stream, so a handler's output arrives in simulated CloudWatch Logs whether it printed
through the console or wrote to the stream itself. Powertools' metrics print their EMF document to
standard output, so that is where a test reads the metrics a handler emitted too.

## Recording handler output

`function/logging/` is where an invocation's output becomes log events.

`SimLambdaFunctionLogging` is what a function holds. It exists so the function does not have to
carry both the case where something is recording and the case where nothing is: a function built
standalone, outside a SimAws instance, still reports a group and stream name to its handler, because
real Lambda derives both from the function and its execution environment whether or not the group
exists. Both names are settled once, on the first invocation, which is what an execution environment
cold starting does; Yulin never recycles one, so a function keeps its stream for as long as it
exists.

The recording is on the streams rather than on the sandbox console built over them, which is what
makes a logger that builds its own `Console` over `process.stdout` reach the log group as well.
`SimLambdaLogWriter` splits what arrives into lines, because a line is what a log event is, and
holds back whatever follows the last newline until the write that completes it, so a line written in
two calls is one event rather than two. What is still unterminated when the invocation ends is
recorded then, whether the handler returned or threw.

`SimLambdaExecutableCode.recordOutputTo` is the seam. `SimLambdaVmZipCode` passes the sink to the
sandbox streams; `SimLambdaHandlerReferenceCode` implements it as a no-op, because a referenced
handler is an ordinary function closing over the test's own module scope and has no streams of its
own to tee. Capturing the host stream is still how a test asserts on one of those.

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
`util/process/sim-process-environment.ts` bridges that with `AsyncLocalStorage`: `process.env` is a plain
configurable data property on `process`, so it is redefined once as a getter that resolves to the
current invocation's variables while one is set, and to the untouched host environment object
otherwise. The store follows the invocation across `await` points and keeps concurrent invocations
apart, which swapping and restoring `process.env` around the handler call could not.

This is the only place the simulator patches a process global, so it is deliberately narrow. The
patch is only installed when a function, or a simulated ECS container, actually declares variables,
it is inert whenever no invocation is running, and it is never removed, since removing it would be unsafe while another
invocation is in flight and buys nothing. It lives under `util/` rather than here because simulated
ECS applies a container's environment variables through the same object: two patches would each
install a getter, and the second would capture whatever the first was reporting as its host
environment.

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

### The HTTP clients function code reaches for

`function/outbound/` owns what happens when function code makes an HTTP request.

`SimLambdaOutboundHttp` is the seam, and it asks two questions rather than one. `serves(hostname)`
decides whether the simulation is answering, and `fetch(request)` answers. They are separate
because a client decides before it has a request to send. `http.request` hands back a stream that
is written to long before there is a body, and the hostname is all there is to decide on.

`makeSimLambdaOutboundHttp` (`sim-lambda-outbound-http.factory.ts`) builds the one a `SimAws`
gives its functions, and it answers for two kinds of hostname. A hostname simulated Route53
resolves goes through `SimAwsHttp`, the same in-process entry point a request arriving on localhost
takes, which is what makes a Cognito user pool domain, an HTTP API and a load balancer all reachable
without Lambda knowing which of them it is. An AWS service API endpoint goes to
`SimSdkWireDispatcher` (`SimLambdaAwsApiOutbound`) for the requests that carry a serialized
Command. Resolution is asked first, since a load balancer's own `.elb.amazonaws.com` name ends in a
service API suffix while naming something served over HTTP.

A service API endpoint also serves documents over plain HTTP, and a user pool's JWKS is the one a
handler asks for. `isSimAwsApiRequest` is the test that separates the two, on the operation header
of the AWS JSON protocol and the SigV4 credential scope, since a client fetching a published
document carries neither. What is left goes to `SimAwsHttp` under the local hostname
`SimAwsLocalUrl` rewrites the endpoint to, which is the name simulated Route53 knows it by. An
endpoint nothing resolves for falls back to the wire dispatcher. A request that cannot be routed is
then refused with `SimSdkUnbridgedWireRequestError`, in place of a 501 naming a local hostname
nobody asked for.

The factory is a module of its own for the reason `makeSimCfCustomOriginDispatcher` is: `SimAwsHttp`
reaches every simulated service, and the service that reaches it back is wired from
`src/service/aws/factory/`.

Three clients reach that seam. `makeSimLambdaHttpModule` replaces `request` and `get` on a
`node:http` or `node:https` module, keeping everything else the module exports, and
`makeSimLambdaOutboundFetch` wraps a `fetch`. Where they are installed follows the same split as
the clock and the environment variables. Sandboxed zip code is handed all three by the sandbox
(`makeSimLambdaVmContext` for `fetch`, `SimSdkLambdaVmModuleProvider` for the transport modules).
A real in-process handler reads the process globals, so `invoke/sim-lambda-process-outbound.ts`
holds the invocation's outbound HTTP in an `AsyncLocalStorage` store and
`invoke/sim-lambda-outbound-clients.ts` patches `globalThis.fetch` and the two transport modules to
resolve through it. Both patches are installed on the first invocation of an in-process handler and
report no served hostname while the store is empty, which leaves the process as it was for
everything else. `syncBuiltinESMExports()` follows the module patch, so a handler that imported
`request` by name rather than the module reaches the patched one.

`invoke/sim-lambda-host-scope.ts` is where the clock and the outbound HTTP are applied together,
since `SimLambdaExecutableCode.runsInHostScope` decides both.

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

## Versions and aliases

`function/version/` holds what `PublishVersion` and the alias commands act on.

A published version is a copy of the function as it stood, made by
`SimLambdaFunction.publishedAs(...)`. The copy carries the same code, handler, timeout, memory and
environment, under a version number and a qualified ARN. It is a copy rather than a second reference to the function so
that a later change to the function leaves what was published running what it was published as,
which is the whole point of publishing one.

Versions and aliases live in `SimLambdaFunctionVersionStore` and `SimLambdaFunctionAliasStore`,
beside the function map rather than on the function itself. That is what keeps a bare function name
resolving to `$LATEST` for every caller that passes no qualifier, which is most of them.
`DeleteFunction` forgets both, as deleting a function on AWS takes its versions and aliases with it.

A request names the version to act on in one of two places. It carries a `Qualifier` of its own, or
a qualifier appended to the `FunctionName`, which may be a name or a function ARN.
`simLambdaQualifiedFunctionOf` reads both and refuses a request that states one of each and
disagrees with itself, as real Lambda does. `Invoke` and `GetFunction` resolve the qualifier
through the version store. A number is a version, anything else is an alias name, and `$LATEST` or
nothing at all is the function. A qualifier naming neither fails with `ResourceNotFoundException`
against the qualified ARN.

`PublishVersion`, `ListVersionsByFunction` and the alias commands act on the function itself, and
`simLambdaUnqualifiedFunctionOf` refuses a qualified `FunctionName` for them. Dropping the qualifier
would act on something other than what the caller named.

An alias points at a published version and only at one: `$LATEST` is refused on the API-level
version pattern, before anything of that name is looked for. Invoking through an alias reports the
version number it resolved to as `ExecutedVersion`, not the alias name, and the handler's context
carries the same number and the qualified ARN.

Authorization is against the resource the request named, and so is a grant. `AddPermission`,
`RemovePermission` and `GetPolicy` take a `Qualifier` of their own, and `requireResource` on the
version store answers with the resource it names. An alias answers as itself there, where `require`
carries on to the version behind it. Resolving the alias first would put the version's policy in
front of a request made against the alias. `Invoke` reaches the same resource through
`findResource`. It tolerates a function that is absent, since a request naming one is authorized
before it is reported missing.

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

Polling a queue is not Lambda's own. `SimSqsQueuePoller`, in sim SQS under `poll/`, is the whole
receive-hand-over-delete loop, and a mapping is one of the things that consumes a queue through it;
a long-running ECS container is the other. `SimLambdaSqsEventSourceConsumer` is the Lambda half:
it answers each poll with the session it runs in, which is the function to deliver to, the execution
role to poll as, and the batch size the mapping was created with. A mapping still being created, a
disabled one, and one whose function has gone all answer with no session, so the poll does nothing
and the next one picks up where it left off. `SimLambdaEventSourcePollerFactory` is what wires the
two together, so a mapping still hands `SimLambdaEventSourcePollers` something with `watch`,
`pollNow` and `stop` on it, whichever kind of source it names.

What the shared poller does with a queue, and when, is described in
[the sim SQS README](../sqs/README.md). What is worth knowing here is that a message moved to a
dead-letter queue announces itself the same way an ordinary send does, so a mapping on a dead-letter
queue is polled too.

`queue/` is what is left of the port onto SQS. `SimSqsEventSourceQueues` extends the shared
`SimSqsCommandPollQueues` with the one thing that is Lambda's: real Lambda reads the source when a
mapping is created, and reports a queue it cannot find as an invalid event source rather than as an
SQS error. A standalone `SimLambda` has no sim SQS, and `SimLambdaNoEventSourceQueues` refuses with
guidance rather than silently delivering nothing. `SimLambdaSqsEventSourceArn` is the SQS member of
the event source ARN union: it reads a queue ARN into the URL requests name it by and the Region
event records report, and carries the queue's own polling permissions and batch size rules.

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

### Event source events without an event source

`factory/lambda-sqs-event.factory.ts` and `factory/lambda-dynamodb-stream-event.factory.ts` export
the record and event factories for the two shapes above, for a test that calls the handler directly
rather than creating a mapping. Both are a `DynamicFactory` for one record plus
`SimRecordsEventFactory` (`src/util/factory/`) for the event carrying them, which is the pattern
every record-carrying event here follows: the event factory completes each partial record a test
gives it, because merging overrides replaces a list whole and would otherwise hand the handler
records with one field in them.

The record defaults are computed from what the test said, so a made record is one the source could
have delivered: the SQS one digests the body it was given and reads its Region out of the queue ARN,
and the DynamoDB one carries the images its event name implies and names the view type after the
images that end up there (`factory/lambda-dynamodb-stream-record-change.ts`).

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

`SimLambdaStreamBatchResponse` is what a report from the function does to that checkpoint, and it is
a sibling of `SimLambdaSqsBatchResponse` rather than a reuse of it. A queue partitions the batch,
because each message is deleted or returned on its own. A stream holds one place, so the answer is
one place: `SimLambdaStreamBatchOutcome` is either the batch finished with or the sequence number to
go back to, which is the lowest one the report named. Everything from there is delivered again,
including the records after it that the function handled. Partitioning a stream batch the way a
queue batch is partitioned would checkpoint past records the function never reached and lose them
with no error. Reading the report itself is shared with the queue in `SimLambdaBatchItemFailures`,
and so is the defence that a report naming something outside the batch fails the whole batch.
`SimLambdaStreamRetryBackoff` is why the wait is strictly positive and why the attempts are counted.
A retry scheduled at the instant the clock already reads falls due inside every interval
`advanceBy` walks, so a handler that always throws would never let it return, and both that trap and
its guard tests are in
[issue 341](https://github.com/KensioSoftware/yulin/issues/341).

Two polls must never overlap, which a queue mapping does not have to care about: a received message
is hidden and a read record is not, so a second poll from the same checkpoint would deliver the same
records twice. `SimLambdaEventSourcePollTurn` is the one-at-a-time guard, and it reschedules from
its `finally` block rather than dropping a poll that was asked for mid-turn, because `PollSchedule`
clears its own flag when the task starts.

`SimLambdaStreamCascadeGuard` is what stops a function writing back into the table whose stream
invoked it. The delivery runs inside an asynchronous context
(`sim-lambda-event-source-delivery-context.ts`), so a record written by the handler is told apart
from one written by anything else that happened to be running at the same time. Several items
written in one `Promise.all` by a test, or by anything other than this mapping's own handler, are an
ordinary batch. Writes the handler itself makes to its own source are the loop, however many of them
it makes and however it makes them, and are refused with `SimLambdaStreamCascadeError` once the
delivery is over rather than left to spin.

`SimDynamoDbEventSourceStreams` implements the port over the DynamoDB Streams commands, as the
execution role. `SimDynamoDbEventSourceStreamShard` is the part that finds the table and the shard,
including the shard iterator a place is read from, and `SimDynamoDbEventSourceStreamReader` reads
the records. `sim-dynamodb-event-source-stream-positions.ts` translates between the places a mapping
holds and what `GetShardIterator` is asked for: a mapping sent back by a failure report asks with
`AT_SEQUENCE_NUMBER`, since the record it named is one the function is to be given again rather than
one it is finished with. The port is SDK-shaped for the same reason the Streams API exists at
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

`sim-lambda-url-invoke-actions.ts` holds the one exception to that split.
`cloudfront.amazonaws.com`, which is how a CloudFront origin access control reaches a Function URL
Origin, has to be allowed `lambda:InvokeFunction` on top of the URL action, and is refused without
it. That is real Lambda's rule, and CDK's `FunctionUrlOrigin.withOriginAccessControl` does not write
the second grant, so a CDK app that has not added it deploys clean and then answers 403 with no log
stream to look at. The refusal body is real Lambda's wording, since it is the only diagnostic such a
deployment gets.

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
for a handler error) are AWS-shaped JSON documents. The 403 body is real Lambda's wording; the other
two are approximations.

### Invocation events without a request

`factory/lambda-function-url-event.factory.ts` exports `lambdaFunctionUrlEventFactory`, which makes
the same events for a test that calls a handler directly rather than serving it.

Only the endpoint style lives here. The factory itself is
`src/serve/payload-2/sim-payload-2-event.factory.ts`, shared with the HTTP APIs that speak the same
format, and this service supplies what a Function URL calls itself: the URL id, the `lambda-url`
hostname, and `$default` for the route key and the stage whatever the request was. The proxy
headers and the comma-joined query parameters come from
`src/serve/payload-2/sim-payload-2-request-parts.ts`, the same code a served request builds them
with, so a made event does not drift from a delivered one.

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
`fn.addEventSource(new SqsEventSource(queue))` and `fn.addEventSource(new DynamoEventSource(table))`
emit. The properties this simulation has no behaviour for fail the resource rather than being
dropped, worded as an invalid resource so the engine does not skip it: a stack that deployed the
queue and the function and nothing between them would look like a working subscription.

The event source ARN is read before anything else about the Resource is judged, for the reason
`SimLambdaEventSourceMappingInput` reads it first: what a mapping may ask for is the source's own
rule. `StartingPosition` and `StartingPositionTimestamp` are read and passed on rather than judged
here, since a stream mapping has to have a position and a queue mapping is refused for naming one,
and only `CreateEventSourceMapping` knows which source the ARN names.

Other `AWS::Lambda::*` resource types (`Version`, `Alias`, ...) are not supported and are skipped by
the CloudFormation engine with an "Unsupported" diagnostic.

## Not simulated yet

- `AWS::Lambda::*` CloudFormation resource types other than `AWS::Lambda::Function`,
  `AWS::Lambda::Url`, `AWS::Lambda::Permission` and `AWS::Lambda::EventSourceMapping`
- event sources other than SQS queues and DynamoDB streams, `FilterCriteria`,
  `UpdateEventSourceMapping`, and polling concurrency
- Function URL `Cors` configuration and OPTIONS preflight handling
- `InvokeMode: RESPONSE_STREAM`, which is accepted and reported but always served buffered
- ES module function code (`.mjs` / `export` syntax) in the vm runtime
- running a container image: nothing reads one, so a function naming `Code.ImageUri` runs the real
  in-process handler an executable binding or a simulated ECR repository stands in with, and is
  skipped or refused where neither does
- `UpdateFunctionCode` and function listing
- `RevisionId` and `EventSourceToken` on the permission commands, qualified Function URLs, alias
  `RoutingConfig` weights, and provisioned concurrency
- version and alias operations over the served HTTP API endpoint, which routes the other sixteen
- Lambda Layers
- environment variables reaching a real in-process handler's module scope (see "Environment
  variables" above), and the same limitation for a time read there or a request made there
- outbound HTTP from any client other than `fetch`, `node:http` and `node:https`, and following a
  redirect the simulation answered with
- timers: `setTimeout` inside a handler is a host timer, not one the simulation's clock releases
- timeouts interrupting handler execution
- asynchronous invocation retries and failure destinations
