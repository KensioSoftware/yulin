# Simulated Lambda

Yulin includes a simulated AWS Lambda service for tests and local development. Functions are created
and invoked in-process and in memory, with no containers and no real AWS infrastructure.

Handlers run with their execution role as the simulated caller, so AWS calls made inside a handler
are authorized by simulated IAM, as on real Lambda.

Lambda-specific helpers are imported from the `@kensio/yulin/lambda` subpath. Real `LambdaClient`
instances can be routed into sim Lambda with
[SDK interception](../../sdk/ "Simulated AWS SDK interception docs").

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

Handlers use the same signature as real Node.js Lambda handlers, `(event, context, callback)`. All
the real completion styles work: returning a promise, returning a plain value, calling the callback,
or the legacy context `done`/`fail`/`succeed` methods. Typed handlers written against the
`aws-lambda` typings package can be passed in unchanged.

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
- The sandbox provides writable `process.stdout` and `process.stderr`, with its `console` built
  over them, as the real runtime does. See [What a handler prints](#what-a-handler-prints).
- Import and handler problems surface as invocation errors rather than failing creation, with the
  real runtime error types (`Runtime.ImportModuleError`, `Runtime.HandlerNotFound`,
  `Runtime.UserCodeSyntaxError`, `Runtime.MalformedHandlerName`).

Code is CommonJS, as zipped `.js` files are on the real `nodejs` runtimes; ES module source
(`export` syntax) is not supported yet and fails with a clear hint. `Code.ZipFile` bytes that are
not a real zip archive are rejected at creation with the AWS-like
`InvalidParameterValueException: Could not unzip uploaded file`.

The archives are real zip files, so they interoperate with real tooling in both directions: a zip
built by any other tool works as `Code.ZipFile` input, and `makeLambdaCodeZip` output can be
unzipped normally.

### What a handler prints

The sandbox has writable standard streams, so `process.stdout.write(...)` and
`process.stderr.write(...)` work inside a handler, and its `console` is built over them as the real
runtime's is. A logging library that builds its own console rather than using the global one works
too:

```javascript
const { Console } = require("node:console");
const logger = new Console({ stdout: process.stdout, stderr: process.stderr });
```

That is what AWS Lambda Powertools' `Logger` does, at module scope, so a bundled Powertools handler
runs here. Its `Metrics` writes its embedded metric format document to standard output, so the
metrics a handler emitted can be read back the same way its log lines can.

What a handler prints is recorded into the function's log group in
[simulated CloudWatch Logs](../logs/ "Simulated CloudWatch Logs usage docs"), at
`/aws/lambda/<function name>`, so a test asserts on it by searching that group rather than by
capturing process output:

```typescript
const found = await simAws.logs().filterLogEvents(
  new FilterLogEventsCommand({
    logGroupName: "/aws/lambda/orders",
    filterPattern: "ERROR",
  }),
);
```

One line becomes one log event, as it does in an account, so a handler printing a multi-line object
gets several events and a search for one of those lines finds it. EMF metric documents go to the
same place, since Powertools' `Metrics` writes them to standard output.

Each invocation also reaches the matching host stream, standard output to standard output and
standard error to standard error, which is where a test or a `pnpm run dev` session already sees
output. That is a tee rather than a redirect: real Lambda sends output to CloudWatch Logs and
nowhere else, but a test tool that swallowed it would make a failing test harder to debug than it is
with none of this.

`context.logGroupName` and `context.logStreamName` name the group and stream that were actually
written to, and stream names use the real `YYYY/MM/DD/[$LATEST]<hash>` format. The hash identifies
the execution environment rather than the request, so match the shape rather than the value.

Only zip-packaged code is recorded. A function backed by a handler function reference, including one
bound to a container image, is an ordinary function closing over the test's own module scope: its
`console.log` reaches the host console directly, and there is nothing to intercept without patching
a global the whole test run shares. Capturing the host stream is still the way to assert on one of
those.

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
being intercepted, and reaches the simulation through the transport below instead.

### Function code that bundles the SDK

Some deployment packages inline the SDK rather than relying on the runtime to provide it, which is
what CDK's `NodejsFunction` does when given `bundling: { externalModules: [] }`. There is then no
`@aws-sdk/*` module left for the runtime to provide, so nothing to intercept.

Those functions reach the simulation anyway. The runtime provides their HTTP transport, `node:http`
and `node:https`, and a request addressed to an AWS API endpoint is answered from the same
simulated services, as the same execution role, instead of going to the network. The execution
role credentials are in the function's environment, as real Lambda puts them there, so the SDK
resolves credentials without looking outside the sandbox rather than failing with
`CredentialsProviderError`.

A serialized request states which operation it is and carries its input for the services using the
AWS JSON protocol, which is what can be read back without the operation's schema:

ACM, CloudWatch Logs, Cognito Identity Provider, DynamoDB, DynamoDB Streams, ECS, EventBridge, KMS,
Rekognition, Secrets Manager, SQS and SSM.

A bundled call to any other simulated service, such as S3, SNS, SES or Lambda itself, fails with an
error naming the service rather than reaching it. Leaving the SDK out of that archive puts it back
on the module interception path above, which every simulated service is reachable through.

Values the JSON protocols encode travel in their encoded form: a binary attribute written through a
bundled SDK is stored base64-encoded and decodes correctly when the same path reads it back, but an
in-process intercepted client reading it sees the encoded string rather than the bytes.

Only service API endpoints are answered this way. A request to the endpoint of one resource, such
as a Lambda Function URL or an API Gateway HTTP API, is an ordinary HTTP request rather than a
serialized Command, and goes wherever it was addressed.

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

## Triggering a function from an SQS queue

An event source mapping connects a [simulated queue](../sqs/ "Simulated SQS docs") to a function.
Messages sent to the queue are delivered to the handler as an SQS event, with the `Records` shape
real Lambda uses.

Polling runs on the simulation's background scheduler, so a test awaits
`simAws.backgroundTasksComplete()` and then asserts, rather than sleeping.

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
package, so a handler already written against those can be passed in unchanged. `SenderId` is not
reported, because a simulated caller has no user or role id to report it as.

Creating the mapping checks two things real Lambda checks: that the queue exists, and that the
function's execution role is allowed `sqs:ReceiveMessage`, `sqs:DeleteMessage` and
`sqs:GetQueueAttributes` on it. A role missing one of them fails with
`InvalidParameterValueException` naming the operation, rather than leaving a mapping that quietly
delivers nothing.

`GetEventSourceMappingCommand`, `ListEventSourceMappingsCommand` and
`DeleteEventSourceMappingCommand` read and remove mappings. A mapping is `Creating` when the command
returns and `Enabled` once the simulation has caught up, as on real Lambda. Deleting it stops the
polling.

### When the handler fails

A handler that returns normally has handled the batch, and the messages are deleted from the queue.
A handler that throws returns the whole batch: the messages stay on the queue, hidden until their
visibility timeout lapses, and are delivered again after that. Advancing the simulation's clock is
what brings them back:

```typescript
await simAws.clock().advanceBy({ seconds: 31 });
```

A queue with a `RedrivePolicy` eventually gives up on a message the handler keeps throwing on and
moves it to the dead-letter queue, exactly as it would for any other failing consumer. See
[dead-letter queues](../sqs/#dead-letter-queues "Simulated SQS dead-letter queue docs").

The handler error itself is not reported to whoever sent the message, as it is not on real AWS. What
the sender sees is the message coming back.

### Reporting individual message failures

A queue mapping created with `FunctionResponseTypes: ["ReportBatchItemFailures"]` takes the
`batchItemFailures` list the handler returns: the message ids named in it go back to the queue, and
the rest of the batch is deleted. A stream mapping takes the same list and does something else with
it, which is [reporting individual record failures](#reporting-individual-record-failures).

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
report it cannot trust. So does an entry with no `itemIdentifier`. A handler that returns nothing,
or an empty `batchItemFailures` list, has handled the whole batch.

### Making an SQS event without a queue

A test of the handler on its own, with no queue and no mapping, still has to pass it a whole event.
`lambdaSqsEventFactory` makes one, and `lambdaSqsEventRecordFactory` makes the records in it, so
such a test says what the messages carry and nothing else:

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
simulated mapping reports. Two fields a record repeats are computed from the rest: `md5OfBody` is
the digest of the body given, which is what a handler checking the digest compares against, and
`awsRegion` is the Region of the queue ARN given.

Reporting individual failures is worth testing against a made event too: the handler's
`batchItemFailures` name `messageId` values, and those are the ids of the records the factory made.

### Event source mappings in templates

`AWS::Lambda::EventSourceMapping` deploys the same thing, which is what CDK's
`fn.addEventSource(new SqsEventSource(queue))` emits. `EventSourceArn` and `FunctionName` accept the
`Fn::GetAtt` and `Ref` values a template gives them, `Ref` on the mapping returns its UUID, and
`Fn::GetAtt` exposes `Id` and `EventSourceMappingArn`. A queue mapping has no `StartingPosition`, and
a template naming one is refused. The same Resource deploys a
[stream mapping](#stream-mappings-in-templates), which has to have one.

## Triggering a function from a DynamoDB stream

An event source mapping also connects a [simulated table's stream](../dynamodb/#capturing-changes-with-a-stream "Simulated DynamoDB streams docs")
to a function. Changes to the table are delivered to the handler as a DynamoDB stream event, with
the `Records` shape real Lambda uses.

`StartingPosition` is required for a stream and is `TRIM_HORIZON` or `LATEST`. `TRIM_HORIZON` reads
what the stream still holds, so changes made before the mapping existed are delivered too. `LATEST`
reads only what the table changes from the moment the mapping starts reading. `AT_TIMESTAMP` is for
a Kinesis stream and is refused by name.

`BatchSize` says how many records one invocation may be given, and defaults to 100, which is what
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
`userIdentity: { type: "Service", principalId: "dynamodb.amazonaws.com" }`, which is how a handler
tells an expiry from a deletion the application asked for. The event lower-cases those two fields
where [the Streams API capitalizes them](../dynamodb/#reading-a-streams-records "Simulated DynamoDB Streams docs").

`SimLambdaDynamoDbStreamEvent` and `SimLambdaDynamoDbStreamEventRecord` are exported from
`@kensio/yulin/lambda` for typing a handler, and are minimal structural equivalents of the
`DynamoDBStreamEvent` and `DynamoDBRecord` types from the `aws-lambda` typings package.

A binary attribute reaches the handler as a base64 string rather than as bytes, which is what the
event carries on AWS: it arrives as JSON, and JSON has no bytes. `Buffer.from(value.B, "base64")`
therefore reads the same here as it does deployed. The
[Streams API](../dynamodb/#reading-a-streams-records "Simulated DynamoDB Streams docs") hands out
bytes for the same attribute, because its client decodes them. Nesting makes no difference: binary
inside a list or a map is encoded too.

Creating the mapping checks what real Lambda checks: that the stream exists, and that the function's
execution role is allowed `dynamodb:DescribeStream`, `dynamodb:GetRecords` and
`dynamodb:GetShardIterator` on it, plus `dynamodb:ListStreams` on `*`. Those four are what both the
AWS managed policy and CDK's own grant give a stream consumer. A role missing one of them fails with
`InvalidParameterValueException` naming the operation.

### When the handler fails

A stream is not a queue, and the difference shows here. A queue hands a message out and hides it, so
a batch the handler threw on is the queue's problem afterwards. A stream hands out a place, and the
mapping is the only thing that remembers it, so a batch the handler threw on is read again from
exactly where it was and nothing behind it is delivered until it is through. That is what blocking a
shard means.

Advancing the simulation's clock is what hands the batch over again:

```typescript
await simAws.clock().advanceBy({ seconds: 30 });
```

The batch is delivered again five times, after 1, 2, 4, 8 and 16 seconds, so six deliveries in all.
Then it is discarded and the mapping carries on with the stream, which is what AWS does once a
stream mapping's error handling has run out.

Both the cadence and the number of attempts are simulator constraints rather than AWS behaviour. AWS
documents no delay between attempts and retries until the records age out of the stream, a day
later. A delay of zero here would fall due at the instant the clock already reads, so a handler that
always throws would leave `advanceBy` with work falling due forever, and waiting out a simulated day
is the same problem with more steps.

### Reporting individual record failures

A stream mapping created with `FunctionResponseTypes: ["ReportBatchItemFailures"]` takes the
`batchItemFailures` list the handler returns. For a stream the identifier is the record's
`SequenceNumber`:

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

What a stream does with that report is not what a queue does with it. A queue takes back the
messages the report names and deletes the rest. A stream moves its checkpoint to the lowest sequence
number the report names and delivers everything from there again, including the records after it
that the handler did handle. That is real AWS behaviour rather than a simulation artifact, and it is
why a stream consumer has to be idempotent.

So a report naming only the last record of a batch delivers that record again. A report naming the
first record delivers the whole batch again. The redelivery is a retry like any other: it waits out
the same backoff, counts against the same five attempts, and what is left is discarded when they run
out.

A report naming a sequence number that was not in the batch delivers the whole batch again, as real
Lambda does with a report it cannot trust. So does an entry with no `itemIdentifier`. A handler that
returns nothing, or an empty `batchItemFailures` list, has handled the whole batch. A mapping
created without `FunctionResponseTypes` ignores a report entirely.

### Writing back to the source table

A handler that writes into the table whose stream invoked it is delivered its own write, which
writes again. Real Lambda runs that loop for as long as the account is willing to pay for it. The
simulation refuses instead, with an error naming the function, the stream and the table, rather than
going round until the test times out.

The write itself succeeds; the refusal comes afterwards, from whatever is waiting for the simulation
to settle:

```typescript
await simAws.backgroundTasksComplete(); // throws SimLambdaStreamCascadeError
```

Only the handler's own writes count. Items written at the same time by the test, or by anything else
in the simulation, are an ordinary batch however many of them there are, because the guard tells them
apart by where the write came from rather than by when it landed.

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
one place is computed from the rest, so it is a record a stream could have delivered: an `INSERT`
carries a new image, a `REMOVE` an old one and a `MODIFY` both, `StreamViewType` names the images
the record actually carries, and `awsRegion` is the Region of the stream ARN given. A record for a
`KEYS_ONLY` stream is one with the images explicitly taken away, as in
`make({ dynamodb: { NewImage: undefined, OldImage: undefined } })`.

`SizeBytes` is a plausible default rather than a measurement of the images given, so a test
asserting on it should say what it expects.

### Stream mappings in templates

`AWS::Lambda::EventSourceMapping` deploys a stream mapping too. `EventSourceArn` takes the
`Fn::GetAtt … StreamArn` of a
[streamed table](../dynamodb/#deploying-a-table-with-a-stream "Simulated DynamoDB table stream in CloudFormation docs")
in the same template, which is also what makes the mapping wait for the table. `StartingPosition` is
required, as it is for an SDK caller, and the properties go to `CreateEventSourceMapping` unjudged,
so a template that gets one wrong is refused in the words the command refuses it in.

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
the three stream actions on the stream ARN and `dynamodb:ListStreams` on every stream, which is what
the mapping's execution-role check is looking for.

The properties a non-default `DynamoEventSource` adds are refused by name: `FilterCriteria`,
`ParallelizationFactor`, `BisectBatchOnFunctionError`, `TumblingWindowInSeconds` and
`DestinationConfig`.

A hand-written template or a SAM application usually gives the function the AWS managed policy
`AWSLambdaDynamoDBExecutionRole` instead. Simulated IAM does not model managed policy ARNs, so that
role reaches the mapping with no stream permissions and the mapping is refused when it is created.
Write the grant as an inline policy, as the example above and CDK both do.

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

### Making an invocation event without a request

A test of the handler on its own, with no endpoint serving it, still has to pass it a whole event.
`lambdaFunctionUrlEventFactory` makes one, so such a test says what the request was and nothing
else:

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
stamps on a proxied request, so a handler reading `host`, `x-forwarded-for` or `x-amzn-trace-id`
finds what it would find on AWS. The fields a Function URL invocation never carries —
`pathParameters` and `stageVariables` — are absent rather than empty, as they are in a served event.

A real event says several things twice, and the factory computes its defaults from the overrides so
that supplying either copy sets both:

| What the request says | Where the event says it                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| the path              | `rawPath` and `requestContext.http.path`                                                          |
| the query             | `rawQueryString` and the parsed `queryStringParameters`                                           |
| the endpoint          | `requestContext.apiId`, `requestContext.domainPrefix`, `requestContext.domainName`, `host` header |
| the caller            | `requestContext.http.sourceIp` and `userAgent`, the `x-forwarded-for` and `user-agent` headers    |
| the time              | `requestContext.timeEpoch` and the Common Log Format `requestContext.time`                        |

So `make({ rawPath: "/user/status" })` is a request for `/user/status` in both places, rather than
one for `/user/status` that the request context still calls `/`. Overriding both copies with
different values is still allowed, for a test that wants an event no real invocation produces.

The same events go to a handler through
[the API Gateway HTTP API](../apigatewayv2/ "Simulated API Gateway HTTP API usage docs") too, where
the route key, the stage and the path parameters are the endpoint's rather than a Function URL's
`$default`, so an event for one of those is this factory with those fields overridden.

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

The caller comes from the request itself, through either a SigV4 signature or an `x-sim-aws-caller`
header naming a principal directly. A request that offers neither is anonymous, owns no policies, and
is refused. See [callers of HTTP requests](../iam/#callers-of-http-requests) in the IAM docs for how
that resolution works and how to sign a served request.

A grant conditioned on `AWS:SourceArn` or `AWS:SourceAccount` is evaluated against what the request
says it is being made for, which is how a permission granting `cloudfront.amazonaws.com` names one
Distribution. Sim CloudFront states that itself when it reaches a Function URL Origin through an
origin access control, so a Function URL behind a Distribution runs for that Distribution and
refuses everything else. See
[origin access controls](../cloudfront/README.md#origin-access-controls) in the CloudFront docs.

A request declaring what its body hashes to in an `x-amz-content-sha256` header is held to it,
whichever method it used. The header is checked against the bytes that arrived, and a request
declaring `UNSIGNED-PAYLOAD` is refused with `403` and `The request signature we calculated does not
match the signature you provided`, because Lambda supports no unsigned payload. A request that
declares no hash is invoked as before. That is what makes a POST through a CloudFront origin access
control need the viewer's own digest. See
[posting to a Function URL Origin](../cloudfront/README.md#posting-to-a-function-url-origin) in the
CloudFront docs.

CloudFront is the exception to the two actions being separate. A request from
`cloudfront.amazonaws.com` is authorized against `lambda:InvokeFunctionUrl` and
`lambda:InvokeFunction`, and needs a grant for both, which is what real Lambda asks an origin access
control for. A caller signing its own request still needs only `lambda:InvokeFunctionUrl`.

An `AWS_IAM` invocation carries its caller into the event as
`requestContext.authorizer.iam`, which is the part a handler reads. The `authorizer` block is absent
for a `NONE` invocation, as it is on real AWS, and `requestContext.accountId` is the caller's Account
rather than `anonymous`. The block is shared with simulated API Gateway HTTP APIs, whose JWT
authorizers would fill a `jwt` member instead, so `iam` is optional on the type.

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
says what a principal may do; a resource policy says who may act on the function. Either one is
enough to allow a call within the same Account. A principal from another Account needs both: the
grant on the function, and an identity policy in its own Account allowing the action, which is how
AWS decides a cross-Account request. See
[Cross-Account requests](../iam/README.md#cross-account-requests).

`AddPermissionCommand` grants a statement, `RemovePermissionCommand` revokes it by `StatementId`,
and `GetPolicyCommand` returns the assembled document. `AddPermission` is a shorthand: Lambda expands
its parts into one statement, so reading that statement back shows what the grant means:

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

`Principal` takes the same shorthand real Lambda does, and is expanded the same way: a 12-digit
Account id becomes `{"AWS": "arn:aws:iam::<id>:root"}`, an ARN becomes `{"AWS": "<arn>"}`, anything
else is read as a service principal, and `*` stays `*`.

`FunctionUrlAuthType` becomes a `lambda:FunctionUrlAuthType` condition, which is evaluated when a
Function URL is invoked. That is what a Function URL grant conditions on in practice: a permission
granted for `AWS_IAM` does not also open a URL later switched to `NONE`.

`SourceArn` becomes an `ArnLike` condition on `AWS:SourceArn`, and `SourceAccount` a `StringEquals`
condition on `AWS:SourceAccount`. Both are evaluated when another simulated service invokes the
function: a simulated API Gateway HTTP API invoking it through a Lambda proxy integration or as a
`REQUEST` authorizer, a simulated S3 Bucket delivering an event notification, and a simulated
Cognito user pool running a Lambda trigger. The source ARN is what that service is invoking the
function for — the API, the Bucket or the user pool — and the source Account is that service's
resource's own. See
[Granting the API permission to invoke the function](../apigatewayv2/README.md#granting-the-api-permission-to-invoke-the-function)
and [Lambda triggers](../cognito/README.md#lambda-triggers).
A direct `Invoke`, a Function URL request and an SQS event source mapping supply neither, so a
statement carrying one does not match them.

`PrincipalOrgID` and `InvokedViaFunctionUrl` are written into the statement so `GetPolicy` reports
the grant that was made, but nothing supplies a value for them at request time, so a statement
carrying one of those never matches.

A function that has been granted nothing has no policy at all, which `GetPolicy` reports as a
`ResourceNotFoundException` rather than as an empty document. Granting a `StatementId` that is
already in use is a `ResourceConflictException`, and removing one that was never granted is a
`ResourceNotFoundException`, as on AWS.

### Permissions in templates

`AWS::Lambda::Permission` creates the same permission from a CloudFormation template, which matters
because CDK emits one for every `grantInvoke` and `grantInvokeUrl` to a principal outside the
stack's own Account. The Resource has no `StatementId` property: CloudFormation names the statement
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

## Environment variables

A function can declare its own environment variables with `Environment.Variables`, as on real
Lambda. While the function runs, its code reads those variables from `process.env`, alongside the
AWS-provided runtime variables (`AWS_REGION`, `AWS_LAMBDA_FUNCTION_NAME`, and the rest). Those
include placeholder execution role credentials in `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and
`AWS_SESSION_TOKEN`, which is where an AWS SDK in the function code finds credentials, as it does
on real Lambda. Nothing authorizes against their values: a call from function code is attributed to
the execution Role because the invocation is running as it.

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

This is also how a function reaches something Yulin does not simulate, such as a Redis or a
Postgres. See [non-AWS dependencies](../../non-aws-dependencies/README.md).

Variable names are validated as on real AWS. A name must match the Lambda name pattern
`[a-zA-Z]([a-zA-Z0-9_])+`, meaning it starts with a letter, is at least two characters, and otherwise
holds letters, digits and underscores. A name that does not match is rejected with
`ValidationException`. The names Lambda reserves for the runtime (`AWS_REGION`,
`AWS_LAMBDA_FUNCTION_NAME`, `LAMBDA_TASK_ROOT` and so on) cannot be declared, and are rejected with
`InvalidParameterValueException`. As on AWS, the pattern is checked first, so a reserved name that
also breaks it, such as `_HANDLER`, is reported as the constraint violation.

### Read environment variables inside the handler

A function backed by a real in-process handler behaves differently here. That handler is an ordinary
function in your test process rather than code loaded into a sandbox, so it only gets the function's
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

This often does not come up, because test suites commonly export the same variables they configure
their functions with, and then a module-scope read gets the right value anyway. Sim Lambda warns on
the console when that is not the case, in the two situations where the difference changes what your
code sees:

- a declared variable whose name the host process also sets, with a different value
- two simulated functions declaring the same variable name with different values

## The time inside a handler

A function runs on its simulation's clock, and so does the function code: `Date.now()` and
`new Date()` inside a handler report simulated time rather than the host's. Freezing the clock
gives an invocation a constant `Date.now()`, and advancing it changes what the next invocation
reads. `context.getRemainingTimeInMillis()` counts down against the same clock, so a frozen clock
leaves a handler with a constant budget rather than one draining in real time.

Zip code gets this from its own vm sandbox. A real in-process handler gets it from a substituted
global `Date` that reports the invocation's clock while an invocation is running and the host clock
otherwise, so a time read at module scope is read too early, exactly as it is for environment
variables. See [simulated time](../../time/README.md) for the whole picture, including where real
AWS puts the time on the event.

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
- `Code` (inline `ZipFile` source string, or `S3Bucket`/`S3Key` fetched from same-scope sim S3)
- `Handler`
- `Runtime`
- `Description`
- `Timeout`
- `MemorySize`

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

Asset code runs under the same rules as any other sim Lambda code: modules are evaluated as
CommonJS in a vm, so everything the handler imports has to be in the asset, and only Node.js
runtimes are simulated.

Two cases are skipped with a diagnostic rather than failing the stack:

- A function declaring a non-Node.js `Runtime`, such as the Python provider function CDK
  synthesizes for `BucketDeployment`. Sim CloudFormation simulates that custom resource directly,
  so its provider never needs to run. Bind a real in-process handler to simulate a function whose
  runtime Yulin cannot run.
- A CDK-shaped template deployed without its cloud assembly, such as a template object passed
  inline to `deployTemplate`, where there is no asset to publish and the staging bucket does not
  exist.

### Container image functions

A function with `PackageType: Image` names a container image instead of code, which is what CDK's
`DockerImageFunction` and `lambda.DockerImageCode` synthesize. Yulin never reads an image, so there
is nothing for it to run. The Resource is skipped with a diagnostic naming the image, and the rest
of the stack deploys.

There are two ways to give that function a real in-process handler to run instead, and they suit
different shapes of test:

- Bind one to the function for this deploy, which is the same mechanism as
  [executable bindings](#executable-bindings) and is shown below.
- Register one as the image in a
  [simulated ECR repository](../ecr/ "Simulated ECR usage docs"), which is a standing statement
  about what that image is, made once and good for every stack that runs it, and for a function
  created directly through `CreateFunction`.

Either way the handler replaces the image, so the function is created and invoked like any other. A
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
reported apart from one whose repository holds no image, since those send you to different places:
a repository name that does not agree with the template, or a handler that was never registered.

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
  await srv.close();
}
```

CDK templates work the same way: synth the app, deploy the template file, and read
`functionUrl.url` from the stack outputs. Note that CDK pairs a public Function URL with an
`AWS::Lambda::Permission`, which is not simulated and is skipped with a diagnostic rather than
failing the deployment.

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
`Handler` entirely; unbound functions in the same template keep their template code on the vm path.
A binding that does not resolve to any template resource fails the deploy with the unmatched target
named for diagnosis. Where two bindings could both back the same function, the one listed first is
the one that backs it.

### Binding by container image repository

`imageRepository` matches any function whose resolved `Code.ImageUri` names that repository. One
binding covers every function running that image, in every stack deployed from the same `SimAws`,
rather than naming a logical ID that belongs to one construct tree.

The image tag is ignored on both sides of the match. No tag is stable enough to write into a test:
a CDK image asset is tagged with the asset content hash, which changes whenever the image source
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

A function matched this way is created from the bound handler, so it never reaches the
[container image skip](#container-image-functions). Functions in the same template running an image
from another repository are skipped as usual.

A binding like this and a handler registered in
[simulated ECR](../ecr/ "Simulated ECR usage docs") match on the same thing, and the binding is what
backs the function where both could. Reach for the binding when the handler belongs to one deploy,
and for the repository when it belongs to the image.

## Available functionality

Sim Lambda currently supports:

- `CreateFunctionCommand` and `GetFunctionCommand`, including a function created from the
  [simulated ECR](../ecr/ "Simulated ECR usage docs") image its `Code.ImageUri` names
- `InvokeCommand`, with the `RequestResponse`, `Event` and `DryRun` invocation types
- Function URLs, created with `CreateFunctionUrlConfigCommand` and served over HTTP on localhost
  with `serveSimAws`
- `AuthType: "AWS_IAM"` Function URLs, authorizing `lambda:InvokeFunctionUrl` against the caller
  resolved from the request, and `lambda:InvokeFunction` as well for a CloudFront origin access
  control
- `lambdaFunctionUrlEventFactory`, making a Function URL invocation event for a test that calls a
  handler directly
- `AddPermissionCommand`, `RemovePermissionCommand` and `GetPolicyCommand`, for resource-based
  policies evaluated alongside identity policies
- SQS and DynamoDB stream event source mappings, created with `CreateEventSourceMappingCommand` and
  read with `GetEventSourceMappingCommand`, `ListEventSourceMappingsCommand` and
  `DeleteEventSourceMappingCommand`, delivering real-shaped SQS and DynamoDB stream events and
  honouring `BatchSize`
- `StartingPosition: "TRIM_HORIZON"` and `"LATEST"` on a stream mapping, with a failing batch
  blocking its shard until it is through or discarded
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
- Per-function environment variables with `Environment.Variables`
- Runtime-provided `@aws-sdk/*` packages inside function code, routed into the owning simulated AWS
  environment
- Execution roles, evaluated against simulated IAM
- IAM authorization of the Lambda commands themselves (`lambda:CreateFunction`,
  `lambda:GetFunction`, `lambda:InvokeFunction`, and the Function URL config actions)
- AWS-like validation and errors, such as `ResourceConflictException` for a duplicate function name
- The `AWS::Lambda::Function`, `AWS::Lambda::Url`, `AWS::Lambda::Permission` and
  `AWS::Lambda::EventSourceMapping` CloudFormation resources, with `Ref`/`Fn::GetAtt` support and
  deploy-time executable bindings
- `AWS::Lambda::EventSourceMapping` on a queue or on a table's stream, including the
  `StartingPosition` a stream mapping needs, so a CDK `SqsEventSource` or `DynamoEventSource`
  deploys as it is synthesised

## Limitations

Current documented limitations:

- Only `CreateFunctionCommand`, `GetFunctionCommand`, `InvokeCommand`, the permission commands
  (`AddPermissionCommand`, `RemovePermissionCommand`, `GetPolicyCommand`), the Function URL config
  commands and the event source mapping commands are supported. There is no `UpdateFunctionCode`,
  `DeleteFunction`, or function listing yet.
- A cross-account grant is only half of what admits a call: the caller's own Account has to allow
  the action too, and its IAM has to be part of the same `SimAws` instance for its policies to be
  found. A caller from an Account the simulation knows nothing about is denied.
- `lambda:FunctionUrlAuthType`, `AWS:SourceArn` and `AWS:SourceAccount` are the only condition keys
  given a value at request time, the first when a Function URL is invoked and the other two when a
  simulated API Gateway HTTP API invokes the function. `PrincipalOrgID` and `InvokedViaFunctionUrl`
  are written into the statement so `GetPolicy` reports the grant that was made, but nothing supplies
  a value for them, so a statement carrying one never matches. Neither does a `SourceArn` or
  `SourceAccount` statement on a request from anything but an HTTP API.
- `Qualifier`, `RevisionId` and `EventSourceToken` on the permission commands are not simulated,
  as versions and aliases are not.
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
- Only zip-packaged code has its output recorded into a log group. A function backed by a handler
  function reference, including a container image binding, writes to the host console directly and
  is not recorded, so a test asserting on its output still has to capture the host stream. See
  [What a handler prints](#what-a-handler-prints).
- Nothing writes the platform `START`, `END` and `REPORT` lines a real log stream carries, and
  execution environments are never recycled, so a function keeps one log stream for as long as it
  exists.
- Container image functions are not run. Yulin never reads a container image, and stays Docker-free.
  A function with `PackageType: Image` is skipped, or refused on `CreateFunction`, unless a real
  in-process handler stands in for its image: one bound to it, or one registered in the
  [simulated ECR](../ecr/ "Simulated ECR usage docs") repository the image URI names. See
  [Container image functions](#container-image-functions).
- Lambda Layers are not simulated.
- Environment variables declared with `Environment.Variables` reach a real in-process handler
  function only while it runs, so a variable read at module scope sees the host process value
  instead. See [Environment variables](#environment-variables).
- `Timeout` is recorded but does not interrupt handler execution.
- Timers inside a handler are host timers: `setTimeout` waits in real time, and advancing the
  simulation's clock does not release a sleeping handler.
- A time read at module scope, like an environment variable read there, is read before any
  invocation and sees the host clock. See [The time inside a handler](#the-time-inside-a-handler).
- `Event` invocations do not simulate retries or failure destinations; handler errors are dropped.
- `Code.S3ObjectVersion` is accepted but ignored, as sim S3 has no object versioning yet.
- SQS queues and DynamoDB streams are the only event sources. Kinesis, Kafka and DocumentDB sources
  are refused rather than accepted and never delivered from, and so are `FilterCriteria`,
  `ScalingConfig`, `DestinationConfig`, `MaximumRetryAttempts`, `BisectBatchOnFunctionError`,
  `ParallelizationFactor`, `TumblingWindowInSeconds` and the other mapping inputs this simulation
  has no behaviour for.
- A stream batch is delivered again five times, after 1, 2, 4, 8 and 16 seconds, and then
  discarded. AWS
  documents no delay between attempts and retries until the records age out. Both differences are
  deliberate: a delay of zero falls due at the instant the clock already reads, so a handler that
  always throws would leave `advanceBy` with work falling due forever. A batch item failure report
  counts against the same five attempts, rather than starting them again for the records it rewound
  to.
- A handler writing into the table whose stream invoked it is refused with
  `SimLambdaStreamCascadeError` rather than being delivered its own writes forever. Real Lambda runs
  that loop.
- A shard iterator never expires, where a real one is good for 15 minutes.
- `MaximumBatchingWindowInSeconds` is only simulated as 0: a partial batch is delivered as soon as
  anything is on the event source, so a batching window would have nothing to wait for. A non-zero
  value is refused, which also caps a queue mapping's `BatchSize` at 10. The documented rule that a
  `BatchSize` above 10 needs a batching window is not enforced, because the same AWS documentation
  gives a stream mapping `BatchSize` 100 and window 0 as simultaneous defaults, and CDK emits
  exactly that.
- An execution role that gets its stream permissions from the AWS managed policy
  `AWSLambdaDynamoDBExecutionRole` has none here, since simulated IAM does not model managed policy
  ARNs, so the mapping is refused when it is created. A hand-written template and a SAM application
  usually attach that policy where CDK writes an inline one, so the two declaration paths differ.
  Write the grant inline to deploy either.
- `UpdateEventSourceMapping` is not supported, so a mapping's batch size or enabled state is fixed
  once it is created. `Enabled: false` at creation is simulated.
- One poll delivers one batch. Real Lambda runs several pollers at once and scales them with the
  event source, so nothing here shows what concurrency does to ordering or to a downstream service.
  A simulated stream has one shard and never splits, so a stream mapping has one thing to read
  either way.
- CloudFormation resource types other than `AWS::Lambda::Function`, `AWS::Lambda::Url`,
  `AWS::Lambda::Permission` and `AWS::Lambda::EventSourceMapping` (`Version`, `Alias`, ...) are
  skipped with an "Unsupported" diagnostic.
- The `vm` context is a namespacing convenience, not a security boundary: function code runs
  in-process with the same trust as the test suite itself. Do not run untrusted code through the
  simulator.
- Only Function URLs are served over HTTP by `serveSimAws`; the Lambda control-plane API itself is
  not served, so SDK commands go through `SimAws` or [SDK interception](../../sdk/) rather than
  over the local server.
