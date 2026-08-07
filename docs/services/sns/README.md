# Simulated SNS

Yulin includes a simulated Amazon SNS for tests and local development. Topics are held in memory and
every operation is authorized by simulated IAM.

Standard topics only. SNS-specific types are imported from the `@kensio/yulin/sns` subpath.

A message published to a topic is delivered to every queue subscribed to it. Other subscription
protocols are not simulated.

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

A topic ARN is `arn:aws:sns:<region>:<account-id>:<name>`. An SNS ARN has no resource type in it, so
the topic name follows the account id directly, the same as an SQS queue ARN.

`CreateTopic` is idempotent, as it is on real AWS. A second request for the same name returns the
existing topic's ARN and leaves that topic alone, so the attributes the second request carries are
not applied. That differs from SQS, which fails a repeated `CreateQueue` whose attributes differ.

A topic name is up to 256 characters of alphanumerics, hyphens and underscores. Anything else is
refused with `InvalidParameterException`, including a name ending in `.fifo`.

`DeleteTopic` removes the topic and frees its name at once, so it can be recreated straight away.
Deleting a topic that is not there succeeds, as it does on real SNS.

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
reports it. The three subscription counts are reported as zero, which is what a topic with no
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

The name and data type rules are the real ones. A name using a reserved `AWS.` or `Amazon.` prefix, a
data type that is not `String`, `String.Array`, `Number` or `Binary`, or a value that does not match
its data type is refused here rather than on AWS.

A `Subject` is UTF-8 text with no line breaks or control characters, of fewer than 100 characters,
which is the contract real SNS states. A subject of exactly 100 characters is already too long. A
publish with no `Message`, or with one over the size limit, is refused with
`InvalidParameterException`.

`PublishBatch` takes up to ten entries. An entry that fails on its own is reported in `Failed` while
the rest of the batch goes through, as real SNS reports it. An empty batch, more than ten entries, a
malformed entry id or two entries sharing an id fail the whole request.

The size limit is the one thing a batch is not held to per entry. It covers the whole batch, so ten
entries each just inside it are one batch far outside it, and a single entry over it fails the batch
with `BatchRequestTooLongException` rather than being reported as the one entry that did not fit.

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

## Subscriptions

`Subscribe` with the `sqs` protocol and a queue ARN answers with a subscription ARN straight away.
There is no confirmation step for that protocol, as there is none on real SNS: the subscription is
confirmed the moment it exists.

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
subscription: `Unsubscribe`, `GetSubscriptionAttributes` and `SetSubscriptionAttributes` all name one
by it.

Subscribing the same queue to the same topic twice answers with the subscription that is already
there rather than making a second one, as real SNS does. The attributes the repeated request carries
are not applied to it, the same way a repeated `CreateTopic` leaves the existing topic alone. They
are still validated, so a repeated request naming an attribute this simulation will not take is
refused for it.

`RawMessageDelivery` is the one subscription attribute with behaviour behind it. It can be set on the
`Subscribe` request or afterwards with `SetSubscriptionAttributes`, and its value is `"true"` or
`"false"`. Anything else is refused, rather than being treated as false.

`Unsubscribe` of an ARN that names no subscription is `NotFoundException`, so unsubscribing the same
ARN twice fails the second time. `DeleteTopic` removes the topic's subscriptions along with it, and a
topic recreated under the same name starts with none.

`GetTopicAttributes` counts the topic's subscriptions in `SubscriptionsConfirmed`, and counts the
ones that have been unsubscribed in `SubscriptionsDeleted`. `SubscriptionsPending` is always zero,
because the only protocol simulated is the one that needs no confirmation.

Only the `sqs` protocol is simulated. Every other protocol real SNS has is refused by name at
`Subscribe` time with the reason it is missing, rather than creating a subscription that would never
be delivered to.

## Delivering to a queue

