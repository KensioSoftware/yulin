# Simulated SQS

Yulin includes a simulated Amazon SQS for tests and local development. Messages are held in memory,
hidden and released on the simulation's own clock, and every operation is authorized by simulated IAM.

Standard queues only. SQS-specific types are imported from the `@kensio/yulin/sqs` subpath.

## Creating a queue and sending a message

```typescript sim-sqs-send-and-receive
/**
 * Sending a message to a simulated queue and receiving it.
 */

import {
  CreateQueueCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sqs = simAws.sqs();

const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders" }),
);

await sqs.sendMessage(
  new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }),
);

const received = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl }),
);
const message = received.Messages?.[0];

console.log(message?.Body); // "order-1"

await sqs.deleteMessage(
  new DeleteMessageCommand({
    QueueUrl,
    ReceiptHandle: message?.ReceiptHandle,
  }),
);
```

A queue URL is `https://sqs.<region>.amazonaws.com/<account-id>/<name>`, and the ARN is
`arn:aws:sqs:<region>:<account-id>:<name>`. An SQS ARN has no resource type in it, so the queue name
follows the account id directly.

`CreateQueue` is idempotent, as it is on real AWS. A second request for the same name returns the
existing queue's URL when the attributes it names match, and fails with `QueueNameExists` when they
differ. A request naming no attributes always matches.

## Visibility timeouts

A received message is hidden from other consumers for the queue's visibility timeout, 30 seconds by
default. Nothing is scheduled to release it: the message records the instant it is hidden until, and it
becomes receivable again once simulated time reaches that instant. Advancing the clock is therefore all
a test needs to watch an undeleted message come back.

```typescript sim-sqs-visibility-timeout
/**
 * A message that was received but never deleted, coming back once its
 * visibility timeout lapses.
 */

import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sqs = simAws.sqs();

const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({
    QueueName: "orders",
    Attributes: { VisibilityTimeout: "30" },
  }),
);

await sqs.sendMessage(
  new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }),
);

const first = await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

console.log(first.Messages?.length); // 1

// The message is invisible to everyone else while the timeout runs.
const empty = await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

console.log(empty.Messages); // undefined

await simAws.clock().advanceBy({ seconds: 31 });

const again = await sqs.receiveMessage(
  new ReceiveMessageCommand({
    QueueUrl,
    MessageSystemAttributeNames: ["ApproximateReceiveCount"],
  }),
);

console.log(again.Messages?.[0]?.Attributes?.["ApproximateReceiveCount"]); // "2"
```

A receive request can override the timeout for the messages it takes with `VisibilityTimeout`, and a
consumer part way through a slow handler can ask for more time with `ChangeMessageVisibility`. The new
timeout runs from the moment of the change rather than from the receive, as it does on real AWS, and
a timeout of zero gives the message straight back to the queue.

`ChangeMessageVisibility` on a message whose timeout has already lapsed fails with `MessageNotInflight`,
which is what real SQS answers: there is no timeout left to change.

See [simulated time](../../time/ "Simulated time docs") for what else the clock can do.

## Receipt handles

Every receive issues a fresh receipt handle, and a delete has to use the handle from the most recent
receive of that message. A handle from an earlier receive is accepted and deletes nothing, which is
exactly what real SQS does with one.

That is the failure a consumer slower than its visibility timeout hits. Its message went back on the
queue, someone else took it, and its own delete quietly does nothing.

```typescript sim-sqs-stale-receipt-handle
/**
 * A slow consumer deleting with a receipt handle another receive has
 * superseded.
 */

import {
  CreateQueueCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sqs = simAws.sqs();

const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({
    QueueName: "orders",
    Attributes: { VisibilityTimeout: "30" },
  }),
);

await sqs.sendMessage(
  new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }),
);

const slow = await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

// The slow consumer takes longer than the visibility timeout, and another
// consumer receives the message in the meantime.
await simAws.clock().advanceBy({ seconds: 31 });
await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

// The delete succeeds and deletes nothing.
await sqs.deleteMessage(
  new DeleteMessageCommand({
    QueueUrl,
    ReceiptHandle: slow.Messages?.[0]?.ReceiptHandle,
  }),
);

await simAws.clock().advanceBy({ seconds: 31 });

const still = await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

console.log(still.Messages?.[0]?.Body); // "order-1"
```

