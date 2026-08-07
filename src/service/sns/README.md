# Simulated SNS implementation

This directory contains the simulated SNS service implementation. Standard topics only.

A topic holds almost nothing. Its name, the ARN that name implies, and the attributes a request has
set are the whole of it, because real SNS keeps no messages: a publish is handed to the topic's
subscriptions and forgotten. Subscriptions are held here, but delivery is not simulated yet, so a
publish validates the message, answers with a message id, and the message goes nowhere. That is what
real SNS does with a publish to a topic nothing subscribes to.

## Entry points

- `sim-sns.ts` is the main in-memory service object for one account/region scope.
- `index.ts` exports the public SNS simulator API for `@kensio/yulin/sns`.

A `SimSns` instance owns a `SimSnsTopicStore` holding its topics and a `SimSnsSubscriptionStore`
holding its subscriptions. The simulator is scoped to an account and region because real topics are:
the ARN a request reaches a topic by names the region, and a topic name is unique within one account
and region rather than globally.

## Topic model

Topic state lives under `topic/`.

`SimSnsTopic` is the stored resource: its name, its ARN, the Account that owns it, and its
attributes.

`SimSnsTopicArn` builds the ARN, and `parseSnsTopicArn` reads one. A topic ARN has no resource type
separator, so it is `arn:aws:sns:region:account:name` rather than anything with a `topic/` in it,
which is why `parseSimArn` returns undefined for one. Reading it counts the colon separated parts,
because that is what tells a topic ARN from a subscription ARN: a subscription ARN is the topic's
with the subscription id added as a seventh part, and reading one as a topic ARN would find a topic
that is not being named.

`SimSnsTopicName` holds the name rules real SNS holds: up to 256 characters of alphanumerics,
hyphens and underscores. A name ending in `.fifo` is refused, since only standard topics are
simulated and a FIFO topic is named that way.

`SimSnsTopicAttributes` holds the two attributes this simulation gives behaviour to, the display name
and the policy. Applying a request makes a new set rather than changing the one the topic holds, so a
request that turns out to name an attribute this simulation will not take leaves the topic as it was.
`SimSnsTopicAttributeNames` is where that refusal is decided: an attribute real SNS has and this
simulation does not is refused with the reason, and an attribute real SNS does not have at all is
refused the way real SNS refuses it. The delivery status logging attributes are matched as a pattern
rather than listed, because there are fifteen of them and they are all refused for the same reason.

`SimSnsTopicPolicy` is held apart from the display name because it is a JSON document and because a
topic has none until one is set. It keeps the string it was parsed from, so `GetTopicAttributes`
reports back what was set rather than a re-serialised version of it, and it validates through sim
IAM's own `SimIamPolicyDocumentValidator`, so a topic policy is held to the same rules as any other
policy document, and it is held to them when the attribute is set rather than when the policy is
first evaluated.

`SimSnsTopicStore` holds nothing for a deleted topic's name, unlike `SimSqsDeletedQueueNames`. Real
SNS frees a topic name as soon as the topic is gone, so a name can be reused straight away.

## Subscription model

Subscription state lives under `subscription/`.

`SimSnsSubscription` is the stored resource: its ARN, the topic it belongs to, its protocol, its
endpoint, the Account owning it, and its attributes. The endpoint is held as a
`SimSnsQueueEndpointArn` rather than as a string, because `sqs` is the only protocol accepted and the
Account and Region it names are the ones a delivery will have to reach, rather than the topic's. When
another protocol arrives, this becomes the endpoint of whichever kind the protocol implies.

Nothing checks that the endpoint queue exists when a subscription is created, because real SNS does
not either: a subscription to a queue that is not there is created, and fails when something is
delivered to it. Nothing here consults the queue's policy either, since delivery is not simulated
yet, and both checks belong with it when it arrives.

`SimSnsSubscriptionArn` mints an ARN, which is the topic's with an opaque id added as a seventh part,
and `parseSnsSubscriptionArn` reads one. Counting the colon separated parts is what tells a
subscription ARN from a topic ARN, since neither has a resource type separator.

`SimSnsSubscriptionProtocol` holds the one protocol a subscription is accepted for. Every other protocol
real SNS has is refused by name with the reason it is missing, rather than accepted as a subscription
that would never be delivered to. A protocol real SNS does not have at all is refused the way real
SNS refuses one.

`SimSnsSubscriptionAttributes` holds `RawMessageDelivery` and nothing else, and
`SimSnsSubscriptionAttributeNames` is where the refusal of the rest is decided. Applying a request
makes a new set rather than changing the one the subscription holds, as it does for a topic.