Publishing to a topic delivers one message to each subscribed queue. That happens after the publish
has been answered, as it does on real SNS, so a test waits for it with
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
so a permission taken away afterwards stops delivery.

Nothing checks the queue at `Subscribe` time, because real SNS does not either. A subscription to a
queue that does not exist, or to one whose policy says no, is created and fails when a message is
delivered to it.

A delivery that fails is not reported to the publisher, as it is not on real SNS: the publish is
answered with a `MessageId` before anything is delivered. It is recorded instead, so a queue that is
unexpectedly empty says why:

```typescript
const [failure] = simAws.sns().deliveryFailures;

console.log(failure?.endpointArn);
console.log(failure?.reason);
console.log(failure?.wasRefused); // true when the queue policy said no
```

A queue in another account or another region receives a message the same way. Real SNS delivers
across both, which differs from simulated S3 event notifications: real S3 requires a destination
queue to be in the bucket's region, and this does not.

## The message a queue receives

By default the body is the SNS envelope, which is the JSON document real SNS wraps a published
message in. A consumer reads the message out of it with `JSON.parse(body).Message`:

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

## Verifying a message signature

The `Signature` in the envelope is a real RSA signature over the string real SNS signs: the signed
fields in alphabetical order, each one its name and its value followed by a newline. Signature
version `1` is SHA1withRSA, which is what real SNS signs with unless a topic opts into version 2.

The key pair belongs to the simulated SNS scope, as a real signing certificate belongs to a region.
`SigningCertURL` names its certificate, and `simAws.sns().signingCertificate(url)` hands it over: the
URL itself cannot be fetched, because simulated SNS is not served over HTTP.

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

The message attributes are not signed, here or on real AWS, so changing one in flight leaves the
signature valid.

## IAM permissions

Every operation is authorized against the topic's ARN, which carries the topic name with no resource
type in front of it. Two details are worth knowing, because both are real SNS behaviour that a policy
can get wrong:

- `ListTopics` has no resource type at all, so it is authorized against `*` and only a policy whose
  `Resource` is `*` allows it. A policy naming one topic grants no listing, and neither does one
  naming `arn:aws:sns:<region>:<account-id>:*`.
- `Unsubscribe`, `ListSubscriptions`, `GetSubscriptionAttributes` and `SetSubscriptionAttributes`
  have no resource type either, for the same reason: SNS has no subscription resource type for a
  policy to name. They are authorized against `*`, so a topic policy cannot grant them and neither
  can an identity policy naming the topic ARN. `Subscribe` and `ListSubscriptionsByTopic` do name a
  topic, and are authorized against its ARN.
- `PublishBatch` is authorized as `sns:Publish`. There is no `sns:PublishBatch` action for a policy to
  name.

A denial is `AuthorizationErrorException`, which is what real SNS answers with rather than the
`AccessDenied` most other services use.

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

A topic's `Policy` attribute is its resource policy, and simulated IAM evaluates it as one. It is what
admits a caller that has no identity policy of its own: a principal from another account, or a service
principal such as `s3.amazonaws.com`, which owns no identity policies anywhere.

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
owning that resource, supplied as `aws:SourceAccount`. A request that does not carry one leaves the
key out rather than supplying an empty string, so a statement conditioned on it does not match at
all.

A caller from another account needs both sides to allow the request, as it does on real AWS: the
topic policy naming the principal, and that principal's own account allowing the action. Either one
on its own is a denial.

The policy is validated when it is set, so a malformed document fails there rather than the first
time something is authorized against it. It has to be a JSON policy document whose statements each
carry an `Effect` of `Allow` or `Deny`, an `Action` or `NotAction`, and a `Resource` or `NotResource`.
Anything else fails with `InvalidParameterException`.

`GetTopicAttributes` reports `Policy` back as the string it was set with. Setting the attribute with
no value takes the policy off the topic, which is the only way back to a topic without one.

## Scoping

