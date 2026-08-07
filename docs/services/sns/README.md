# Simulated SNS

Yulin includes a simulated Amazon SNS for tests and local development. Topics are held in memory and
every operation is authorized by simulated IAM.

Standard topics only. SNS-specific types are imported from the `@kensio/yulin/sns` subpath.

Subscriptions are not simulated yet, so a published message reaches nothing. A topic with no
subscriptions still accepts a publish and answers with a `MessageId`, which is what real SNS does
with one.

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

A `Subject` is up to 100 printable ASCII characters and may not begin with a space, as real SNS
requires. A publish with no `Message`, or with one over the size limit, is refused with
`InvalidParameterException`.

`PublishBatch` takes up to ten entries. An entry that fails on its own is reported in `Failed` while
the rest of the batch goes through, as real SNS reports it. An empty batch, more than ten entries, a
malformed entry id or two entries sharing an id fail the whole request, and so does a batch weighing
more than the 256 KB a single publish is held to.

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

## IAM permissions

Every operation is authorized against the topic's ARN, which carries the topic name with no resource
type in front of it. Two details are worth knowing, because both are real SNS behaviour that a policy
can get wrong:

- `ListTopics` has no topic-level permission, so a policy allowing it names
  `arn:aws:sns:<region>:<account-id>:*`. A policy naming one topic grants no listing.
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
- Authorization of every operation by simulated IAM, against the real IAM action and topic ARN
- The `Policy` attribute as the topic's resource policy, admitting another account's principal or a
  service principal, with `aws:SourceArn` and `aws:SourceAccount` conditions honoured
- Calls made from inside a simulated Lambda handler, authorized as the function's execution role
- `SNSClient` interception, routing ordinary SDK code into the simulation

## Limitations

Current documented limitations:

- Subscriptions and delivery are not simulated. `Subscribe`, `Unsubscribe`,
  `ListSubscriptions`, `ListSubscriptionsByTopic`, `GetSubscriptionAttributes`,
  `SetSubscriptionAttributes` and `ConfirmSubscription` are not supported, and a published message
  reaches nothing. A publish to a topic with no subscriptions is accepted and answered with a
  `MessageId`, which is what real SNS does with one.
- Subscription filter policies are not simulated, since there are no subscriptions to attach one to.
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
- Platform applications and endpoints, `Subscribe` over `http`, `https`, `email`, `email-json`, `sms`,
  `application` and `firehose`, and SMS sandbox and opt-out management are not planned.
- SNS condition keys such as `sns:Endpoint` and `sns:Protocol` are not derived, so a policy relying on
  them will not match. Ordinary condition operators on values sim IAM does supply work as usual.
- The CloudFormation resource types are not implemented, so `AWS::SNS::Topic`,
  `AWS::SNS::Subscription` and `AWS::SNS::TopicPolicy` in a template do not deploy a topic yet.
- Simulated S3 still refuses `TopicConfigurations` on a bucket notification configuration, since
  delivery to a topic is not simulated.
- SNS is not served as an HTTP API by `serveSimAws`.