A handle whose visibility timeout has lapsed with nobody else having received the message since is
still the most recent one, so deleting with it works. A handle the queue never issued fails with
`ReceiptHandleIsInvalid`, and a repeated delete of a message already gone succeeds.

## Delays

`DelaySeconds` hides a new message until it lapses, either set on the queue for every message or on
one message as it is sent.

```typescript sim-sqs-delayed-message
/**
 * A message that cannot be received until the delay it was sent with lapses.
 */

import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sqs = simAws.sqs();

const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders" }),
);

await sqs.sendMessage(
  new SendMessageCommand({
    QueueUrl,
    MessageBody: "order-1",
    DelaySeconds: 60,
  }),
);

const early = await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

console.log(early.Messages); // undefined

await simAws.clock().advanceBy({ seconds: 61 });

const late = await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

console.log(late.Messages?.[0]?.Body); // "order-1"
```

`MessageRetentionPeriod` works on the same clock. A message on the queue longer than the retention
period, four days by default, is gone rather than kept indefinitely.

## Message attributes

Message attributes round-trip, and both digests are real: `MD5OfMessageBody` is an MD5 of the body, and
`MD5OfMessageAttributes` uses the length-prefixed encoding real SQS digests attributes with. A consumer
checking either against its own digest is checking something real.

A receive returns no attributes unless it names them, as on real AWS. `All` or `.*` selects every
attribute, a bare name selects one, and a name ending in `.*` selects a prefix.

```typescript sim-sqs-message-attributes
/**
 * Message attributes on a simulated queue, and asking for them back.
 */

import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sqs = simAws.sqs();

const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders" }),
);

const sent = await sqs.sendMessage(
  new SendMessageCommand({
    QueueUrl,
    MessageBody: "order-1",
    MessageAttributes: {
      tenant: { DataType: "String", StringValue: "acme" },
      attempt: { DataType: "Number", StringValue: "1" },
    },
  }),
);

const received = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl, MessageAttributeNames: ["All"] }),
);
const message = received.Messages?.[0];

console.log(message?.MessageAttributes?.["tenant"]?.StringValue); // "acme"
console.log(message?.MD5OfMessageAttributes === sent.MD5OfMessageAttributes); // true
console.log(message?.MD5OfBody === sent.MD5OfMessageBody); // true
```

The name and data type rules are the real ones. A name using a reserved `AWS.` or `Amazon.` prefix, a
data type that is not `String`, `Number` or `Binary`, or a value that does not match its data type is
refused here rather than on AWS.

The message system attributes are asked for separately, with `MessageSystemAttributeNames`, or with
the discontinued `AttributeNames` that means the same thing. `SentTimestamp`,
`ApproximateReceiveCount` and `ApproximateFirstReceiveTimestamp` are reported.

## Queue attributes

`GetQueueAttributes` returns only the attributes a request names, as real SQS does, and `All` names
every attribute this simulation holds. The defaults are the AWS ones: `VisibilityTimeout` 30,
`DelaySeconds` 0, `MessageRetentionPeriod` 345600, `MaximumMessageSize` 262144 and
`ReceiveMessageWaitTimeSeconds` 0.