Topics belong to an account and a region, as they do on real AWS. A topic name is unique within one
account and region and nowhere wider, so the same name can be used in two regions for two different
topics.

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
topic of the same name. A topic policy admits another account's principal to a topic here; it does
not make another account's topics reachable through this one.

## Inside a simulated Lambda handler

Function code requiring `@aws-sdk/client-sns` is routed into the same simulated AWS environment, with
the function's execution role as the caller. A handler publishing to a topic therefore has to be
allowed to, by that role's policy, the same as on real AWS. See
[simulated Lambda](../lambda/ "Simulated Lambda docs") for how function code and execution roles work.

The same applies to `SimSdk` interception: intercepting `SNSClient` routes ordinary SDK code into the
simulation with nothing touching the network. See
[AWS SDK interception](../../sdk/ "Simulated AWS SDK docs").

## Available functionality

Sim SNS currently supports:

- `CreateTopicCommand`, idempotent for a name already taken, and `DeleteTopicCommand`
- `ListTopicsCommand`, paged at a hundred topics with a `NextToken`
- `GetTopicAttributesCommand` and `SetTopicAttributesCommand`, for `DisplayName` and `Policy`
- `PublishCommand` and `PublishBatchCommand`, with message attributes, a subject and the 256 KB size
  limit
- `SubscribeCommand` over the `sqs` protocol, confirmed at once, and `UnsubscribeCommand`
- `ListSubscriptionsCommand` and `ListSubscriptionsByTopicCommand`, paged at a hundred subscriptions
  with a `NextToken`
- `GetSubscriptionAttributesCommand` and `SetSubscriptionAttributesCommand`, for `RawMessageDelivery`
- Delivery of a published message to every subscribed queue, including a queue in another account or
  another region, authorized by that queue's own policy on every message
- The SNS envelope, with a real RSA signature a verifier can check against the certificate the
  message names, and `RawMessageDelivery` for the published message on its own
- Authorization of every operation by simulated IAM, against the real IAM action and topic ARN
- The `Policy` attribute as the topic's resource policy, admitting another account's principal or a
  service principal, with `aws:SourceArn` and `aws:SourceAccount` conditions honoured
- Calls made from inside a simulated Lambda handler, authorized as the function's execution role
- `SNSClient` interception, routing ordinary SDK code into the simulation

## Limitations

Current documented limitations:

- Only the `sqs` subscription protocol is simulated, so a queue is the only thing a topic can deliver
  to. `lambda`, `http`, `https`, `email`, `email-json`, `sms`, `application` and `firehose` are
  refused at `Subscribe` time.
- `SigningCertURL` and `UnsubscribeURL` name `sns.<region>.yulin.invalid` rather than
  `sns.<region>.amazonaws.com`, and neither can be fetched: simulated SNS is not served over HTTP.
  The certificate is handed out in process by `simAws.sns().signingCertificate(url)`. A real SNS
  signature verifier such as `sns-validator` hard-codes an `amazonaws.com` certificate host and
  fetches the URL itself, so it cannot verify a simulated message as it stands. Verify with
  `node:crypto` against the certificate the simulator hands over instead.
- A delivery failure is not reported to the publisher, as it is not on real SNS. It is recorded on
  `simAws.sns().deliveryFailures`, and anything other than a queue policy refusal is also warned
  about once on the console.
- Delivery retry policies, subscription dead-letter queues and delivery status logging are not
  simulated, so a message an endpoint would not take is delivered once and recorded as a failure
  rather than retried.
- `ConfirmSubscription` is not supported. The only protocol simulated needs no confirmation, so
  there is no confirmation token to confirm.
- Subscription filter policies are not simulated, so `FilterPolicy` and `FilterPolicyScope` are
  refused rather than held and never applied.
- Subscription delivery retry policies, subscription dead-letter queues and message replay are not
  simulated, so `DeliveryPolicy`, `RedrivePolicy`, `SubscriptionRoleArn` and `ReplayPolicy` are
  refused.
