# Simulated SNS

Yulin includes a simulated Amazon SNS for tests and local development. Topics are held in memory and
every operation is authorized by simulated IAM.

Standard topics only. SNS-specific types are imported from the `@kensio/yulin/sns` subpath.

A message published to a topic is delivered to every queue subscribed to it, invokes every Lambda
function subscribed to it, and is recorded as an SMS for every phone number subscribed to it. Only
those three protocols are simulated. A message published straight to a phone number is recorded
as an SMS a test can assert on.

## Creating a topic and publishing to it

```typescript sim-sns-create-and-publish
/**
 * Creating a simulated topic and publishing a message to it.
 */

import { CreateTopicCommand, PublishCommand } from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);

console.log(TopicArn); // "arn:aws:sns:us-east-1:888888888888:orders"

const { MessageId } = await sns.publish(
  new PublishCommand({
    TopicArn,
    Message: "order-1",
    Subject: "New order",
  }),
);

console.log(MessageId !== undefined); // true
```

A topic ARN is `arn:aws:sns:<region>:<account-id>:<name>`. An SNS ARN has no resource type in it.
The topic name follows the account id directly, the same as an SQS queue ARN.

`CreateTopic` is idempotent, as it is on real AWS. A second request for the same name returns the
existing topic's ARN and leaves that topic alone, and the attributes the second request carries are
ignored. SQS is stricter, and fails a repeated `CreateQueue` whose attributes differ.

A topic name is up to 256 characters of alphanumerics, hyphens and underscores. Anything else is
refused with `InvalidParameterException`, including a name ending in `.fifo`.

`DeleteTopic` removes the topic and frees its name at once, and a topic can be recreated straight
away. Deleting a topic that was never there succeeds, as it does on real SNS.

## Topic attributes

`GetTopicAttributes` returns everything the topic has. There is no list of attribute names on the
request, unlike the SQS command of the same shape.

`SetTopicAttributes` sets one attribute per request. The two with behaviour behind them are
`DisplayName` and `Policy`.

```typescript sim-sns-topic-attributes
/**
 * Reading and changing the attributes of a simulated topic.
 */

import {
  CreateTopicCommand,
  GetTopicAttributesCommand,
  SetTopicAttributesCommand,
} from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);

await sns.setTopicAttributes(
  new SetTopicAttributesCommand({
    TopicArn,
    AttributeName: "DisplayName",
    AttributeValue: "Orders",
  }),
);

const read = await sns.getTopicAttributes(
  new GetTopicAttributesCommand({ TopicArn }),
);

console.log(read.Attributes?.["DisplayName"]); // "Orders"
console.log(read.Attributes?.["Owner"]); // "888888888888"
console.log(read.Attributes?.["SubscriptionsConfirmed"]); // "0"
```

`DisplayName` is reported as an empty string for a topic that has never had one set, as real SNS
reports it. The three subscription counts are reported as zero, the counts a topic with no
subscriptions has.

An attribute real SNS has and this simulation gives no behaviour to is refused by name rather than
taken and ignored. That covers `FifoTopic`, `KmsMasterKeyId`, `SignatureVersion`, `TracingConfig`,
`ArchivePolicy`, `DeliveryPolicy`, `ContentBasedDeduplication` and the delivery status logging
attributes such as `SQSSuccessFeedbackRoleArn`. A topic that appeared to accept `KmsMasterKeyId`
would look encrypted to the request that set it and be plain to everything else.

## Publishing

`Publish` takes a `Message`, an optional `Subject`, and message attributes. A message and its
attributes together may be up to 256 KB.

```typescript sim-sns-message-attributes
/**
 * Message attributes on a published message.
 */

import { CreateTopicCommand, PublishCommand } from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);

const published = await sns.publish(
  new PublishCommand({
    TopicArn,
    Message: "order-1",
    MessageAttributes: {
      tenant: { DataType: "String", StringValue: "acme" },
      attempt: { DataType: "Number", StringValue: "1" },
      regions: {
        DataType: "String.Array",
        StringValue: JSON.stringify(["eu-west-2", "us-east-1"]),
      },
    },
  }),
);

console.log(published.MessageId !== undefined); // true
```

