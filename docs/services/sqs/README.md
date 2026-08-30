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
`arn:aws:sqs:<region>:<account-id>:<name>`. An SQS ARN has no resource type in it. The queue name
follows the account id directly.

`CreateQueue` is idempotent, as it is on real AWS. A second request for the same name returns the
existing queue's URL when the attributes it names match, and fails with `QueueNameExists` when they
differ. A request naming no attributes always matches.

## Visibility timeouts

A received message is hidden from other consumers for the queue's visibility timeout, 30 seconds by
default. The message records the instant it is hidden until. It becomes receivable again once
simulated time reaches that instant. Advancing the clock is all a test needs to watch an undeleted
message come back.

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
consumer part way through a slow handler can ask for more time with `ChangeMessageVisibility`. The
new timeout runs from the moment of the change rather than from the receive, as it does on real AWS.
A timeout of zero gives the message straight back to the queue.

`ChangeMessageVisibility` on a message whose timeout has already lapsed fails with
`MessageNotInflight`. There is no timeout left to change, and real SQS answers the same way.

See [simulated time](https://yulinsim.dev/time/ "Simulated time docs") for what else the clock can do.

## Receipt handles

Every receive issues a fresh receipt handle, and a delete has to use the handle from the most recent
receive of that message. A handle from an earlier receive is accepted and deletes nothing. Real SQS
accepts one too, and promises only that the message might not be deleted.

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

## Dead-letter queues

A `RedrivePolicy` says where a message goes once a consumer has had enough attempts at it. Once a
message has been received `maxReceiveCount` times without being deleted, the next lapse of its
visibility timeout moves it to the queue named by `deadLetterTargetArn`. Advancing the clock drives
the move, as it drives the timeout itself.

```typescript sim-sqs-dead-letter-queue
/**
 * A message a consumer keeps failing on, ending up on the dead-letter queue.
 */

import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sqs = simAws.sqs();

// The dead-letter queue has to exist before anything can point at it.
const { QueueUrl: DeadLetterQueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders-dlq" }),
);

const deadLetter = await sqs.getQueueAttributes(
  new GetQueueAttributesCommand({
    QueueUrl: DeadLetterQueueUrl,
    AttributeNames: ["QueueArn"],
  }),
);

const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({
    QueueName: "orders",
    Attributes: {
      VisibilityTimeout: "30",
      RedrivePolicy: JSON.stringify({
        deadLetterTargetArn: deadLetter.Attributes?.["QueueArn"],
        maxReceiveCount: 3,
      }),
    },
  }),
);

await sqs.sendMessage(
  new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }),
);

// A consumer takes the message and never gets as far as deleting it.
async function failToHandleMessage(): Promise<void> {
  await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));
  await simAws.clock().advanceBy({ seconds: 31 });
}

await failToHandleMessage();
await failToHandleMessage();
await failToHandleMessage();

// The source queue has given up on it.
const empty = await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

console.log(empty.Messages); // undefined

const dead = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl: DeadLetterQueueUrl }),
);

console.log(dead.Messages?.[0]?.Body); // "order-1"
```

The message keeps its `MessageId`, body and message attributes, and a test can identify it by any of
them. `ApproximateNumberOfMessages` on both queues reflects the move. A message deleted before its
attempts run out never gets there, and a message still inside its visibility timeout has not moved
yet, because the consumer holding it may still delete it.

`SentTimestamp` is unchanged by the move, as it is on a real standard queue. The dead-letter queue's
`MessageRetentionPeriod` therefore runs from when the message was first sent. That is why AWS
suggests giving a dead-letter queue a longer retention period than the queue feeding it.
`ApproximateReceiveCount` starts again from one, since a receive count counts receives from one queue
and the message has not been received from this one yet. A moved message also reports
`DeadLetterQueueSourceArn`, naming the queue it came from.

The policy is validated when it is set, whether by `CreateQueue` or `SetQueueAttributes`. It has to
be a JSON object with both a `deadLetterTargetArn` and a `maxReceiveCount` between 1 and 1000,
carried as a JSON number or as a string holding one. The `deadLetterTargetArn` has to name a queue
that already exists in the same account and region, as real SQS requires. A policy pointing at
nothing fails there and then, before a message has been lost to it. Anything else fails with
`InvalidParameterValue`.

`GetQueueAttributes` reports `RedrivePolicy` back as the string it was set with.

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

`MessageRetentionPeriod` works on the same clock. A message on the queue for longer than the
retention period (four days by default) is gone.

## Message attributes

Message attributes round-trip, and both digests are computed. `MD5OfMessageBody` is an MD5 of the
body, and `MD5OfMessageAttributes` uses the length-prefixed encoding real SQS digests attributes
with. A consumer checking either against its own digest is checking a real MD5.

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

The name and data type rules are the real ones. A data type is `String`, `Number` or `Binary`, and
each takes a custom label after a dot, so `Number.int` is a number as far as the rules go. A
reserved `AWS.` or `Amazon.` prefix on a name, a data type built on none of the three, or a value
that disagrees with its data type is refused. A test finds any of those without going near AWS.

The message system attributes are asked for separately, with `MessageSystemAttributeNames`, or with
the discontinued `AttributeNames` that means the same thing. `SentTimestamp`,
`ApproximateReceiveCount` and `ApproximateFirstReceiveTimestamp` are reported.

## Queue attributes

`GetQueueAttributes` returns only the attributes a request names, as real SQS does, and `All` names
every attribute this simulation holds. The defaults are the AWS ones. `VisibilityTimeout` is 30,
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

The other two settable attributes are JSON documents. `RedrivePolicy` is covered under
[dead-letter queues](#dead-letter-queues) above and `Policy` under
[queue policies](#queue-policies) below. Both are reported back as the string they were set with.

An attribute real SQS reports and this simulation does not model, `RedriveAllowPolicy` for one, is
left out of a response. Real SQS leaves out an attribute a queue has no value for in the same way.
Setting one is refused, because a queue that appeared to accept it would behave differently here than
on AWS.

`PurgeQueue` deletes everything on a queue, hidden messages included.

## IAM permissions

Every operation is authorized against the queue's ARN, which carries the queue name with no resource
type in front of it. Two details of real SQS trip policies up:

- `ListQueues` has no resource type at all. A policy allowing it names `*`. A policy naming one
  queue, or every queue in the Account and Region, grants no listing.
- The batch operations are authorized as their singular action. There is no `sqs:SendMessageBatch`,
  `sqs:DeleteMessageBatch` or `sqs:ChangeMessageVisibilityBatch` action for a policy to name.

The queue's own policy is part of the decision too, covered under [queue policies](#queue-policies)
below. A caller with no permission is refused whether or not the queue exists, since a queue that is
not there has no policy to admit anyone with.

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

## Queue policies

A queue's `Policy` attribute is its resource policy, and simulated IAM evaluates it as one. It is
what admits a service principal such as `s3.amazonaws.com`, which owns no identity policies
anywhere. It is also half of what admits a principal from another account, which needs an identity
policy in its own account as well.

The policy is set with `CreateQueue` or `SetQueueAttributes` and read back with
`GetQueueAttributes`.

```typescript sim-sqs-queue-policy
/**
 * A queue policy admitting S3 to send to a queue, for one Bucket only.
 */

import {
  CreateQueueCommand,
  SendMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sqs = simAws.sqs();
const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:orders`;

const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders" }),
);

await sqs.setQueueAttributes(
  new SetQueueAttributesCommand({
    QueueUrl,
    Attributes: {
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "s3.amazonaws.com" },
            Action: "sqs:SendMessage",
            Resource: queueArn,
            Condition: { ArnLike: { "aws:SourceArn": "arn:aws:s3:::uploads" } },
          },
        ],
      }),
    },
  }),
);