```typescript sim-sqs-queue-attributes
/**
 * Reading the counts and settings of a simulated queue.
 */

import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sqs = simAws.sqs();

const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders" }),
);

await sqs.setQueueAttributes(
  new SetQueueAttributesCommand({
    QueueUrl,
    Attributes: { VisibilityTimeout: "120" },
  }),
);

await sqs.sendMessage(
  new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }),
);
await sqs.sendMessage(
  new SendMessageCommand({ QueueUrl, MessageBody: "order-2" }),
);
await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

const read = await sqs.getQueueAttributes(
  new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ["All"] }),
);

console.log(read.Attributes?.["VisibilityTimeout"]); // "120"
console.log(read.Attributes?.["ApproximateNumberOfMessages"]); // "1"
console.log(read.Attributes?.["ApproximateNumberOfMessagesNotVisible"]); // "1"
console.log(read.Attributes?.["QueueArn"]); // "arn:aws:sqs:us-east-1:888888888888:orders"
```

An attribute real SQS reports and this simulation does not model, `RedrivePolicy` for one, is left out
of a response rather than refused, since that is what real SQS does with an attribute a queue has no
value for. Setting one is refused, because a queue that appeared to accept a redrive policy would
behave differently here than on AWS.

`PurgeQueue` deletes everything on a queue, hidden messages included.

## IAM permissions

Every operation is authorized against the queue's ARN, which carries the queue name with no resource
type in front of it. Two details are worth knowing, because both are real SQS behaviour that a policy
can get wrong:

- `ListQueues` has no queue-level permission, so a policy allowing it names
  `arn:aws:sqs:<region>:<account-id>:*`. A policy naming one queue grants no listing.
- The batch operations are authorized as their singular action. There is no `sqs:SendMessageBatch`,
  `sqs:DeleteMessageBatch` or `sqs:ChangeMessageVisibilityBatch` action for a policy to name.

```typescript sim-sqs-iam-policy
/**
 * A Role allowed to consume from one simulated queue and nothing else.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;
const regionName = simAws.defaultRegionName;
const sqs = simAws.sqs();

const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders" }),
);

await sqs.sendMessage(
  new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }),
);

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrderConsumer",
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
    RoleName: "OrderConsumer",
    PolicyName: "ConsumeOrders",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: ["sqs:ReceiveMessage", "sqs:DeleteMessage"],
        // A queue ARN has no resource type: not "...:queue/orders".
        Resource: `arn:aws:sqs:${regionName}:${accountId}:orders`,
      },
    }),
  }),
);

const caller = { kind: "arn", arn: role.Role.Arn } as const;

const received = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl }),
  { caller },
);

console.log(received.Messages?.[0]?.Body); // "order-1"

try {
  await sqs.sendMessage(
    new SendMessageCommand({ QueueUrl, MessageBody: "order-2" }),
    { caller },
  );
} catch (error) {
  console.log((error as Error).name); // "AccessDenied"
}
```

## Batches

`SendMessageBatch` and `DeleteMessageBatch` take up to ten entries. An entry that fails on its own is
reported in `Failed` while the rest of the batch goes through, as real SQS reports it. An empty batch,
more than ten entries, a malformed entry id or two entries sharing an id fail the whole request.

```typescript sim-sqs-send-message-batch
/**
 * A batch send where one entry fails on its own.
 */

import {
  CreateQueueCommand,
  SendMessageBatchCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sqs = simAws.sqs();

const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({
    QueueName: "orders",
    Attributes: { MaximumMessageSize: "1024" },
  }),
);

const sent = await sqs.sendMessageBatch(
  new SendMessageBatchCommand({
    QueueUrl,
    Entries: [
      { Id: "one", MessageBody: "order-1" },
      { Id: "two", MessageBody: "x".repeat(2048) },
    ],
  }),
);

console.log(sent.Successful?.map((entry) => entry.Id)); // ["one"]
console.log(sent.Failed?.[0]?.Code); // "InvalidParameterValue"
```

## Deleting a queue

`DeleteQueue` removes the queue and everything on it. The name is not free straight away: real SQS
holds a deleted queue's name for 60 seconds, and so does this. Advancing simulated time past it frees
the name, which is what a redeployed stack depends on.