The name and data type rules are the real ones. A data type is `String`, `String.Array`, `Number` or
`Binary`, and each takes a custom label after a dot, so `Number.int` is a number as far as the rules
go. A reserved `AWS.` or `Amazon.` prefix on a name, a data type built on none of the four, or a
value that disagrees with its data type is refused. A test finds any of those without going near AWS. The two reserved names real
SNS defines for SMS, `AWS.SNS.SMS.SenderID` and `AWS.SNS.SMS.SMSType`, are the exception.
[Sending an SMS](#sending-an-sms) covers those.

A `Subject` is UTF-8 text with no line breaks or control characters, of fewer than 100 characters.
That is the contract real SNS states. A subject of exactly 100 characters is already too long. A
publish with no `Message`, or with one over the size limit, is refused with
`InvalidParameterException`.

`PublishBatch` takes up to ten entries. An entry that fails on its own is reported in `Failed` while
the rest of the batch goes through, as real SNS reports it. An empty batch, more than ten entries, a
malformed entry id or two entries sharing an id fail the whole request.

The size limit is the one thing a batch is held to as a whole. Ten entries each just inside it are
one batch far outside it, and a single entry over it fails the whole batch with
`BatchRequestTooLongException`. The response singles out no entry.

```typescript sim-sns-publish-batch
/**
 * A batch publish where one entry fails on its own.
 */

import { CreateTopicCommand, PublishBatchCommand } from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);

const published = await sns.publishBatch(
  new PublishBatchCommand({
    TopicArn,
    PublishBatchRequestEntries: [
      { Id: "one", Message: "order-1" },
      {
        Id: "two",
        Message: "order-2",
        // "Map" is not an SNS message attribute data type.
        MessageAttributes: { tenant: { DataType: "Map", StringValue: "acme" } },
      },
    ],
  }),
);

console.log(published.Successful?.map((entry) => entry.Id)); // ["one"]
console.log(published.Failed?.[0]?.Code); // "InvalidParameterValueException"
```

## Sending an SMS

A `Publish` that names a `PhoneNumber` sends an SMS to that number. The message stays inside the
simulation. Simulated SNS records what it would have texted, and `sentSmsMessages()` on the service
reads the records back, oldest first. A topic texts a number as well, under
[texting a subscribed number](#texting-a-subscribed-number).

```typescript sim-sns-sms
/**
 * Publishing an SMS to a phone number and reading the record back.
 */

import {
  CheckIfPhoneNumberIsOptedOutCommand,
  PublishCommand,
} from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();

const { MessageId } = await sns.publish(
  new PublishCommand({
    PhoneNumber: "+15550100",
    Message: "Your code is 123456",
    MessageAttributes: {
      "AWS.SNS.SMS.SenderID": { DataType: "String", StringValue: "Orders" },
      "AWS.SNS.SMS.SMSType": {
        DataType: "String",
        StringValue: "Transactional",
      },
    },
  }),
);

const [sent] = sns.sentSmsMessages();

console.log(sent?.phoneNumber); // "+15550100"
console.log(sent?.message); // "Your code is 123456"
console.log(sent?.senderId); // "Orders"
console.log(sent?.suppressed); // false
console.log(sent?.messageId === MessageId); // true

// On real SNS a recipient opts out by replying STOP. Nothing in a test process
// can reply, so the simulator does it.
sns.optOutPhoneNumber("+15550100");

await sns.publish(
  new PublishCommand({
    PhoneNumber: "+15550100",
    Message: "Your code is 654321",
  }),
);

const [, stopped] = sns.sentSmsMessages();

console.log(stopped?.suppressed); // true

const { isOptedOut } = await sns.checkIfPhoneNumberIsOptedOut(
  new CheckIfPhoneNumberIsOptedOutCommand({ phoneNumber: "+15550100" }),
);

console.log(isOptedOut); // true
```

The number is E.164, a plus sign followed by up to fifteen digits. Anything else is refused with
`InvalidParameterException`. A publish naming both a `TopicArn` and a `PhoneNumber` is refused as
well, since one of the two would otherwise win silently.

`AWS.SNS.SMS.SenderID` and `AWS.SNS.SMS.SMSType` are the two reserved attributes a publish may carry.
Both are recorded, and the record reads them back as `senderId` and `smsType`. The other reserved SMS
attributes are refused by name. `AWS.SNS.SMS.MaxPrice` caps what a message may cost, and
`AWS.MM.SMS.OriginationNumber`, `AWS.MM.SMS.EntityId` and `AWS.MM.SMS.TemplateId` pick the routing
and the registration it travels under. Each one changes a real send. Here it would be inert.

Real SNS puts a number on the opt-out list when the recipient replies STOP, and its API only takes
numbers back off. Standing in for the handset is the simulator's job. `optOutPhoneNumber` on the
service is what puts a number on the list, the same kind of accessor as `verifyIdentity` on simulated
SES.

A publish to a number on the list succeeds and answers with a `MessageId`, as it does on real SNS.
The record for that message says `suppressed`. A test can then tell a message that would have arrived
from one the opt-out list stopped. `CheckIfPhoneNumberIsOptedOutCommand` and
`ListPhoneNumbersOptedOutCommand` read the list, and `OptInPhoneNumberCommand` takes a number back
off it. Real SNS allows an opt-in once every thirty days per number, and that limit is absent here.

The records and the opt-out list belong to one account and region, the way topics do. A message
published in `eu-west-2` is invisible from `us-east-1`.

## Subscriptions

`Subscribe` with the `sqs` protocol and a queue ARN, the `lambda` protocol and a function ARN, or the
`sms` protocol and a phone number, answers with a subscription ARN straight away. There is no
confirmation step for any of the three, as there is none on real SNS. The subscription is confirmed
the moment it exists.

```typescript sim-sns-subscriptions
/**
 * Subscribing a queue to a simulated topic, and reading the subscription back.
 */

import {
  CreateTopicCommand,
  GetSubscriptionAttributesCommand,
  ListSubscriptionsByTopicCommand,
  SetSubscriptionAttributesCommand,
  SubscribeCommand,
  UnsubscribeCommand,
} from "@aws-sdk/client-sns";
import { CreateQueueCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);

await simAws
  .sqs()
  .createQueue(new CreateQueueCommand({ QueueName: "order-consumer" }));

const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:order-consumer`;

// An sqs subscription needs no confirmation, so the ARN comes back at once
// rather than "pending confirmation".
const { SubscriptionArn } = await sns.subscribe(
  new SubscribeCommand({ TopicArn, Protocol: "sqs", Endpoint: queueArn }),
);

console.log(SubscriptionArn?.startsWith(`${TopicArn ?? ""}:`)); // true

const listed = await sns.listSubscriptionsByTopic(
  new ListSubscriptionsByTopicCommand({ TopicArn }),
);

console.log(listed.Subscriptions?.[0]?.Endpoint === queueArn); // true

// The subscription reports what it is and how it delivers.
const read = await sns.getSubscriptionAttributes(
  new GetSubscriptionAttributesCommand({ SubscriptionArn }),
);

console.log(read.Attributes?.["PendingConfirmation"]); // "false"
console.log(read.Attributes?.["RawMessageDelivery"]); // "false"

await sns.setSubscriptionAttributes(
  new SetSubscriptionAttributesCommand({
    SubscriptionArn,
    AttributeName: "RawMessageDelivery",
    AttributeValue: "true",
  }),
);

await sns.unsubscribe(new UnsubscribeCommand({ SubscriptionArn }));

console.log(simAws.sns().topicSubscriptions("orders").length); // 0
```

A subscription ARN is the topic's ARN with an opaque id on the end. That is the only handle on a
subscription. `Unsubscribe`, `GetSubscriptionAttributes` and `SetSubscriptionAttributes` all name one
by it.

The endpoint has to be what the protocol implies, and it is checked when the subscription is made. A
queue ARN over the `lambda` protocol is refused, as it is on real SNS, and so is an `sms` endpoint
outside E.164. A qualified function ARN naming a version or an alias is refused too, since simulated
Lambda has no versions or aliases. Subscribing `$LATEST` in its place would be a different function
from the one asked for.

Subscribing the same endpoint to the same topic twice answers with the subscription that is already
there, as real SNS does. The attributes the repeated request carries are ignored, the same way a
repeated `CreateTopic` leaves the existing topic alone. They are still validated, and a repeated
request naming an attribute this simulation has no place for is still refused.

`RawMessageDelivery` can be set on the `Subscribe` request or afterwards with
`SetSubscriptionAttributes`, and its value is `"true"` or `"false"`. Anything else is refused.
Reading it as false would silently change what the subscription delivers. The other two attributes with behaviour
behind them are `FilterPolicy`
and `FilterPolicyScope`, under
[filtering what a subscription receives](#filtering-what-a-subscription-receives).

`Unsubscribe` of an ARN that names no subscription is `NotFoundException`, so unsubscribing the same
ARN twice fails the second time. `DeleteTopic` removes the topic's subscriptions along with it, and a
topic recreated under the same name starts with none.

`GetTopicAttributes` counts the topic's subscriptions in `SubscriptionsConfirmed`, and counts the
ones that have been unsubscribed in `SubscriptionsDeleted`. `SubscriptionsPending` is always zero,
because no protocol simulated needs a confirmation.

Only the `sqs`, `lambda` and `sms` protocols are simulated. Every other protocol real SNS has is
refused by name at `Subscribe` time, with the reason it is missing. The alternative would be a
subscription that never delivers anything.

## Delivering to a queue

Publishing to a topic delivers one message to each subscribed queue. That happens after the publish
has been answered, as it does on real SNS. A test waits for it with
`simAws.backgroundTasksComplete()` before receiving.

```typescript sim-sns-fan-out
/**
 * Publishing once and having two queues each receive a copy.
 */

import {
  CreateTopicCommand,
  PublishCommand,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();
const sqs = simAws.sqs();

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);

/**
 * Create a queue that admits SNS to send to it for this topic, and subscribe
 * it. The queue policy is what allows the delivery, and it is checked on every
 * message rather than remembered from subscribe time.
 */
async function subscribeQueue(queueName: string): Promise<string> {
  const { QueueUrl } = await sqs.createQueue(
    new CreateQueueCommand({ QueueName: queueName }),
  );
  const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:${queueName}`;

  await sqs.setQueueAttributes(
    new SetQueueAttributesCommand({
      QueueUrl,
      Attributes: {
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "sns.amazonaws.com" },
              Action: "sqs:SendMessage",
              Resource: queueArn,
              Condition: { ArnLike: { "aws:SourceArn": TopicArn } },
            },
          ],
        }),
      },
    }),
  );

  await sns.subscribe(
    new SubscribeCommand({ TopicArn, Protocol: "sqs", Endpoint: queueArn }),
  );

  return QueueUrl ?? "";
}

const fulfilment = await subscribeQueue("fulfilment");
const audit = await subscribeQueue("audit");

await sns.publish(new PublishCommand({ TopicArn, Message: "order-1" }));

// Delivery happens after the publish is answered, as it does on real SNS.
await simAws.backgroundTasksComplete();

for (const QueueUrl of [fulfilment, audit]) {
  const { Messages } = await sqs.receiveMessage(
    new ReceiveMessageCommand({ QueueUrl }),
  );
  const envelope = JSON.parse(Messages?.[0]?.Body ?? "{}") as {
    Type: string;
    Message: string;
  };

  console.log(envelope.Type); // "Notification"
  console.log(envelope.Message); // "order-1"
}
```

The queue's policy is what allows the delivery. It has to admit `sns.amazonaws.com` for
`sqs:SendMessage`, and the `aws:SourceArn` condition is what keeps one topic's grant from opening the
queue to another. The policy is checked on every message rather than remembered from subscribe time,
and a permission taken away afterwards stops delivery.

The subscription is made without checking the queue, as it is on real SNS. A subscription to a queue
that is absent, or to one whose policy says no, is created and fails when a message is delivered to
it.

A failed delivery goes unreported to the publisher, as it does on real SNS. The publish is answered
with a `MessageId` before anything is delivered. The failure is recorded instead, and a queue that is
unexpectedly empty says why:

```typescript
const [failure] = simAws.sns().deliveryFailures;

console.log(failure?.endpointArn);
console.log(failure?.reason);
console.log(failure?.wasRefused); // true when the queue policy said no
```

A queue in another account or another region receives a message the same way. Real SNS delivers
across both. Simulated S3 event notifications are stricter, since real S3 requires a destination
queue to be in the bucket's region, where a topic delivers to a queue in any region.

## The message a queue receives

By default the body is the SNS envelope, the JSON document real SNS wraps a published message in. A
consumer reads the message out of it with `JSON.parse(body).Message`:

```json
{
  "Type": "Notification",
  "MessageId": "0f2a0a49-9e3f-4d02-9e5f-2d9f0e5b6d51",
  "TopicArn": "arn:aws:sns:us-east-1:888888888888:orders",
  "Subject": "New order",
  "Message": "order-1",
  "Timestamp": "2026-01-01T00:00:00.000Z",
  "SignatureVersion": "1",
  "Signature": "...",
  "SigningCertURL": "https://sns.us-east-1.yulin.invalid/SimulatedNotificationService-....pem",
  "UnsubscribeURL": "https://sns.us-east-1.yulin.invalid/?Action=Unsubscribe&SubscriptionArn=...",
  "MessageAttributes": { "tenant": { "Type": "String", "Value": "acme" } }
}
```

`Subject` and `MessageAttributes` are there only when the publish carried them. A binary message
attribute travels base64 encoded, since the envelope is JSON.

With `RawMessageDelivery` set to `true` on the subscription, the body is the published `Message` on
its own and the published message attributes arrive as SQS message attributes instead. Both matter,
because a consumer written for one breaks on the other.

## Delivering to a Lambda function

Subscribing a function with the `lambda` protocol invokes it once per published message, with the SNS
event shape. The function's resource policy has to allow `sns.amazonaws.com` to invoke it for the
topic. `AddPermission` grants that:

```typescript sim-sns-lambda-delivery
/**
 * Invoking a simulated Lambda function from a simulated topic.
 */

import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateTopicCommand,
  PublishCommand,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

interface SnsRecord {
  EventSource: string;
  Sns: { Subject: string | null; Message: string };
}

const simAws = new SimAws();
const sns = simAws.sns();
const consumerArn = `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:order-consumer`;

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "order-consumer",
    Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrderConsumerRole`,
    Code: {
      ZipFile: makeLambdaZipFileInput((event: { Records: [SnsRecord] }) => {
        const [record] = event.Records;

        console.log(record.EventSource); // "aws:sns"
        console.log(record.Sns.Subject); // "New order"
        console.log(record.Sns.Message); // "order-1"

        return "handled";
      }),
    },
  }),
);