- `GetSubscriptionAttributes` reports `SubscriptionArn`, `TopicArn`, `Protocol`, `Endpoint`, `Owner`,
  `ConfirmationWasAuthenticated`, `PendingConfirmation` and `RawMessageDelivery`.
  `EffectiveDeliveryPolicy` is left out, since delivery retry policies are not simulated.
- A queue whose name ends in `.fifo` is refused as a subscription endpoint. Only a FIFO topic
  delivers to a FIFO queue, and there are no FIFO topics here.
- Standard topics only. A topic name ending in `.fifo` is refused, as are the `FifoTopic`,
  `FifoThroughputScope` and `ContentBasedDeduplication` attributes, and the `MessageGroupId` and
  `MessageDeduplicationId` publish inputs.
- `MessageStructure` is refused. A `json` structure picks a different message body per protocol, and
  none of those protocols is simulated, so it would be a body chosen by a rule that never ran.
- Publishing to a `TargetArn` or a `PhoneNumber` is refused. Mobile application endpoints and SMS are
  not simulated, so only a `TopicArn` can be published to.
- Message attributes count against the 256 KB publish limit alongside the message body, as they do on
  real SNS. The exact accounting AWS uses for one attribute is not documented, so this counts the
  bytes of the attribute's name, its data type and its value, which is stricter than counting the
  body alone.
- A `Subject` is held to the contract real SNS states, which is UTF-8 text with no line breaks or
  control characters and fewer than 100 characters. Older AWS documentation described it as ASCII
  text beginning with a letter, number or punctuation mark. That wording is superseded, so a subject
  beginning with a space is accepted here.
- `GetTopicAttributes` reports `TopicArn`, `Owner`, `DisplayName`, `SubscriptionsConfirmed`,
  `SubscriptionsPending`, `SubscriptionsDeleted` and `Policy` when one is set. `DeliveryPolicy` and
  `EffectiveDeliveryPolicy` are left out, since delivery retry policies are not simulated.
- `GetTopicAttributes` reports the `Policy` string that was set. Real SNS re-serialises the document
  and adds an `Id` and a `Sid`, so what comes back there is not byte for byte what went in.
- A topic policy is set through the `Policy` attribute only. `AddPermission` and `RemovePermission`,
  which are shorthands for writing one statement of it, are not supported.
- Encryption is not simulated. `KmsMasterKeyId` is refused rather than applied, and message bodies are
  held in process memory as they were published. That is not a security boundary: anything sharing the
  process can reach them.
- Tags are not simulated. `TagResource`, `UntagResource` and `ListTagsForResource` are not supported,
  and `CreateTopic` refuses a `Tags` parameter rather than dropping it.
- Data protection policies are not simulated. `PutDataProtectionPolicy` and
  `GetDataProtectionPolicy` are not supported, and `CreateTopic` refuses a `DataProtectionPolicy`
  rather than creating a topic that redacts nothing.
- Message archiving and replay are not simulated, so `ArchivePolicy` is refused.
- Delivery status logging writes to CloudWatch Logs, which is not simulated, so the feedback role and
  sample rate attributes are refused.
- Platform applications and endpoints, subscribing over `http`, `https`, `email`, `email-json`,
  `sms`, `application` and `firehose`, and SMS sandbox and opt-out management are not planned.
- SNS condition keys such as `sns:Endpoint` and `sns:Protocol` are not derived, so a policy relying on
  them will not match. Ordinary condition operators on values sim IAM does supply work as usual.
- The CloudFormation resource types are not implemented, so `AWS::SNS::Topic`,
  `AWS::SNS::Subscription` and `AWS::SNS::TopicPolicy` in a template do not deploy a topic yet.
- Simulated S3 still refuses `TopicConfigurations` on a bucket notification configuration, since
  delivery to a topic is not simulated.
- SNS is not served as an HTTP API by `serveSimAws`.