```typescript sim-sqs-delete-queue
/**
 * A deleted queue holding its name for a minute, as real SQS holds it.
 */

import { CreateQueueCommand, DeleteQueueCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";
import { SimSqsQueueDeletedRecently } from "@kensio/yulin/sqs";

const simAws = new SimAws();
const sqs = simAws.sqs();

const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders" }),
);

await sqs.deleteQueue(new DeleteQueueCommand({ QueueUrl }));

try {
  await sqs.createQueue(new CreateQueueCommand({ QueueName: "orders" }));
} catch (error) {
  console.log(error instanceof SimSqsQueueDeletedRecently); // true
}

await simAws.clock().advanceBy({ seconds: 61 });

const recreated = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders" }),
);

console.log(recreated.QueueUrl === QueueUrl); // true
```

## Scoping

Queues belong to an account and a region, as they do on real AWS. A queue name is unique within one
account and region and nowhere wider, so the same name can be used in two regions for two different
queues.

```typescript sim-sqs-scoping
/**
 * Simulated queues are scoped to an account and region.
 */

import {
  CreateQueueCommand,
  GetQueueUrlCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";
import { SimSqsQueueDoesNotExist } from "@kensio/yulin/sqs";

const simAws = new SimAws();

const { QueueUrl } = await simAws
  .account("222222222222")
  .region("eu-west-2")
  .sqs()
  .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

try {
  await simAws
    .account("222222222222")
    .region("us-east-1")
    .sqs()
    .getQueueUrl(new GetQueueUrlCommand({ QueueName: "orders" }));
} catch (error) {
  console.log(error instanceof SimSqsQueueDoesNotExist); // true
}

// A queue URL naming another Region reaches nothing either.
try {
  await simAws
    .account("222222222222")
    .region("us-east-1")
    .sqs()
    .sendMessage(new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }));
} catch (error) {
  console.log(error instanceof SimSqsQueueDoesNotExist); // true
}
```

## Inside a simulated Lambda handler

Function code requiring `@aws-sdk/client-sqs` is routed into the same simulated AWS environment, with
the function's execution role as the caller. A handler consuming a queue therefore has to be allowed
to, by that role's policy, the same as on real AWS.

```typescript sim-sqs-lambda-consumer
/**
 * A simulated Lambda handler consuming a message from a simulated queue.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { CreateQueueCommand, SendMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";
import { makeLambdaCodeZip } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;
const regionName = simAws.defaultRegionName;

const { QueueUrl } = await simAws
  .sqs()
  .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

await simAws
  .sqs()
  .sendMessage(new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }));

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
        Action: ["sqs:ReceiveMessage", "sqs:DeleteMessage"],
        Resource: `arn:aws:sqs:${regionName}:${accountId}:orders`,
      },
    }),
  }),
);

const handlerCode = [
  'const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");',
  "exports.handler = async () => {",
  "  const client = new SQSClient({});",
  "  const received = await client.send(new ReceiveMessageCommand({",
  "    QueueUrl: process.env.QUEUE_URL,",
  "  }));",
  "  const message = received.Messages[0];",
  "  await client.send(new DeleteMessageCommand({",
  "    QueueUrl: process.env.QUEUE_URL,",
  "    ReceiptHandle: message.ReceiptHandle,",
  "  }));",
  "  return message.Body;",
  "};",
].join("\n");

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "order-consumer",
    Role: role.Role.Arn,
    Handler: "index.handler",
    Code: { ZipFile: makeLambdaCodeZip({ "index.js": handlerCode }) },
    Environment: { Variables: { QUEUE_URL: QueueUrl! } },
  }),
);

await simAws.backgroundTasksComplete();

const invoked = await simAws
  .lambda()
  .invoke(new InvokeCommand({ FunctionName: "order-consumer" }));

console.log(Buffer.from(invoked.Payload ?? []).toString("utf8")); // "\"order-1\""
```