// The function's resource policy is what allows the invocation, and it is
// checked on every message rather than remembered from subscribe time.
await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "order-consumer",
    StatementId: "AllowSns",
    Action: "lambda:InvokeFunction",
    Principal: "sns.amazonaws.com",
    SourceArn: TopicArn,
  }),
);

// A lambda subscription needs no confirmation either, so the ARN comes back at
// once.
await sns.subscribe(
  new SubscribeCommand({ TopicArn, Protocol: "lambda", Endpoint: consumerArn }),
);

await sns.publish(
  new PublishCommand({ TopicArn, Subject: "New order", Message: "order-1" }),
);

// The invocation happens after the publish is answered, as it does on real SNS.
await simAws.backgroundTasksComplete();
```

The permission is checked on every message rather than remembered from subscribe time, and one taken
away afterwards stops delivery. The subscription is made without checking the function, the same as a
queue subscription. A subscription to a function that is absent, or to one whose policy says no, is
created and fails when a message is delivered to it. Both failures are recorded on
`simAws.sns().deliveryFailures` the same way a queue's are, and a handler that throws is recorded
there too. Delivery to the topic's other subscriptions carries on.

A function in another account or another region is invoked the same way, on that account's own
resource policy.

## The event a Lambda function receives

`Records` always holds exactly one entry, even when the message came from a `PublishBatch`. Real SNS
gives each published message its own invocation. A handler looping over `Records` sees one message
per call.

```json
{
  "Records": [
    {
      "EventSource": "aws:sns",
      "EventVersion": "1.0",
      "EventSubscriptionArn": "arn:aws:sns:us-east-1:888888888888:orders:8f1c...",
      "Sns": {
        "Type": "Notification",
        "MessageId": "0f2a0a49-9e3f-4d02-9e5f-2d9f0e5b6d51",
        "TopicArn": "arn:aws:sns:us-east-1:888888888888:orders",
        "Subject": "New order",
        "Message": "order-1",
        "Timestamp": "2026-01-01T00:00:00.000Z",
        "SignatureVersion": "1",
        "Signature": "...",
        "SigningCertUrl": "https://sns.us-east-1.yulin.invalid/SimulatedNotificationService-....pem",
        "UnsubscribeUrl": "https://sns.us-east-1.yulin.invalid/?Action=Unsubscribe&SubscriptionArn=...",
        "MessageAttributes": { "tenant": { "Type": "String", "Value": "acme" } }
      }
    }
  ]
}
```

Two fields are spelled differently from the envelope a queue receives. The envelope has
`SigningCertURL` and `UnsubscribeURL`, and the Lambda event has `SigningCertUrl` and
`UnsubscribeUrl`. That is real SNS behaviour, and a consumer has to be written against it. `Subject`
and `MessageAttributes` are always present here as well, carrying `null` and `{}` for a publish that
omitted them, where the envelope leaves both out.

`RawMessageDelivery` has no effect on a `lambda` subscription. Real SNS treats it as an SQS and HTTP
setting, and a function is invoked with the whole event whatever the value.

## Texting a subscribed number

Subscribing a phone number with the `sms` protocol records one SMS per published message the
subscription accepts. The records are the ones `sentSmsMessages()` reads back, alongside those a
publish straight to a `PhoneNumber` leaves.

```typescript sim-sns-sms-subscription
/**
 * Fanning a published message out to a subscribed phone number.
 */

import {
  CreateTopicCommand,
  PublishCommand,
  SubscribeCommand,
} from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "alerts" }),
);

// An sms subscription needs no confirmation either, so the ARN comes back at
// once.
const { SubscriptionArn } = await sns.subscribe(
  new SubscribeCommand({
    TopicArn,
    Protocol: "sms",
    Endpoint: "+15550100",
    Attributes: { FilterPolicy: JSON.stringify({ severity: ["high"] }) },
  }),
);

await sns.publish(
  new PublishCommand({
    TopicArn,
    Subject: "Disk usage",
    Message: "Disk full",
    MessageAttributes: {
      severity: { DataType: "String", StringValue: "high" },
    },
  }),
);