`SimSnsSubscriptionStore` holds subscriptions rather than the topic holding its own, because an
`Unsubscribe` request carries a subscription ARN and nothing else: the subscription has to be
reachable without knowing which topic it belongs to first. It also keeps a per-topic count of the
subscriptions that have been removed, which is what `SubscriptionsDeleted` reports.

## Message model

Message state lives under `message/`, even though no message outlives the publish that made it. The
model exists so that everything a message has to be checked for happens in one place, whether the
publish was one of its own or one entry of a batch.

`SimSnsPublishedMessage` is one message a publish put on a topic: its id, its body, its subject, its
attributes and the instant it was published. It states what it weighs, since the 256 KB limit covers
the body and the attributes together rather than either on its own, but it does not apply that limit:
a publish of its own and a batch are held to it differently, so each does its own checking.

`SimSnsMessageBody` refuses an empty message, as real SNS does, and states what a body weighs.
`SimSnsMessageSubject` holds the contract real SNS states: UTF-8 text with no line breaks or control
characters, of fewer than 100 characters. It is UTF-8 rather than ASCII because a subject carrying an
accented character or an emoji reaches AWS, so refusing one here would be a puzzling failure for
something that works. Only the email protocols put a subject where a person sees it and neither is
simulated, but the subject travels in the SNS envelope a queue or a function receives, so it is
validated and carried.

`SimSnsMessageAttributes` is the set of attributes on one message. A value is held as its bytes
whichever form it arrived in, because the data type already says which form that was: an attribute of
a `Binary` type carries bytes and any other carries text. There is no digest here, unlike simulated
SQS, because a real SNS publish response carries no digest for a caller to check.

## Command handling

AWS SDK-style operations are implemented under `command/`, grouped by the collaborators they share
rather than one class per command, so the `SimSns` facade stays a delegation:

- `command/topic/` — `CreateTopic`, `ListTopics`, `DeleteTopic` and the attribute commands
- `command/subscription/` — `Subscribe`, `Unsubscribe`, the two listings and the attribute commands
- `command/publish/` — `Publish` and `PublishBatch`
- `command/authorize/` — the shared IAM authorizer
- `command/sim-sns-page.ts` — one page of a listing, shared by all three of them
- `command/sim-sns-command.types.ts` — the command types gathered for the facade

`SimSnsTopicAccess` is how every operation but `ListTopics` and `CreateTopic` reaches its topic: read
the topic ARN, find the topic that ARN implies, authorize the action against it, then require it to
be there. Finding the topic comes before authorizing because the topic's own policy is part of the
decision. A caller with no permission is still refused for a topic that does not exist rather than
told the topic is missing, because a topic that is not there contributes no policy and cannot admit
anyone.

`DeleteTopic` goes through `findByArn` rather than `requireByArn`, because real SNS treats it as
idempotent: deleting a topic that is not there succeeds, and the caller still has to be allowed to
delete it. It removes the topic's subscriptions before the topic itself, as real SNS deletes them
with it.

`SimSnsSubscriptionAccess` is the same idea for a subscription ARN, with the order reversed: the
action is authorized before the subscription is looked for. The commands reaching a subscription by
ARN have no resource type on real SNS, so no subscription can contribute to the decision and nothing
has to be found first.

`Subscribe` answers a repeated request for the same topic, protocol and endpoint with the
subscription that is already there, as real SNS does, so an endpoint receives one copy of a published
message however many times it subscribed. The attributes the repeated request carries are read
before that check and dropped after it, the same way `CreateTopic` handles its own: a repeated
request naming an attribute this simulation will not take is still refused for it.

`CreateTopic` reads the attributes a request carries before it looks for an existing topic. Real SNS
answers a repeated create with the existing topic's ARN and leaves that topic alone, which differs
from SQS refusing one whose attributes differ. Reading the attributes and then dropping them would
leave a repeated create quietly accepting an attribute the first create was refused for, so they are
still checked.

`sim-sns-batch-entries.ts` holds the two halves of batch behaviour real SNS distinguishes. An empty
batch, more than ten entries, a malformed id or two entries sharing one take the whole request down;
anything else is one entry's own failure, reported in `Failed` while the rest of the batch goes
through.

The size limit is the exception, which is why `SimSnsPublishedMessage` does not check it and the
publish commands do. It covers the whole batch rather than each entry, so it is checked once every
entry has been read. Checking it per entry would report an entry too large for a batch as that
entry's own failure, where real SNS fails the batch: one entry over the limit is already a batch over
it.