See [simulated Lambda](../lambda/ "Simulated Lambda docs") for how function code and execution roles
work. The same applies to `SimSdk` interception: intercepting `SQSClient` routes ordinary SDK code into
the simulation with nothing touching the network. See
[AWS SDK interception](../../sdk/ "Simulated AWS SDK docs").

## Deploying a queue from CloudFormation

Simulated CloudFormation creates a queue from an `AWS::SQS::Queue` resource, in the stack's account
and region. The queue is created through `CreateQueue`, so a template-created queue is the same thing
an SDK caller would get: the same name validation, the same attribute ranges, the same ARN and URL.

`Ref` on the resource gives the queue URL rather than its name or ARN, as it does on real AWS, so it
can be handed straight to `SendMessage`. `Fn::GetAtt … Arn`, `Fn::GetAtt … QueueName` and
`Fn::GetAtt … QueueUrl` give those.

```typescript sim-sqs-cloudformation-queue
/**
 * Deploying a queue from a CloudFormation template and sending to it.
 */

import { SendMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrdersQueue: {
        Type: "AWS::SQS::Queue",
        Properties: {
          QueueName: "orders",
          VisibilityTimeout: 120,
          MessageRetentionPeriod: 3600,
        },
      },
    },
    Outputs: {
      OrdersQueueUrl: {
        Value: { Ref: "OrdersQueue" },
      },
      OrdersQueueArn: {
        Value: { "Fn::GetAtt": ["OrdersQueue", "Arn"] },
      },
    },
  },
});

await stack.waitForDeployComplete();

// Ref resolves to the queue URL, so it works as a SendMessage QueueUrl.
const queueUrl = stack.outputs.get("OrdersQueueUrl")?.value as string;

await simAws
  .sqs()
  .sendMessage(
    new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
  );

console.log(stack.outputs.get("OrdersQueueArn")?.value);
// "arn:aws:sqs:us-east-1:888888888888:orders"
```

The properties applied to the queue are `VisibilityTimeout`, `DelaySeconds`,
`MessageRetentionPeriod`, `MaximumMessageSize` and `ReceiveMessageWaitTimeSeconds`. Each is passed to
`CreateQueue`, so a value outside the range real SQS accepts fails the resource.

A queue with no `QueueName` is named from the stack name and the logical ID, so the queue above with
its name left out would be `orders-stack-OrdersQueue`. Real CloudFormation adds random characters to
that, which a template cannot predict either way. The generated name is trimmed to the 80 characters
a queue name allows, ending in a hash of the untrimmed name so two long names that start the same
stay apart.

`FifoQueue: true` fails the resource, because only standard queues are simulated and a FIFO queue
created as a standard one would take messages in an order the deployment does not promise. The
properties with behaviour that is not simulated fail the resource in the same way rather than being
dropped: `RedrivePolicy`, `RedriveAllowPolicy`, `KmsMasterKeyId`, `KmsDataKeyReusePeriodSeconds`,
`SqsManagedSseEnabled`, `ContentBasedDeduplication`, `DeduplicationScope`, `FifoThroughputLimit` and
`Tags`. So does a property `AWS::SQS::Queue` does not have.

`AWS::SQS::QueuePolicy` is skipped rather than deployed, since queue policies are not simulated. The
rest of the stack still deploys.

CDK works without hand-editing. An `sqs.Queue` with `grantSendMessages(fn)` synthesises a template
that deploys here, with the queue URL reaching the function through its environment and the grant
policy naming the queue by the ARN `Fn::GetAtt` gives.

## Available functionality

Sim SQS currently supports:

- `CreateQueueCommand`, idempotent for a matching name and attributes, and `DeleteQueueCommand`
- `GetQueueUrlCommand` and `ListQueuesCommand`, with a name prefix and paging
- `GetQueueAttributesCommand`, `SetQueueAttributesCommand` and `PurgeQueueCommand`
- `SendMessageCommand` and `SendMessageBatchCommand`, with per-message or per-queue delays
- `ReceiveMessageCommand`, up to ten messages at a time, each under a fresh receipt handle
- `DeleteMessageCommand`, `DeleteMessageBatchCommand` and `ChangeMessageVisibilityCommand`
- Visibility timeouts, delays and message retention, all on the simulation's clock
- `MessageAttributes` round-tripping, with real `MD5OfMessageBody` and `MD5OfMessageAttributes` digests
- The `SentTimestamp`, `ApproximateReceiveCount` and `ApproximateFirstReceiveTimestamp` system
  attributes
- Authorization of every operation by simulated IAM, against the real IAM action and queue ARN
- Calls made from inside a simulated Lambda handler, authorized as the function's execution role
- `AWS::SQS::Queue` in a CloudFormation or CDK template, with `Ref` giving the queue URL and
  `Fn::GetAtt` giving `Arn`, `QueueName` and `QueueUrl`

## Limitations

Current documented limitations:

- Standard queues only. A queue name ending in `.fifo` is refused, as are `MessageGroupId`,
  `MessageDeduplicationId` and `ReceiveRequestAttemptId`.
- Ordering and duplicates are stricter here than AWS promises. Messages come back oldest first, and a
  message is handed out to one consumer at a time. Real standard queues make no ordering promise and
  guarantee at-least-once delivery, so there a copy of a message can arrive twice and messages can
  arrive out of order. Redelivery after a visibility timeout lapses is simulated, since that follows
  from the timeout; a duplicate arriving on its own is not.
- Long polling does not wait. `WaitTimeSeconds` and `ReceiveMessageWaitTimeSeconds` are accepted and
  validated, and a receive returns at once. Nothing else is running in process that could send a
  message during the wait, so waiting could only ever time out.
- `DeleteQueue` and `PurgeQueue` take effect immediately, where real SQS may take up to 60 seconds
  over either. The 60 second hold on a deleted queue's name is simulated, so recreating a queue
  straight after deleting it fails with `QueueDeletedRecently` until the clock moves on.
- Dead-letter queues are not simulated. `RedrivePolicy` and `RedriveAllowPolicy` are refused rather
  than ignored, and a message that fails repeatedly stays on its queue.
- Queue policies are not simulated (`AddPermission`, `RemovePermission` and the `Policy` attribute),
  so cross-account access to a queue cannot be granted. A request naming a
  `QueueOwnerAWSAccountId` other than the scope's own Account is refused.
- Encryption is not simulated. `KmsMasterKeyId`, `KmsDataKeyReusePeriodSeconds` and
  `SqsManagedSseEnabled` are refused, and message bodies are held in process memory as they were
  sent. That is not a security boundary: anything sharing the process can reach them.
- Tags are not simulated. `TagQueue`, `UntagQueue` and `ListQueueTags` are not supported, and
  `CreateQueue` refuses a `tags` parameter rather than dropping it.
- `SenderId` is not reported, because a simulated caller has no user or role id to report it as.
  `AWSTraceHeader` is not reported either, and `MessageSystemAttributes` on a send are refused. Asking
  for any of them is accepted, as real SQS accepts a request for an attribute a message has no value
  for, and they are left out of the response.
- SQS condition keys are not derived, so a policy relying on them will not match. Ordinary condition
  operators on values sim IAM does supply work as usual.
- `ChangeMessageVisibilityBatch`, `ListDeadLetterSourceQueues`, the message move tasks and the batch
  size limit (`BatchRequestTooLong`) are not supported.
- Lambda event source mappings are not simulated, so a queue does not invoke a function on its own. A
  test invokes the consumer itself, as the Lambda example above does.
- `AWS::SQS::Queue` is the only SQS resource type CloudFormation creates. `AWS::SQS::QueuePolicy` is
  skipped, and the queue properties this simulation has no behaviour for fail the resource rather
  than being dropped.
- SQS is not served as an HTTP API by `serveSimAws`.