// A topic delivers after the publish has been answered, as it does on real
// SNS.
await simAws.backgroundTasksComplete();

const [sms] = sns.sentSmsMessages();

console.log(sms?.phoneNumber); // "+15550100"
console.log(sms?.message); // "Disk full"
console.log(sms?.topicArn === TopicArn); // true
console.log(sms?.subscriptionArn === SubscriptionArn); // true
console.log(sms?.suppressed); // false
```

The recorded body is the message as it was published. A handset receives the text on its own, and the
SNS envelope a queue receives and the `Subject` an email carries are both left off.

Each record names the topic and the subscription that produced it, in `topicArn` and
`subscriptionArn`. A record from a publish straight to a phone number leaves both undefined. That is
how a test tells one kind of send from the other. The `messageId` is the one the publish was answered
with, so every SMS one publish fanned out carries it.

A filter policy applies to an `sms` subscription the way it applies to any other. The number receives
the messages its own policy accepts, and the rest of the topic's subscriptions are unaffected.

A subscribed number on the opt-out list has its message recorded as `suppressed`, and the publish
still succeeds. The topic's other subscriptions receive theirs. `optOutPhoneNumber` on the service is
what puts a number on the list, under [sending an SMS](#sending-an-sms).

`Unsubscribe` stops the texting. A message published afterwards leaves no record for that number.

## Filtering what a subscription receives

A subscription with a `FilterPolicy` receives only the messages its policy matches. Every other
subscription of the topic is unaffected, and one subscriber filtering a message out leaves what
another receives alone. A policy applies to a subscribed function as it does to a subscribed queue.
It decides whether the message reaches the subscription at all, whatever the subscription delivers
to.

The policy is a JSON document of keys and the match conditions each one accepts. Separate keys are an
and, and the list a key holds is an or.

```typescript sim-sns-filter-policy
/**
 * Two queues on one topic, each taking the messages its policy names.
 */

import {
  CreateTopicCommand,
  PublishCommand,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();
const sqs = simAws.sqs();

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);

/**
 * Subscribe a queue that admits SNS, with a filter policy of its own.
 */
async function subscribeQueue(
  queueName: string,
  filterPolicy: unknown,
): Promise<string> {
  const { QueueUrl } = await sqs.createQueue(
    new CreateQueueCommand({ QueueName: queueName }),
  );
  const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:${queueName}`;

  await sqs.setQueueAttributes(
    new SetQueueAttributesCommand({
      QueueUrl,
      Attributes: {
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "sns.amazonaws.com" },
              Action: "sqs:SendMessage",
              Resource: queueArn,
              Condition: { ArnEquals: { "aws:SourceArn": TopicArn } },
            },
          ],
        }),
      },
    }),
  );

  await sns.subscribe(
    new SubscribeCommand({
      TopicArn,
      Protocol: "sqs",
      Endpoint: queueArn,
      Attributes: { FilterPolicy: JSON.stringify(filterPolicy) },
    }),
  );

  return QueueUrl ?? "";
}

const orders = await subscribeQueue("order-handling", { type: ["order"] });
const refunds = await subscribeQueue("refund-handling", { type: ["refund"] });

await sns.publish(
  new PublishCommand({
    TopicArn,
    Message: "order-1",
    MessageAttributes: { type: { DataType: "String", StringValue: "order" } },
  }),
);

await simAws.backgroundTasksComplete();

const delivered = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl: orders }),
);
const filtered = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl: refunds }),
);

console.log(delivered.Messages?.length); // 1
console.log(filtered.Messages); // undefined
```

By default a policy is matched against the message attributes of the publish, under the
`MessageAttributes` scope. These are the operators:

| Condition                               | Matches                                     |
| --------------------------------------- | ------------------------------------------- |
| `"order"`                               | that value exactly, case sensitively        |
| `["order", "refund"]`                   | either value, since a list is an or         |
| `{"prefix": "order-"}`                  | the start of the value                      |
| `{"suffix": ".csv"}`                    | the end of the value                        |
| `{"equals-ignore-case": "Order"}`       | the value in any case                       |
| `{"anything-but": "order"}`             | every value but that one                    |
| `{"anything-but": ["order", "refund"]}` | every value but those                       |
| `{"anything-but": {"prefix": "tmp-"}}`  | every value not starting that way           |
| `{"numeric": [">", 100]}`               | a number, with `=`, `<`, `<=`, `>` and `>=` |
| `{"numeric": [">", 0, "<=", 100]}`      | a number inside a range                     |
| `{"exists": true}`                      | the key being there, holding something      |
| `{"exists": false}`                     | the key not being there                     |

Only `{"exists": false}` matches a key the message leaves out. Every other operator needs a value to
look at, `anything-but` included. An absent key holds no value to be anything but the excluded one.

`{"exists": false}` also needs the message to carry some other key, which real SNS states as well. A
publish with no message attributes at all matches no filter policy of the default scope, this one
included. Under the `MessageBody` scope the same goes for a body holding no keys. A body that fails
to parse as JSON matches no policy, whichever operator it uses.

Numeric matching applies to the `Number` message attribute data type, as it does on real SNS. Digits
published as a `String` are text. A `String.Array` attribute matches when any member of it does. A
`Binary` attribute matches no condition, since filtering is on text.

`$or` matches when either of two separate keys does, which the rest of a policy cannot say:

```json
{ "$or": [{ "type": ["order"] }, { "tenant": ["acme"] }] }
```

Real SNS reads `$or` as an or only when it holds a list of at least two objects, none of which names
a reserved keyword such as `numeric` or `prefix`. Anything else is an attribute named `$or` there,
and the policy quietly stops being an or, matching no message at all. Each of those is refused here
when the policy is set.

### Filtering on the message body

With `FilterPolicyScope` set to `MessageBody`, the policy is matched against the message body read as
JSON. That is the scope that nests. A policy names a nested key by nesting itself.

```typescript sim-sns-filter-policy-body
/**
 * Filtering on a nested key of the published message body.
 */

import {
  CreateTopicCommand,
  PublishCommand,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();
const sqs = simAws.sqs();

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);
const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "gold-orders" }),
);
const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:gold-orders`;

await sqs.setQueueAttributes(
  new SetQueueAttributesCommand({
    QueueUrl,
    Attributes: {
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "sns.amazonaws.com" },
            Action: "sqs:SendMessage",
            Resource: queueArn,
            Condition: { ArnEquals: { "aws:SourceArn": TopicArn } },
          },
        ],
      }),
    },
  }),
);

await sns.subscribe(
  new SubscribeCommand({
    TopicArn,
    Protocol: "sqs",
    Endpoint: queueArn,
    Attributes: {
      FilterPolicyScope: "MessageBody",
      FilterPolicy: JSON.stringify({
        customer: { tier: ["gold"] },
        amount: [{ numeric: [">", 100] }],
      }),
    },
  }),
);

for (const body of [
  { customer: { tier: "silver" }, amount: 500 },
  { customer: { tier: "gold" }, amount: 500 },
]) {
  await sns.publish(
    new PublishCommand({ TopicArn, Message: JSON.stringify(body) }),
  );
}

await simAws.backgroundTasksComplete();

const { Messages } = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl, MaxNumberOfMessages: 10 }),
);