As elsewhere, implementation code under `src/` does not import real AWS SDK packages. The structural
command types in `*.command.ts` match the SDK shapes closely enough for callers to pass real SDK
command instances.

## Authorization

`SimSnsAuthorizer` authorizes each operation against the topic's ARN, which carries the topic name
with no resource type in front of it. A policy written with a `topic/` in the resource matches
nothing here, as it matches nothing on real AWS.

Two details are real SNS behaviour worth keeping:

- `ListTopics` authorizes against `*`, because real SNS gives it no resource type at all. Only a
  policy whose `Resource` is `*` allows it, and one naming a topic ARN, or every topic ARN in the
  Account and Region, allows no listing. Simulated SQS authorizes `ListQueues` against
  `arn:aws:sqs:region:account:*` instead, which admits a policy real SQS would refuse.
- `Unsubscribe`, `ListSubscriptions`, `GetSubscriptionAttributes` and `SetSubscriptionAttributes`
  authorize against `*` for the same reason: SNS has one resource type, the topic, and none of these
  four names one. A topic policy therefore cannot grant them. `Subscribe` and
  `ListSubscriptionsByTopic` do name a topic and authorize against its ARN.
- `PublishBatch` authorizes as `sns:Publish`. Real SNS has no `sns:PublishBatch` action, so a policy
  naming one grants nothing.

A denial is reported as SNS's own `AuthorizationErrorException` rather than the shared IAM error,
because that is the error name and the 403 a real SNS caller would have to handle.

The topic's `Policy` attribute goes into the decision as its resource policy, through
`simSnsTopicResourcePolicies`. That is what admits a caller with no identity policy of its own: a
principal from another Account, or a service principal such as `s3.amazonaws.com`, which owns no
identity policies anywhere. A topic with no policy contributes nothing and the decision is left to
the caller's identity policies, as it is on real AWS.

`SimSnsRequestOptions` carries a `sourceArn` and a `sourceAccount` alongside the caller, supplied to
IAM as `aws:SourceArn` and `aws:SourceAccount`. A simulated service reaching a topic on a resource's
behalf sets both, which is how a topic policy granting a service principal tells one Bucket from
another. A request that does not carry one leaves the key out rather than supplying an empty string,
so a statement conditioned on it fails to match.

A request naming another Account or Region in the topic ARN is refused rather than quietly answered
with a local topic of the same name: a topic policy admits another Account's principal to a topic
here, it does not make another Account's topics reachable through this one.

## Divergences worth knowing

- Delivery is not simulated, so a publish reaches nothing even when the topic has subscriptions.
- Only the `sqs` subscription protocol is simulated, and `ConfirmSubscription` is not implemented,
  since that protocol needs no confirmation.
- Subscription filter policies, delivery retry policies, dead-letter queues and replay are not
  simulated, so `FilterPolicy`, `FilterPolicyScope`, `DeliveryPolicy`, `RedrivePolicy`,
  `SubscriptionRoleArn` and `ReplayPolicy` are refused.
- `Unsubscribe` of an ARN naming no subscription is a `NotFoundException`, which is the error real
  SNS documents for it.
- A topic name ending in `.fifo` is refused, as are `FifoTopic` and the other FIFO attributes.
- Message attributes are counted against the 256 KB publish limit alongside the body, as real SNS
  counts them. The exact accounting AWS uses for one attribute is not documented, so this counts the
  bytes of the name, the data type and the value.
- A subject beginning with a space is accepted. Older AWS documentation described a subject as ASCII
  text beginning with a letter, number or punctuation mark, and the current contract does not.
- `GetTopicAttributes` reports `TopicArn`, `Owner`, `DisplayName`, the three subscription counts and
  `Policy` when one is set. `EffectiveDeliveryPolicy` and `DeliveryPolicy` are left out, since
  delivery retry policies are not simulated. `SubscriptionsPending` is always zero, because the one
  protocol simulated needs no confirmation.
- Tags, data protection policies and encryption are refused rather than ignored, whether by
  `CreateTopic` or by `SetTopicAttributes`.
- `MessageStructure` is refused, because a `json` structure picks a different body per protocol and
  none of those protocols is simulated.
- Publishing to a `TargetArn` or a `PhoneNumber` is refused. Only topics are simulated.
- `AddPermission` and `RemovePermission`, which are shorthands for writing one statement of the topic
  policy, are not implemented. The policy is set through the `Policy` attribute only.
- The CloudFormation resource types are not implemented, so a template with an `AWS::SNS::Topic` in
  it does not deploy a topic yet.

The full list is in [docs/services/sns](../../../docs/services/sns/).