// S3 has no identity policies anywhere, so the queue policy is the whole
// decision. What it is sending for goes in as aws:SourceArn.
const s3 = { kind: "service", service: "s3.amazonaws.com" } as const;

const sent = await sqs.sendMessage(
  new SendMessageCommand({ QueueUrl, MessageBody: "uploads/order-1.json" }),
  { caller: s3, sourceArn: "arn:aws:s3:::uploads" },
);

console.log(sent.MessageId !== undefined); // true

// A Bucket the condition does not cover is refused.
try {
  await sqs.sendMessage(
    new SendMessageCommand({ QueueUrl, MessageBody: "reports/order-1.json" }),
    { caller: s3, sourceArn: "arn:aws:s3:::reports" },
  );
} catch (error) {
  console.log((error as Error).name); // "AccessDenied"
}
```

`sourceArn` is what a request says it is being made on behalf of, and `sourceAccount` is the Account
owning that resource, supplied as `aws:SourceAccount`. A request that omits one leaves the key out
entirely, and a statement conditioned on it matches nothing.

A simulated S3 Bucket notifying a queue supplies both. The `ArnLike aws:SourceArn` condition CDK
writes and the `StringEquals aws:SourceAccount` guard AWS documents are each enough on their own.
See [Event notifications](https://yulinsim.dev/services/s3/#event-notifications) on the S3 page for the whole chain.

A caller from another account needs both sides to allow the request, as it does on real AWS. The
queue policy has to name the principal, and that principal's own account has to allow the action.
Either one on its own is a denial.

The policy is validated when it is set, by `CreateQueue` or `SetQueueAttributes`. A malformed
document fails there, before anything has been authorized against it. It has to be a JSON policy
document whose statements each carry an `Effect` of `Allow` or `Deny`, an `Action` or `NotAction`,
and a `Resource` or `NotResource`. Anything else fails with `InvalidAttributeValue`.

`GetQueueAttributes` reports `Policy` back as the string it was set with.

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

`DeleteQueue` removes the queue and everything on it. Real SQS holds a deleted queue's name for 60
seconds, and so does this. Advancing simulated time past the hold frees the name. A stack redeployed
in the same test depends on that.

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
account and region and nowhere wider. The same name can name two different queues in two regions.

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

See [simulated Lambda](https://yulinsim.dev/services/lambda/ "Simulated Lambda docs") for how function code and execution roles
work. `SimSdk` interception works the same way. Intercepting `SQSClient` routes ordinary SDK code
into the simulation with nothing touching the network, covered under
[AWS SDK interception](https://yulinsim.dev/sdk/ "Simulated AWS SDK docs").

## Triggering a Lambda from a queue

A Lambda event source mapping delivers messages from a queue to a function without anything calling
`ReceiveMessage` itself. Messages sent to the queue arrive at the handler as an SQS event, in
batches of up to `BatchSize`.

Delivery runs on the simulation's background scheduler. A test waits for it with
`simAws.backgroundTasksComplete()`.

```typescript sim-sqs-lambda-event-source
/**
 * A message sent to a queue reaching a Lambda through an event source mapping.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

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

// Lambda polls the queue as the execution role, so the role has to allow it.
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
  }),
);

await simAws
  .sqs()
  .sendMessage(new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }));

await simAws.backgroundTasksComplete();

console.log(consumed); // ["order-1"]

// The handler returned, so the message has been deleted from the queue.
const remaining = await simAws
  .sqs()
  .receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

console.log(remaining.Messages); // undefined
```

A handler that throws leaves the whole batch on the queue instead. The messages stay hidden until
their visibility timeout lapses, come back after that, and eventually move to the dead-letter queue
if the queue has a `RedrivePolicy`. That is the path any other failing consumer takes, and advancing
the clock is what drives it:

```typescript
await simAws.clock().advanceBy({ seconds: 31 });
```

See [simulated Lambda](https://yulinsim.dev/services/lambda/#triggering-a-function-from-an-sqs-queue "Simulated Lambda event
source mapping docs") for the event shape, partial batch failures, and the
`AWS::Lambda::EventSourceMapping` template resource.

## Deploying a queue from CloudFormation

Simulated CloudFormation creates a queue from an `AWS::SQS::Queue` resource, in the stack's account
and region. The queue is created through `CreateQueue`. A template-created queue gets the same name
validation, the same attribute ranges and the same ARN and URL as one an SDK caller creates.

`Ref` on the resource gives the queue URL rather than its name or ARN, as it does on real AWS, and it
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
const queueUrl = stack.output("OrdersQueueUrl");

await simAws
  .sqs()
  .sendMessage(
    new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
  );

console.log(stack.output("OrdersQueueArn"));
// "arn:aws:sqs:us-east-1:888888888888:orders"
```

The properties applied to the queue are `VisibilityTimeout`, `DelaySeconds`,
`MessageRetentionPeriod`, `MaximumMessageSize`, `ReceiveMessageWaitTimeSeconds` and
`RedrivePolicy`. Each is passed to `CreateQueue`, and a value outside the range real SQS accepts
fails the resource.

`RedrivePolicy` is the same attribute [dead-letter queues](#dead-letter-queues) covers, and a
template goes through the validation an SDK caller goes through. CloudFormation carries the policy
as an object where SQS carries it as a JSON string, and both spellings arrive at `CreateQueue` the
same way. The `deadLetterTargetArn` has to name a queue that already exists. Naming the dead-letter
queue with `Fn::GetAtt` also puts the two queues in the order they have to be created in.

```typescript
{
  OrdersDlq: {
    Type: "AWS::SQS::Queue",
    Properties: { QueueName: "orders-dlq" },
  },
  OrdersQueue: {
    Type: "AWS::SQS::Queue",
    Properties: {
      QueueName: "orders",
      RedrivePolicy: {
        deadLetterTargetArn: { "Fn::GetAtt": ["OrdersDlq", "Arn"] },
        maxReceiveCount: 3,
      },
    },
  },
}
```

A message the queue gives up on reaches `orders-dlq`, and `GetQueueAttributes` on `orders` reports
the policy back. A policy real SQS would refuse fails the resource, in the words it refuses an SDK
caller with. Terraform's `redrive_policy` and its `aws_sqs_queue_redrive_policy` resource both map
onto this property. A plan carrying either deploys a working dead-letter queue.

A queue with no `QueueName` is named from the stack name, the logical ID and a tail derived from
both. The queue above with its name left out would be `orders-stack-OrdersQueue-` and twelve more
characters, where real CloudFormation ends the name in twelve random ones. The name is trimmed to
the 80 characters a queue name allows, and [the CloudFormation docs](https://yulinsim.dev/services/cloudformation/#names-cloudformation-generates "Names CloudFormation generates")
cover how the stack name and the logical ID share what is left.

`FifoQueue: true` fails the resource. Only standard queues are simulated, and a FIFO queue is named
`<name>.fifo`, a name simulated SQS refuses to an SDK caller as well. There is no queue to create
under the name the template gave it.

The properties this simulation has no behaviour for are a different case. The queue is created without
them and each one is recorded in
[`stack.ignoredProperties`](https://yulinsim.dev/services/cloudformation/#properties-a-resource-was-created-without).
A stack full of queues still deploys. Those properties are `RedriveAllowPolicy`, `KmsMasterKeyId`,
`KmsDataKeyReusePeriodSeconds`, `SqsManagedSseEnabled`, `ContentBasedDeduplication`,
`DeduplicationScope`, `FifoThroughputLimit` and `Tags`. A property outside the `AWS::SQS::Queue`
schema is recorded the same way.

`AWS::SQS::QueuePolicy` deploys the policy it names onto each queue in its `Queues` list, through
`SetQueueAttributes`. A policy declared in a template is therefore validated and enforced exactly as
one set through the SDK, and a document SQS would refuse fails the resource. `Queues` carries queue
URLs, and `Ref` on an `AWS::SQS::Queue` gives one.

```typescript
{
  Type: "AWS::SQS::QueuePolicy",
  Properties: {
    Queues: [{ Ref: "OrdersQueue" }],
    PolicyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "s3.amazonaws.com" },
          Action: "sqs:SendMessage",
          Resource: { "Fn::GetAtt": ["OrdersQueue", "Arn"] },
        },
      ],
    },
  },
}
```

CDK works without hand-editing. An `sqs.Queue` with `grantSendMessages(fn)` synthesises a template
that deploys here, with the queue URL reaching the function through its environment and the grant
policy naming the queue by the ARN `Fn::GetAtt` gives. A grant to a service principal synthesises an
`AWS::SQS::QueuePolicy` alongside it, which deploys too.

## Available functionality

Sim SQS currently supports:

- `CreateQueueCommand`, idempotent for a matching name and attributes, and `DeleteQueueCommand`
- `GetQueueUrlCommand` and `ListQueuesCommand`, with a name prefix and paging
- `GetQueueAttributesCommand`, `SetQueueAttributesCommand` and `PurgeQueueCommand`
- `SendMessageCommand` and `SendMessageBatchCommand`, with per-message or per-queue delays
- `ReceiveMessageCommand`, up to ten messages at a time, each under a fresh receipt handle
- `DeleteMessageCommand`, `DeleteMessageBatchCommand` and `ChangeMessageVisibilityCommand`
- Visibility timeouts, delays and message retention, all on the simulation's clock
- `RedrivePolicy`, moving a message to its dead-letter queue once its receives run out
- `MessageAttributes` round-tripping, with real `MD5OfMessageBody` and `MD5OfMessageAttributes` digests
- The `SentTimestamp`, `ApproximateReceiveCount`, `ApproximateFirstReceiveTimestamp` and
  `DeadLetterQueueSourceArn` system attributes
- Authorization of every operation by simulated IAM, against the real IAM action and queue ARN
- The `Policy` attribute as the queue's resource policy, admitting another account's principal or a
  service principal, with `aws:SourceArn` and `aws:SourceAccount` conditions honoured
- S3 event notifications sent to a queue, with the event document as the message body
- Calls made from inside a simulated Lambda handler, authorized as the function's execution role
- Lambda event source mappings, delivering messages to a simulated function and deleting the batches
  it handles
- `AWS::SQS::Queue` and `AWS::SQS::QueuePolicy` in a CloudFormation or CDK template, with `Ref`
  giving the queue URL and `Fn::GetAtt` giving `Arn`, `QueueName` and `QueueUrl`, and a
  `RedrivePolicy` on a queue naming its dead-letter queue

## Limitations

Current documented limitations:

- Standard queues only. A queue name ending in `.fifo` is refused, as are `MessageGroupId`,
  `MessageDeduplicationId` and `ReceiveRequestAttemptId`.
- Ordering and duplicates are stricter here than AWS promises. Messages come back oldest first, and a
  message is handed out to one consumer at a time. Real standard queues promise no ordering at all
  and guarantee at-least-once delivery, so a copy of a message can arrive twice there and messages
  can arrive out of order. Redelivery after a visibility timeout lapses is simulated, since that
  follows from the timeout. A duplicate arriving on its own is left out.
- Long polling answers at once. `WaitTimeSeconds` and `ReceiveMessageWaitTimeSeconds` are accepted
  and validated, and a receive returns immediately. The whole simulation runs in the calling process,
  where a wait could only ever time out.
- `DeleteQueue` and `PurgeQueue` take effect immediately, where real SQS may take up to 60 seconds
  over either. The 60-second hold on a deleted queue's name is simulated, so recreating a queue
  straight after deleting it fails with `QueueDeletedRecently` until the clock moves on.
- Dead-letter queues are simulated for standard queues only, and only the `RedrivePolicy` half of
  them. Setting `RedriveAllowPolicy` through the SQS API is refused, and on an `AWS::SQS::Queue` it
  is recorded and the queue created without it. A dead-letter queue cannot restrict which queues may
  redrive to it either way. `ListDeadLetterSourceQueues` and the `StartMessageMoveTask` family for
  draining a dead-letter queue back to its source are absent. A test moves a redriven message back by
  sending it again.
- `ApproximateReceiveCount` starting again from one on a dead-letter queue is this simulation's
  reading of SQS, and AWS documents no answer either way. A receive count counts receives from one
  queue, and the moved message has not been received from the dead-letter queue yet. `SentTimestamp`
  being unchanged by the move is documented AWS behaviour, and is simulated as such.
- A queue policy is set through the `Policy` attribute only. `AddPermission` and `RemovePermission`,
  shorthands for writing one statement of it, are absent.
- `GetQueueAttributes` reports the `Policy` string that was set. Real SQS re-serialises the document
  and adds an `Id` and a `Sid` to it, so what comes back there differs from what went in.
- A request naming a `QueueOwnerAWSAccountId` other than the scope's own account is refused. A queue
  policy admits another account's principal to a queue here, and leaves that account's own queues
  unreachable from this one.
- Encryption is left out. `KmsMasterKeyId`, `KmsDataKeyReusePeriodSeconds` and
  `SqsManagedSseEnabled` are recorded on an `AWS::SQS::Queue` and applied to nothing, and message
  bodies are held in process memory as they were sent. Anything sharing the process can read them.
- Tags are left out. `TagQueue`, `UntagQueue` and `ListQueueTags` are absent, and `CreateQueue`
  refuses a `tags` parameter rather than dropping it.
- `SenderId` is left out, because a simulated caller has no user or role id to report it as.
  `AWSTraceHeader` is left out too, and `MessageSystemAttributes` on a send are refused. Asking for
  any of them is accepted, as real SQS accepts a request for an attribute a message has no value for,
  and they are absent from the response.
- SQS condition keys are left out, and a policy relying on one matches nothing. Ordinary condition
  operators on values sim IAM does supply work as usual.
- `ChangeMessageVisibilityBatch` and the batch size limit (`BatchRequestTooLong`) are absent.
- A Lambda event source mapping polls one batch at a time. Real Lambda runs several pollers at once
  and scales them with the queue, and what that concurrency does to ordering is invisible here. See
  [simulated Lambda](https://yulinsim.dev/services/lambda/#triggering-a-function-from-an-sqs-queue "Simulated Lambda event
source mapping docs") for the rest of the mapping limitations.
- `AWS::SQS::Queue` and `AWS::SQS::QueuePolicy` are the SQS resource types CloudFormation creates.
  Any other is reported as unsupported and skipped. A queue attribute outside the range real SQS
  accepts fails the resource, and a property it has no behaviour for is recorded and the queue
  created without it.
- SQS is not served as an HTTP API by `serveSimAws`.