console.log(Messages?.length); // 1
```

A body that fails to parse as JSON, or that parses to something other than an object, matches no
policy of this scope. The result is a miss, and the publish still succeeds. The body comes from
whoever published,
the scope is the subscription's own business, and a publisher would otherwise fail on a subscription
it knows nothing of. A key holding `null`, an object or an empty list holds no value to match, so it
is a key `{"exists": false}` matches, as long as the body holds some other key.

The two attributes can be set on `Subscribe` or afterwards with `SetSubscriptionAttributes`, and
`GetSubscriptionAttributes` reports both once a policy is set. Setting `FilterPolicy` with no value
takes the policy off, and the subscription receives everything again.

A policy is read when it is set rather than when a message arrives. An operator real SNS has never
had, a match condition naming two operators, a key holding no conditions, and a nested key under the
`MessageAttributes` scope are all refused there. So is `cidr`, the one real SNS operator missing
here.

## Verifying a message signature

The `Signature` in the envelope is a real RSA signature over the string real SNS signs. That string
is the signed fields in alphabetical order, each one its name and its value followed by a newline.
Signature version `1` is SHA1withRSA, and real SNS signs with it unless a topic opts into version 2.

The key pair belongs to the simulated SNS scope, as a real signing certificate belongs to a region.
`SigningCertURL` names its certificate, and `simAws.sns().signingCertificate(url)` hands it over.
Fetching the URL itself fails, since simulated SNS has no HTTP endpoint.

```typescript sim-sns-message-signature
/**
 * Verifying the signature on a message a simulated topic delivered.
 */

import { createVerify } from "node:crypto";

import {
  CreateTopicCommand,
  PublishCommand,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();
const sqs = simAws.sqs();

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);
const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders" }),
);
const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:orders`;

await sqs.setQueueAttributes(
  new SetQueueAttributesCommand({
    QueueUrl,
    Attributes: {
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "sns.amazonaws.com" },
            Action: "sqs:SendMessage",
            Resource: queueArn,
            Condition: { ArnLike: { "aws:SourceArn": TopicArn } },
          },
        ],
      }),
    },
  }),
);

await sns.subscribe(
  new SubscribeCommand({ TopicArn, Protocol: "sqs", Endpoint: queueArn }),
);

await sns.publish(new PublishCommand({ TopicArn, Message: "order-1" }));
await simAws.backgroundTasksComplete();

const { Messages } = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl }),
);
const envelope = JSON.parse(Messages?.[0]?.Body ?? "{}") as {
  Type: string;
  MessageId: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  TopicArn: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
};

// The string SNS signs is the signed fields in alphabetical order, each one its
// name and its value followed by a newline. A field the message does not carry,
// such as Subject, is left out.
const signed = (
  [
    ["Message", envelope.Message],
    ["MessageId", envelope.MessageId],
    ["Subject", envelope.Subject],
    ["Timestamp", envelope.Timestamp],
    ["TopicArn", envelope.TopicArn],
    ["Type", envelope.Type],
  ] as const
)
  .filter(([, value]) => value !== undefined)
  .map(([name, value]) => `${name}\n${value ?? ""}\n`)
  .join("");

// The certificate comes from the simulator rather than from the network: the
// SigningCertURL names the simulated host and nothing serves it.
const certificate = sns.signingCertificate(envelope.SigningCertURL);

const verified = createVerify("RSA-SHA1")
  .update(signed, "utf8")
  .verify(certificate ?? "", envelope.Signature, "base64");

console.log(envelope.SignatureVersion); // "1"
console.log(verified); // true
```

The message attributes stay out of the signature, here and on real AWS, and changing one in flight
leaves the signature valid.

## IAM permissions

Every operation is authorized against the topic's ARN, which carries the topic name with no resource
type in front of it. Three details of real SNS trip policies up:

- `ListTopics` has no resource type at all. It is authorized against `*`, and only a policy whose
  `Resource` is `*` allows it. A policy naming one topic grants no listing, and one naming
  `arn:aws:sns:<region>:<account-id>:*` grants none either.
- `Unsubscribe`, `ListSubscriptions`, `GetSubscriptionAttributes` and `SetSubscriptionAttributes`
  have no resource type either, for the same reason. SNS has no subscription resource type for a
  policy to name. They are authorized against `*`, out of reach of a topic policy and of an identity
  policy naming the topic ARN. `Subscribe` and `ListSubscriptionsByTopic` do name a topic, and are
  authorized against its ARN.
- `PublishBatch` is authorized as `sns:Publish`. There is no `sns:PublishBatch` action for a policy to
  name.

A denial is `AuthorizationErrorException`, the error real SNS answers with. Most other services use
`AccessDenied`.

```typescript sim-sns-iam-policy
/**
 * A Role allowed to publish to one simulated topic and nothing else.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateTopicCommand,
  ListTopicsCommand,
  PublishCommand,
} from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;
const regionName = simAws.defaultRegionName;
const sns = simAws.sns();

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrderPublisher",
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
    RoleName: "OrderPublisher",
    PolicyName: "PublishOrders",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "sns:Publish",
        // A topic ARN has no resource type: not "...:topic/orders".
        Resource: `arn:aws:sns:${regionName}:${accountId}:orders`,
      },
    }),
  }),
);

const caller = { kind: "arn", arn: role.Role.Arn } as const;

const published = await sns.publish(
  new PublishCommand({ TopicArn, Message: "order-1" }),
  { caller },
);

console.log(published.MessageId !== undefined); // true

// Listing is not covered by a policy naming one topic.
try {
  await sns.listTopics(new ListTopicsCommand({}), { caller });
} catch (error) {
  console.log((error as Error).name); // "AuthorizationErrorException"
}
```

## Topic policies

A topic's `Policy` attribute is its resource policy, and simulated IAM evaluates it as one. It is
what admits a service principal such as `s3.amazonaws.com`, which owns no identity policies
anywhere. It is also half of what admits a principal from another account, which needs an identity
policy in its own account as well.

The policy is set with `CreateTopic` or `SetTopicAttributes` and read back with `GetTopicAttributes`.

```typescript sim-sns-topic-policy
/**
 * A topic policy admitting S3 to publish to a topic, for one Bucket only.
 */

import {
  CreateTopicCommand,
  PublishCommand,
  SetTopicAttributesCommand,
} from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();
const topicArn = `arn:aws:sns:${simAws.defaultRegionName}:${simAws.defaultAccountId}:orders`;

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);

await sns.setTopicAttributes(
  new SetTopicAttributesCommand({
    TopicArn,
    AttributeName: "Policy",
    AttributeValue: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "s3.amazonaws.com" },
          Action: "SNS:Publish",
          Resource: topicArn,
          Condition: { ArnLike: { "aws:SourceArn": "arn:aws:s3:::uploads" } },
        },
      ],
    }),
  }),
);

// S3 has no identity policies anywhere, so the topic policy is the whole
// decision. What it is publishing for goes in as aws:SourceArn.
const s3 = { kind: "service", service: "s3.amazonaws.com" } as const;

const published = await sns.publish(
  new PublishCommand({ TopicArn, Message: "uploads/order-1.json" }),
  { caller: s3, sourceArn: "arn:aws:s3:::uploads" },
);

console.log(published.MessageId !== undefined); // true

// A Bucket the condition does not cover is refused.
try {
  await sns.publish(
    new PublishCommand({ TopicArn, Message: "reports/order-1.json" }),
    { caller: s3, sourceArn: "arn:aws:s3:::reports" },
  );
} catch (error) {
  console.log((error as Error).name); // "AuthorizationErrorException"
}
```

`sourceArn` is what a request says it is being made on behalf of, and `sourceAccount` is the Account
owning that resource, supplied as `aws:SourceAccount`. A request that omits one leaves the key out
entirely, and a statement conditioned on it matches nothing.

A caller from another account needs both sides to allow the request, as it does on real AWS. The
topic policy has to name the principal, and that principal's own account has to allow the action.
Either one on its own is a denial.

The policy is validated when it is set. A malformed document fails there, before anything has been
authorized against it. It has to be a JSON policy document whose statements each carry an `Effect` of
`Allow` or `Deny`, an `Action` or `NotAction`, and a `Resource` or `NotResource`. Anything else fails
with `InvalidParameterException`.

`GetTopicAttributes` reports `Policy` back as the string it was set with. Setting the attribute with
no value takes the policy off the topic, the only way back to a topic without one.

## Taking S3 Object events

A simulated S3 Bucket can publish its event notifications to a topic. The topic then fans them out to
its own subscribers, and one Bucket configuration reaches every queue subscribed to the topic.

Set up the topic policy first. S3 asks the topic whether it may publish when the notification
configuration is applied, and asks again for every event. A policy that leaves `s3.amazonaws.com` out
for that Bucket refuses the configuration outright.

```typescript sim-sns-s3-events
/**
 * A topic taking S3 Object events and fanning them out to two queues.
 */

import {
  CreateBucketCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  CreateTopicCommand,
  SetTopicAttributesCommand,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import { SimAws } from "@kensio/yulin";

interface SnsEnvelope {
  Message: string;
}

interface S3EventDocument {
  Records: [{ s3: { object: { key: string } } }];
}

const simAws = new SimAws();
const { defaultRegionName: region, defaultAccountId: account } = simAws;
const topicArn = `arn:aws:sns:${region}:${account}:uploads`;

const { TopicArn } = await simAws
  .sns()
  .createTopic(new CreateTopicCommand({ Name: "uploads" }));

// S3 owns no identity policies, so the topic policy is the whole decision.
// The Bucket it is publishing for arrives as aws:SourceArn.
await simAws.sns().setTopicAttributes(
  new SetTopicAttributesCommand({
    TopicArn,
    AttributeName: "Policy",
    AttributeValue: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "s3.amazonaws.com" },
          Action: "sns:Publish",
          Resource: topicArn,
          Condition: { ArnLike: { "aws:SourceArn": "arn:aws:s3:::uploads" } },
        },
      ],
    }),
  }),
);

/**
 * Subscribe a queue that admits SNS to send to it for this topic.
 */
async function subscribeQueue(queueName: string): Promise<string> {
  const { QueueUrl } = await simAws
    .sqs()
    .createQueue(new CreateQueueCommand({ QueueName: queueName }));
  const queueArn = `arn:aws:sqs:${region}:${account}:${queueName}`;

  await simAws.sqs().setQueueAttributes(
    new SetQueueAttributesCommand({
      QueueUrl,
      Attributes: {
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "sns.amazonaws.com" },
              Action: "sqs:SendMessage",
              Resource: queueArn,
              Condition: { ArnLike: { "aws:SourceArn": topicArn } },
            },
          ],
        }),
      },
    }),
  );

  await simAws
    .sns()
    .subscribe(
      new SubscribeCommand({ TopicArn, Protocol: "sqs", Endpoint: queueArn }),
    );

  return QueueUrl ?? "";
}

const thumbnails = await subscribeQueue("thumbnails");
const audit = await subscribeQueue("audit");

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

await simAws.s3().putBucketNotificationConfiguration(
  new PutBucketNotificationConfigurationCommand({
    Bucket: "uploads",
    NotificationConfiguration: {
      TopicConfigurations: [
        { Id: "uploads", Events: ["s3:ObjectCreated:*"], TopicArn },
      ],
    },
  }),
);

await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: "raw/cat.jpg",
    Body: "cat picture",
  }),
);

await simAws.backgroundTasksComplete();

for (const QueueUrl of [thumbnails, audit]) {
  const received = await simAws
    .sqs()
    .receiveMessage(new ReceiveMessageCommand({ QueueUrl }));
  const envelope = JSON.parse(
    received.Messages?.[0]?.Body ?? "",
  ) as SnsEnvelope;
  const event = JSON.parse(envelope.Message) as S3EventDocument;

  console.log(event.Records[0].s3.object.key); // "raw/cat.jpg"
}
```

The published `Message` is the S3 `Records` document as text, and the `Subject` is
`Amazon S3 Notification`. Those are what real S3 publishes. A subscribed queue receiving the SNS
envelope therefore has two layers to parse. `RawMessageDelivery` on the subscription takes one of
them away, leaving the S3 event document as the message body.

The topic has to be in the Bucket's Region, as real S3 requires. A subscription is looser, and a
topic delivers to a queue in any Region. The Accounts can differ on both hops.

See [simulated S3](../s3/README.md#event-notifications "Simulated S3 event notification docs") for the
rest of the Bucket side, including the object key filters and what a record carries.

## Scoping

Topics belong to an account and a region, as they do on real AWS. A topic name is unique within one
account and region and nowhere wider. The same name can name two different topics in two regions.

```typescript sim-sns-scoping
/**
 * Simulated topics are scoped to an account and region.
 */

import { CreateTopicCommand, PublishCommand } from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";
import { SimSnsNotFoundException } from "@kensio/yulin/sns";

const simAws = new SimAws();

const { TopicArn } = await simAws
  .account("222222222222")
  .region("eu-west-2")
  .sns()
  .createTopic(new CreateTopicCommand({ Name: "orders" }));

// A topic ARN naming another Region reaches nothing.
try {
  await simAws
    .account("222222222222")
    .region("us-east-1")
    .sns()
    .publish(new PublishCommand({ TopicArn, Message: "order-1" }));
} catch (error) {
  console.log(error instanceof SimSnsNotFoundException); // true
}
```

A topic ARN naming another account is refused the same way, rather than being answered by a local
topic of the same name. A topic policy admits another account's principal to a topic here, and leaves
that account's own topics unreachable from this one.

## Inside a simulated Lambda handler

Function code requiring `@aws-sdk/client-sns` is routed into the same simulated AWS environment, with
the function's execution role as the caller. A handler publishing to a topic therefore has to be
allowed to, by that role's policy, the same as on real AWS. See
[simulated Lambda](../lambda/ "Simulated Lambda docs") for how function code and execution roles work.

`SimSdk` interception works the same way. Intercepting `SNSClient` routes ordinary SDK code into the
simulation with nothing touching the network, covered under
[AWS SDK interception](../../sdk/ "Simulated AWS SDK docs").

## Deploying a topic from CloudFormation

Simulated CloudFormation creates a topic from an `AWS::SNS::Topic` resource, in the stack's account
and region. The topic is created through `CreateTopic`. A template-created topic gets the same name
validation, the same attributes and the same ARN as one an SDK caller creates.

`Ref` on the resource gives the topic ARN, as it does on real AWS, and it can be handed straight to
`Publish` or `Subscribe`. `Fn::GetAtt … TopicArn` gives the same string, and `Fn::GetAtt … TopicName`
gives the name without the account and region around it.

`AWS::SNS::Subscription` subscribes through `Subscribe`. Its `Protocol` has to be one of the three
simulated, and its `Endpoint` has to be something that protocol can reach. `RawMessageDelivery`,
`FilterPolicy` and `FilterPolicyScope` are carried through as subscription attributes, and a filter
policy written in a template is read exactly as one set through the SDK. The policy is an object in
the template where the API takes a JSON string, and the conversion happens on the way in. `Ref` on
the resource gives the subscription ARN, and `Fn::GetAtt … Arn` gives the same string, since the ARN
is the resource's physical id.

```typescript sim-sns-cloudformation-topic
/**
 * Deploying a topic and a queue subscription from a CloudFormation template.
 */

import { PublishCommand } from "@aws-sdk/client-sns";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrdersTopic: {
        Type: "AWS::SNS::Topic",
        Properties: { TopicName: "orders", DisplayName: "Orders" },
      },
      FulfilmentQueue: {
        Type: "AWS::SQS::Queue",
        Properties: { QueueName: "fulfilment" },
      },
      // The queue policy is what lets SNS deliver to the queue. It is checked
      // on every message, as it is on real AWS.
      FulfilmentQueuePolicy: {
        Type: "AWS::SQS::QueuePolicy",
        Properties: {
          Queues: [{ Ref: "FulfilmentQueue" }],
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "sns.amazonaws.com" },
                Action: "sqs:SendMessage",
                Resource: { "Fn::GetAtt": ["FulfilmentQueue", "Arn"] },
                Condition: {
                  ArnEquals: { "aws:SourceArn": { Ref: "OrdersTopic" } },
                },
              },
            ],
          },
        },
      },
      FulfilmentSubscription: {
        Type: "AWS::SNS::Subscription",
        Properties: {
          TopicArn: { Ref: "OrdersTopic" },
          Protocol: "sqs",
          Endpoint: { "Fn::GetAtt": ["FulfilmentQueue", "Arn"] },
          RawMessageDelivery: true,
        },
      },
    },
    Outputs: {
      OrdersTopicArn: { Value: { Ref: "OrdersTopic" } },
      FulfilmentQueueUrl: { Value: { Ref: "FulfilmentQueue" } },
    },
  },
});

// Ref on a topic resolves to its ARN, so it works as a Publish TopicArn.
const topicArn = stack.output("OrdersTopicArn");

await simAws
  .sns()
  .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }));

// Delivery happens after the publish is answered, as it does on real SNS.
await simAws.backgroundTasksComplete();

const QueueUrl = stack.output("FulfilmentQueueUrl");
const { Messages } = await simAws
  .sqs()
  .receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

console.log(Messages?.[0]?.Body); // "order-1"
```

A topic with no `TopicName` is named from the stack name and the logical ID. The topic above with its
name left out would be `orders-stack-OrdersTopic`. Real CloudFormation adds random characters to
that, which a template cannot predict either way. The generated name is trimmed to the 256 characters
a topic name allows, ending in a hash of the untrimmed name so two long names that start the same
stay apart.

A topic can also declare its subscriptions inside itself, with the `Subscription` property. That is
how a hand-written template usually writes them. Each entry is a `Protocol` and an `Endpoint`, and
each goes through `Subscribe` the same way a separate resource does. A `Protocol` and an `Endpoint`
are all real CloudFormation lets an entry carry, and an entry carrying anything else fails the
resource. A filter policy or raw message delivery needs the separate resource.

```typescript
{
  Type: "AWS::SNS::Topic",
  Properties: {
    TopicName: "orders",
    Subscription: [
      {
        Protocol: "sqs",
        Endpoint: { "Fn::GetAtt": ["FulfilmentQueue", "Arn"] },
      },
    ],
  },
}
```

`AWS::SNS::TopicPolicy` deploys the policy it names onto each topic in its `Topics` list, through
`SetTopicAttributes`. A policy declared in a template is therefore validated and enforced exactly as
one set through the SDK, and a document SNS would refuse fails the resource. `Topics` carries topic
ARNs, and `Ref` on an `AWS::SNS::Topic` gives one.

```typescript
{
  Type: "AWS::SNS::TopicPolicy",
  Properties: {
    Topics: [{ Ref: "OrdersTopic" }],
    PolicyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "s3.amazonaws.com" },
          Action: "sns:Publish",
          Resource: { Ref: "OrdersTopic" },
        },
      ],
    },
  },
}
```

A property with no simulated behaviour fails the resource rather than being dropped. That covers
`FifoTopic`, `ContentBasedDeduplication`, `FifoThroughputScope`, `KmsMasterKeyId`,
`SignatureVersion`, `TracingConfig`, `ArchivePolicy`, `DeliveryStatusLogging`, `DataProtectionPolicy`
and `Tags` on a topic, and `DeliveryPolicy`, `RedrivePolicy`, `ReplayPolicy`, `SubscriptionRoleArn`
and `Region` on a subscription. Most of them are refused by simulated SNS itself, since they are
topic or subscription attributes of the same name, and the reason is the same one an SDK caller gets.
A property the resource type never had is refused too. The failure is worded as an invalid resource,
which fails the resource where an unsupported one would be
[skipped](../cloudformation/README.md#values-from-a-skipped-resource). A topic that cannot be created
as the template asked for it would otherwise leave a stack that looks deployed with no publisher
behind it.

CDK works without hand-editing. `topic.addSubscription(new subscriptions.SqsSubscription(queue))`
synthesises an `AWS::SNS::Subscription` alongside the `AWS::SQS::QueuePolicy` that authorizes the
delivery, and both deploy. `new subscriptions.LambdaSubscription(fn)` does the same with the
`AWS::Lambda::Permission` beside it.

## Available functionality

Sim SNS currently supports:

- `CreateTopicCommand`, idempotent for a name already taken, and `DeleteTopicCommand`
- `ListTopicsCommand`, paged at a hundred topics with a `NextToken`
- `GetTopicAttributesCommand` and `SetTopicAttributesCommand`, for `DisplayName` and `Policy`
- `PublishCommand` and `PublishBatchCommand`, with message attributes, a subject and the 256 KB size
  limit
- `PublishCommand` to a `PhoneNumber`, recorded as an SMS that `sentSmsMessages()` reads back, with
  the `AWS.SNS.SMS.SenderID` and `AWS.SNS.SMS.SMSType` attributes
- The phone number opt-out list, with `CheckIfPhoneNumberIsOptedOutCommand`,
  `ListPhoneNumbersOptedOutCommand` and `OptInPhoneNumberCommand`, and `optOutPhoneNumber()` standing
  in for a recipient replying STOP
- `SubscribeCommand` over the `sqs`, `lambda` and `sms` protocols, confirmed at once, and
  `UnsubscribeCommand`
- `ListSubscriptionsCommand` and `ListSubscriptionsByTopicCommand`, paged at a hundred subscriptions
  with a `NextToken`
- `GetSubscriptionAttributesCommand` and `SetSubscriptionAttributesCommand`, for
  `RawMessageDelivery`, `FilterPolicy` and `FilterPolicyScope`
- Subscription filter policies over the message attributes or the message body, with the string,
  numeric, `exists`, `anything-but` and `$or` operators, applied per subscription
- Delivery of a published message to every subscribed queue, including a queue in another account or
  another region, authorized by that queue's own policy on every message
- Invocation of every subscribed Lambda function, including a function in another account or another
  region, authorized by that function's own resource policy on every message
- An SMS recorded for every subscribed phone number, carrying the topic ARN and the subscription ARN
  that produced it, and marked `suppressed` for a number on the opt-out list
- The SNS envelope, with a real RSA signature a verifier can check against the certificate the
  message names, and `RawMessageDelivery` for the published message on its own
- The SNS Lambda event, with one `Records` entry per published message and the message attributes in
  it
- Authorization of every operation by simulated IAM, against the real IAM action and topic ARN
- The `Policy` attribute as the topic's resource policy, admitting another account's principal or a
  service principal, with `aws:SourceArn` and `aws:SourceAccount` conditions honoured
- Simulated S3 Bucket event notifications published to a topic, authorized by the topic policy when
  the configuration is applied and again on every event
- Calls made from inside a simulated Lambda handler, authorized as the function's execution role
- `SNSClient` interception, routing ordinary SDK code into the simulation
- `AWS::SNS::Topic`, `AWS::SNS::Subscription` and `AWS::SNS::TopicPolicy` deployed from a
  CloudFormation template, each through the SDK command an SDK caller would reach, with the inline
  `Subscription` property on a topic and `Ref` and `Fn::GetAtt` over the deployed resources

## Limitations

Current documented limitations:

- Only the `sqs`, `lambda` and `sms` subscription protocols are simulated. A queue, a function and a
  phone number are the only things a topic can deliver to. `http`, `https`, `email`, `email-json`,
  `application` and `firehose` are refused at `Subscribe` time.
- A subscribed function is invoked with `Subject: null` and `MessageAttributes: {}` where the publish
  carried neither of them, as real SNS sends it. The envelope a queue receives leaves both fields
  out.
- `RawMessageDelivery` is accepted on a `lambda` subscription and has no effect on it, as it has none
  on real SNS.
- A qualified function ARN naming a version or an alias is refused as a subscription endpoint.
  Simulated Lambda has no versions or aliases, so subscribing `$LATEST` instead would be a different
  function from the one named.
- `SigningCertURL` and `UnsubscribeURL` name `sns.<region>.yulin.invalid` rather than
  `sns.<region>.amazonaws.com`, and both are unfetchable, since simulated SNS has no HTTP endpoint.
  The certificate is handed out in process by `simAws.sns().signingCertificate(url)`. A real SNS
  signature verifier such as `sns-validator` hard-codes an `amazonaws.com` certificate host and
  fetches the URL itself, which leaves it unable to verify a simulated message as it stands. Verify
  with `node:crypto` against the certificate the simulator hands over instead.
- A delivery failure goes unreported to the publisher, as it does on real SNS. It is recorded on
  `simAws.sns().deliveryFailures`, and anything other than an endpoint policy refusal is also warned
  about once on the console.
- Delivery retry policies, subscription dead-letter queues and delivery status logging are left out.
  A message an endpoint refuses is delivered once and recorded as a failure, with no retry behind it.
- `ConfirmSubscription` is absent. No protocol simulated needs a confirmation, so there is no token
  to confirm.
- The `cidr` filter policy operator is left out. A policy holding one is refused when it is set,
  naming the operator. Accepting it would leave a policy that silently matches no message.
- A filter policy is reported back as the string it was set with. Real SNS re-serialises the
  document, so what comes back there differs from what went in.
- A nested filter policy key is refused under the `MessageAttributes` scope, since message attributes
  are a flat set of names and such a policy could never match.
- A message body that parses to something other than a JSON object matches no `MessageBody` filter
  policy, and the publish still succeeds. A key holding `null`, an object or an empty list
  holds no value to match, so `{"exists": false}` matches it, as long as the body holds some other
  key.
- An `$or` holding fewer than two objects, or naming a reserved keyword, is refused when the policy
  is set. Real SNS reads it as an attribute named `$or`, which matches no message.
- Subscription delivery retry policies, subscription dead-letter queues and message replay are left
  out, and `DeliveryPolicy`, `RedrivePolicy`, `SubscriptionRoleArn` and `ReplayPolicy` are refused.
- `GetSubscriptionAttributes` reports `SubscriptionArn`, `TopicArn`, `Protocol`, `Endpoint`, `Owner`,
  `ConfirmationWasAuthenticated`, `PendingConfirmation` and `RawMessageDelivery`, with `FilterPolicy`
  and `FilterPolicyScope` once a policy is set. `EffectiveDeliveryPolicy` is left out, since delivery
  retry policies are absent.
- A queue whose name ends in `.fifo` is refused as a subscription endpoint. Only a FIFO topic
  delivers to a FIFO queue, and there are no FIFO topics here.
- Standard topics only. A topic name ending in `.fifo` is refused, as are the `FifoTopic`,
  `FifoThroughputScope` and `ContentBasedDeduplication` attributes, and the `MessageGroupId` and
  `MessageDeduplicationId` publish inputs.
- `MessageStructure` is refused. A `json` structure picks a different message body per protocol, and
  that picking is left out. Accepting it would mean a body chosen by a rule that never ran.
- Publishing to a `TargetArn` is refused. Mobile application endpoints and push notifications are
  left out, and a publish reaches a topic or a phone number.
- An SMS is recorded and never delivered, and what a carrier would do with one is left out. There is
  no message part splitting, no delivery receipt, no price and no throughput limit.
- `AWS.SNS.SMS.MaxPrice`, `AWS.MM.SMS.OriginationNumber`, `AWS.MM.SMS.EntityId` and
  `AWS.MM.SMS.TemplateId` are refused rather than recorded. Each one changes what real SNS does with
  a message, and accepting an inert copy of it would misrepresent the send.
- `SetSMSAttributes` and `GetSMSAttributes`, which carry the account-wide SMS defaults and the spend
  limit, are absent.
- The SMS sandbox is left out. Real SNS only texts verified destination numbers until an account
  leaves it. Yulin is a sandbox already, so every number here is reachable without verifying it
  first.
- The thirty day limit real SNS puts on opting one number back in is absent.
- Message attributes count against the 256 KB publish limit alongside the message body, as they do on
  real SNS. AWS documents no exact accounting for one attribute, so this counts the bytes of the
  attribute's name, its data type and its value. That is stricter than counting the body alone.
- A `Subject` is held to the contract real SNS states, UTF-8 text with no line breaks or control
  characters and fewer than 100 characters. Older AWS documentation described it as ASCII text
  beginning with a letter, number or punctuation mark. That wording is superseded, and a subject
  beginning with a space is accepted here.
- `GetTopicAttributes` reports `TopicArn`, `Owner`, `DisplayName`, `SubscriptionsConfirmed`,
  `SubscriptionsPending`, `SubscriptionsDeleted` and `Policy` when one is set. `DeliveryPolicy` and
  `EffectiveDeliveryPolicy` are left out, since delivery retry policies are absent.
- `GetTopicAttributes` reports the `Policy` string that was set. Real SNS re-serialises the document
  and adds an `Id` and a `Sid`, so what comes back there differs from what went in.
- A topic policy is set through the `Policy` attribute only. `AddPermission` and `RemovePermission`,
  shorthands for writing one statement of it, are absent.
- Encryption is left out. `KmsMasterKeyId` is refused, and message bodies are held in process memory
  as they were published. Anything sharing the process can read them.
- Tags are left out. `TagResource`, `UntagResource` and `ListTagsForResource` are absent, and
  `CreateTopic` refuses a `Tags` parameter rather than dropping it.
- Data protection policies are left out. `PutDataProtectionPolicy` and `GetDataProtectionPolicy` are
  absent, and `CreateTopic` refuses a `DataProtectionPolicy` rather than creating a topic that
  redacts nothing.
- Message archiving and replay are left out, and `ArchivePolicy` is refused.
- Delivery status logging is left out, and the feedback role and sample rate attributes are refused.
  Nothing here writes a delivery record to a simulated CloudWatch Logs group.
- Platform applications and endpoints, and subscribing over `http`, `https`, `email`, `email-json`,
  `application` and `firehose`, are absent.
- SNS condition keys such as `sns:Endpoint` and `sns:Protocol` are left out, and a policy relying on
  one matches nothing. Ordinary condition operators on values sim IAM does supply work as usual.
- `FifoTopic: false` in a template fails the resource rather than deploying a standard topic. It is
  passed to `CreateTopic` as the attribute of the same name, which simulated SNS refuses by name
  whatever the value is. CDK leaves the property out for a standard topic, so this only reaches a
  hand-written template.
- `AWS::SNS::Topic` and `AWS::SNS::Subscription` are replaced rather than updated in place when a
  stack update changes one, as every simulated CloudFormation resource is. A replaced topic is a new
  topic, so anything the old one held is gone.
- An S3 event notification published to a topic carries no message attributes, since real S3 publishes
  none. The only thing on the message besides the event document is the `Amazon S3 Notification`
  subject.
- SNS is not served as an HTTP API by `serveSimAws`.
