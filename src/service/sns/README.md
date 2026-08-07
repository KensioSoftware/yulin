# Simulated SNS implementation

This directory contains the simulated SNS service implementation. Standard topics only.

A topic holds almost nothing. Its name, the ARN that name implies, and the attributes a request has
set are the whole of it, because real SNS keeps no messages: a publish is handed to the topic's
subscriptions and forgotten. That is what happens here too. A publish validates the message, answers
with a message id, and hands a copy to each subscription on the background scheduler.

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
`SimSnsSubscriptionEndpoint` rather than as a string, because a delivery reaches the Account and
Region that ARN names rather than the topic's. Which kind of ARN it has to be is the protocol's
question, answered by `requireSimSnsSubscriptionEndpoint`: `SimSnsQueueEndpointArn` for `sqs`, and
`SimSnsFunctionEndpointArn` for `lambda`. Reading a function ARN is Lambda's own business, so those
parts come from `parseSimLambdaFunctionArn`; what SNS adds is what an unreadable one means to a
`Subscribe` request. A qualified function ARN naming a version or an alias is refused, since
simulated Lambda has neither and delivering to `$LATEST` instead would be the wrong function.

Nothing checks that the endpoint queue or function exists when a subscription is created, because
real SNS does not either: a subscription to something that is not there is created, and fails when
something is delivered to it. The endpoint's own policy is not consulted here either, for the same
reason. Both are delivery-time questions, which is what makes a permission taken away afterwards stop
delivery.

`SimSnsSubscriptionArn` mints an ARN, which is the topic's with an opaque id added as a seventh part,
and `parseSnsSubscriptionArn` reads one. Counting the colon separated parts is what tells a
subscription ARN from a topic ARN, since neither has a resource type separator.

`SimSnsSubscriptionProtocol` holds the two protocols delivery is simulated over, `sqs` and `lambda`.
Neither needs a confirmation, which is why `ConfirmSubscription` is not implemented. Every other
protocol real SNS has is refused by name with the reason it is missing, rather than accepted as a
subscription that would never be delivered to. A protocol real SNS does not have at all is refused
the way real SNS refuses one.

`SimSnsSubscriptionAttributes` holds `RawMessageDelivery`, the subscription's filter policy and the
scope that policy is read under, and `SimSnsSubscriptionAttributeNames` is where the refusal of the
rest is decided. Applying a request makes a new set rather than changing the one the subscription
holds, as it does for a topic, and `sim-sns-subscription-attribute-changes.ts` is where a request is
read as the attributes it leaves behind. The two filter policy attributes are read together, because
a policy of the `MessageBody` scope may say things a policy of the default scope may not: setting
either one on its own still reads the policy under whichever scope ends up in force.

`SimSnsRequestedSubscriptionAttributes` is one request's attributes with the ones it left out left
out. Every name is checked as it is read, so a request naming one attribute this simulation will not
take changes none of them.

`SimSnsSubscriptionStore` holds subscriptions rather than the topic holding its own, because an
`Unsubscribe` request carries a subscription ARN and nothing else: the subscription has to be
reachable without knowing which topic it belongs to first. It also keeps a per-topic count of the
subscriptions that have been removed, which is what `SubscriptionsDeleted` reports.

## Filter policies

Subscription filtering lives under `filter/`. It is its own area rather than part of the fan-out,
because a policy is read when it is set and applied when a message is published, and those happen at
opposite ends of the service.

`SimSnsFilterPolicy` is one subscription's policy. It keeps the string it was set with, so
`GetSubscriptionAttributes` reports back what was set rather than a re-serialised version of it, and
it holds the scope it was read under: reading it is what refuses an operator this simulation cannot
apply, and the scope decides what the document may say. `forScope` reads it again when the scope
changes, so a policy that cannot be written under the new scope is refused there rather than left in
place matching nothing.

`SimSnsFilterPolicyScope` is the two scopes, each of which knows what part of a published message a
policy of that scope matches against and whether that part can nest. That is the whole difference
between them, which is why the scope builds the subject rather than something else branching on it.

`SimSnsFilterSubject` is what a policy is matched against, and there are two: `SimSnsAttributeSubject`
over the message attributes of the publish, and `SimSnsBodySubject` over the parsed message body. Both
answer what a key path holds, so no operator has to know which of them it is looking at. A body that
is not a JSON object holds nothing at any key rather than failing to be read, because the body comes
from whoever published and the scope is the subscription's own business.

A subject also says whether it holds anything at all, which `{"exists": false}` needs: real SNS
states that an empty set of message attributes matches no filter policy, so a key missing from a
message carrying other keys is not the same thing as a message carrying none. That is why the answer
belongs to the subject rather than to the key being asked about.

`SimSnsFilterValue` is one value a policy can be matched against. It holds the forms it has rather
than one form, because a `Number` message attribute has two: the digits it was published as, and the
number they spell. A form a value does not have matches nothing of that form, which is what keeps
`numeric` from matching a `String` attribute holding digits, as real SNS keeps it.

`SimSnsFilterRules` is one level of a policy document, and every rule in it has to hold. A key holding
a list is a `SimSnsFilterKeyRule`, a key holding an object is another level of rules, and `$or` is
alternatives. A nested key is refused under the `MessageAttributes` scope, since message attributes
are flat and such a policy could never match.

`sim-sns-filter-or-eligibility.ts` holds the rules deciding whether an `$or` is one. Real SNS asks for
a list of at least two objects, none of which names a reserved keyword, and reads anything else as an
attribute named `$or`. That is the divergence worth knowing here: real SNS makes such a policy match
nothing, and this refuses it when it is set, because a policy that quietly stopped being an or is
what filtering is meant to protect a test from.

`match/` holds one class per operator, each holding what it was written with and answering one
question about a value. `SimSnsFilterMatch` is what they share, including the answer to whether they
match a key the message does not carry: only `exists` says yes to that. `SimSnsAnythingButMatch` is
the negation of the matches inside it rather than an operator of its own, which is what makes
`anything-but` with a `prefix` in it work without a second implementation of `prefix`.

`sim-sns-filter-matches.ts` reads one match condition, and `sim-sns-filter-operators.ts` is the
operator table it reads with. `cidr` is refused there by name: it is the one operator real SNS has
that this does not, and a policy holding it would otherwise be accepted and then match nothing, which
looks exactly like filtering that worked.

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

## Delivery

Delivery lives under `delivery/`, and the signing that goes with it under `signature/`.

`SimSnsFanOut` is what a publish hands a message to. It asks each subscription whether it wants the
message before scheduling anything, which is where a filter policy is applied: filtering sits above
the delivery endpoint rather than inside any one of them, so a `lambda` subscription is filtered the
same way an `sqs` one is, and a third protocol would be too. Each subscription is asked on its own,
so one subscriber filtering a message out has nothing to do with what another receives. It schedules one delivery per subscription that wants it on the
background scheduler, because real SNS answers a publish before anything is delivered:
`simAws.backgroundTasksComplete()` is what waits for it. A failure is recorded on
`SimSnsDeliveryFailures` rather than thrown, since a background task left rejected would fail an
unrelated `backgroundTasksComplete()`, and real SNS never reports a delivery failure to the publisher.
An endpoint policy refusal is recorded quietly, because that is a modelled outcome a test may be
asking for; anything else is also warned about once, because it is a fault.

`SimSnsNotification` is one published message as every destination's document carries it, signed
once. `simSnsCanonicalMessage` builds the string real SNS signs, which is the signed fields in
alphabetical order, each one its name and its value followed by a newline. That order is the
declaration order of `SimSnsSignedValues`, since an object keeps the order its keys were written in.
Message attributes are not signed, here or on real AWS.

The two documents are built from those fields rather than from each other. `SimSnsEnvelope` is what a
queue receives unless it asked for raw delivery, and `simSnsLambdaEventDocument` is what a function is
invoked with. They differ in more than nesting: the envelope has `SigningCertURL` and `UnsubscribeURL`
where the Lambda event has `SigningCertUrl` and `UnsubscribeUrl`, and the envelope leaves out an
absent subject and an empty attribute set where the Lambda event carries `null` and `{}`. All of that
is real SNS behaviour rather than an oversight, which is why the fields are held under names that are
neither document's.

`SimSnsDeliveryEndpoints` is where a message goes. There is one implementation per protocol, because
what a destination is asked before it takes a message and what it is handed both differ by protocol:
a second protocol adds a second implementation rather than a branch in an existing one.
`SimSnsProtocolDeliveryEndpoints` picks between them by the subscription's protocol, holding them in
a record keyed by the protocol union so that adding a protocol without somewhere to deliver fails to
compile. `SimAwsSnsDeliveryEndpoints` is that set for one simulated AWS instance.

`SimAwsSnsDeliveryQueues` and `SimAwsSnsDeliveryFunctions` resolve the endpoint when a message is
delivered, never when they are built, for the same reason S3's notification destinations do it that
way. A queue or a function in another Account or Region is reachable, since real SNS delivers to
both. That is a deliberate difference from simulated S3 event notifications, which require the
destination queue to be in the Bucket's Region because real S3 does.

`SimSnsDeliveryQueue` asks the queue's own Account two questions: whether `sns.amazonaws.com` may
send to it for this topic, through `SimSqsServiceSendAuthorizer`, and then to send. The send goes
through the ordinary `SendMessage` path, so a delivered message is the same thing an SDK caller would
have sent, and is authorized again on the way in. `SimSnsQueueMessage` is what it sends, which is the
envelope unless the subscription asked for raw delivery. That question is asked here rather than in
the fan-out because `RawMessageDelivery` is an SQS and HTTP protocol setting on real SNS: a function
subscribed with it on is invoked with the whole event all the same.

`SimSnsDeliveryFunction` asks the function's own Account the same two questions, through
`SimLambdaServiceInvokeAuthorizer`, which is where whether a service may invoke a function is decided
for every service that invokes one. The function is then invoked directly rather than through an
`Invoke` command, because SNS is already inside the background task standing for the asynchronous
invocation real SNS makes, and because a handler failure has to reach the delivery outcome rather
than being swallowed as an asynchronous invocation error. A handler that throws is one delivery
failure and leaves the topic's other subscriptions alone, since each delivery is its own background
task.

`Records` in a Lambda event always holds exactly one entry, even for a `PublishBatch`. Real SNS does
not batch to Lambda: each published message is its own asynchronous invocation, and the fan-out
already schedules one delivery per message per subscription.

`SimSnsMessageSigner` owns the key pair, which belongs to the scope rather than to a topic: real SNS
signs every message a Region sends with one certificate. It is generated on first use, because
generating RSA takes long enough to notice and most simulated SNS scopes never deliver anything.

`SimSnsSigningKey` signs with SHA1withRSA, which is what signature version 1 means. The certificate
is assembled by hand in `sim-sns-certificate.ts` out of the DER encoding in `sim-sns-der.ts`, because
Node reads an X.509 certificate and does not write one, and a `Signature` field with no certificate
behind it is a field a consumer cannot use.

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

## CloudFormation resources

`cfn/` holds the `AWS::SNS::*` Resource factory, resolved into the CloudFormation engine through
`sim-cfn-service-resolver.ts`. Every Resource type goes through the ordinary SNS commands rather than
reaching into the stores, so a topic a template created is the same thing an SDK caller would have
got, and a template asking for something this simulation will not do is refused by the same code that
refuses an SDK caller.

That is why `sim-cfn-sns-topic-property-names.ts` is short. Most AWS::SNS::Topic properties are topic
attributes of the same name, so they are handed to `CreateTopic` and SNS decides. Only the three that
have no single attribute behind them are refused in the CloudFormation layer: `Tags` and
`DataProtectionPolicy` are inputs of their own on a `CreateTopic` request, and `DeliveryStatusLogging`
is a list that would become fifteen separate attributes. `AWS::SNS::Subscription` works the same way
against `Subscribe`, with only `Region` refused here.

`sim-cfn-sns-resource-error.ts` is where a refusal gets its wording, and the wording is the point.
Sim CloudFormation reads an error saying a Resource is unsupported as one to record and step over,
and stepping over a topic leaves a Stack that looks deployed with nothing publishing. So a refusal
says the Resource is invalid, and `simCfnSnsResourceCreation` renames SNS's own errors to say which
Resource asked for it, since an SNS error carries no logical ID.

`SimCfnSnsTopicName` is the name a topic whose template does not name it gets, built on the shared
`SimCfnGeneratedResourceName`. It leaves out the random characters real CloudFormation adds, so a test
can predict it.

`AWS::SNS::TopicPolicy` has no existence of its own, in the same way `AWS::SQS::QueuePolicy` has
none: it is the `Policy` attribute of the topics it names. The Resource is backed by the first of
those topics, and the deleter reads the `Topics` list again rather than trusting that one, because
the policy has to come off all of them. Clearing it is `SetTopicAttributes` with an empty value, which
is how the SDK clears one too.

The `Ref` and `Fn::GetAtt` adapters live with the other value adapters, under
`cloudformation/resource/cfn/sns/`, since what a Resource type answers an intrinsic with is
CloudFormation's business rather than the service's. A topic answers `Ref` with its ARN, and a
subscription with its subscription ARN. A topic policy is not claimed there at all, so it falls
through to the default adapter rather than answering `Ref` with a topic ARN belonging to another
Resource.

## Authorization

`SimSnsAuthorizer` authorizes each operation against the topic's ARN, which carries the topic name
with no resource type in front of it. A policy written with a `topic/` in the resource matches
nothing here, as it matches nothing on real AWS.

Two details are real SNS behaviour worth keeping:

- `ListTopics` authorizes against `*`, because real SNS gives it no resource type at all. Only a
  policy whose `Resource` is `*` allows it, and one naming a topic ARN, or every topic ARN in the
  Account and Region, allows no listing. Simulated SQS authorizes `ListQueues` the same way.
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

`SimSnsServicePublishAuthorizer` is the same decision offered to another simulated service, as a
decision rather than a thrown error. Simulated S3 needs it: it validates a notification destination
when the configuration is applied, before it has an event to publish, and has to report the refusal
as part of refusing the configuration. Nothing is remembered from that question, so the ordinary
`Publish` the event later goes through authorizes again and a topic policy changed in between stops
the delivery. `SimSqsServiceSendAuthorizer` is the same idea on the queue's side.

`SimSnsRequestOptions` carries a `sourceArn` and a `sourceAccount` alongside the caller, supplied to
IAM as `aws:SourceArn` and `aws:SourceAccount`. A simulated service reaching a topic on a resource's
behalf sets both, which is how a topic policy granting a service principal tells one Bucket from
another. A request that does not carry one leaves the key out rather than supplying an empty string,
so a statement conditioned on it fails to match.

A request naming another Account or Region in the topic ARN is refused rather than quietly answered
with a local topic of the same name: a topic policy admits another Account's principal to a topic
here, it does not make another Account's topics reachable through this one.

## Divergences worth knowing

- Only the `sqs` and `lambda` subscription protocols are simulated, so a queue and a function are the
  only things a topic delivers to. `ConfirmSubscription` is not implemented, since neither protocol
  needs a confirmation.
- A Lambda event carries `Subject: null` and `MessageAttributes: {}` where there is nothing to put in
  either, which is what real SNS sends. The envelope a queue receives leaves both fields out instead.
- `RawMessageDelivery` is accepted on a `lambda` subscription and has no effect on it, as it has none
  on real SNS: it is an SQS and HTTP protocol setting, and a function is invoked with the whole event
  either way.
- `SigningCertURL` and `UnsubscribeURL` name `sns.<region>.yulin.invalid`, and neither is served.
  The certificate is handed out in process by `SimSns.signingCertificate`. A real verifier such as
  `sns-validator` hard-codes an `amazonaws.com` certificate host and fetches the URL itself, so it
  cannot verify a simulated message as it stands.
- The certificate is minimal: a version, a serial number derived from the key, one common name as
  both issuer and subject, a validity window fixed at 2000 to 2049, and the public key. There are no
  extensions, because nothing verifying an SNS message looks at any.
- Delivery retry policies, subscription dead-letter queues and delivery status logging are not
  simulated, so a delivery that fails is recorded once rather than retried.
- The `cidr` filter policy operator is not simulated, and is refused when the policy is set.
- An `$or` real SNS would read as an ordinary attribute name, because it holds fewer than two objects
  or names a reserved keyword, is refused when the policy is set rather than matched as that
  attribute.
- A filter policy is reported back as the string it was set with, rather than the re-serialised
  document real SNS answers with.
- Delivery retry policies, dead-letter queues and replay are not simulated, so `DeliveryPolicy`,
  `RedrivePolicy`, `SubscriptionRoleArn` and `ReplayPolicy` are refused.
- `Unsubscribe` of an ARN naming no subscription is a `NotFoundException`, which is the error real
  SNS documents for it.
- A topic name ending in `.fifo` is refused, as are `FifoTopic` and the other FIFO attributes.
- Message attributes are counted against the 256 KB publish limit alongside the body, as real SNS
  counts them. The exact accounting AWS uses for one attribute is not documented, so this counts the
  bytes of the name, the data type and the value.
- A subject beginning with a space is accepted. Older AWS documentation described a subject as ASCII
  text beginning with a letter, number or punctuation mark, and the current contract does not.
- `GetSubscriptionAttributes` reports `FilterPolicy` and `FilterPolicyScope` only once a policy is
  set, since the scope only says how a policy is read.
- `GetTopicAttributes` reports `TopicArn`, `Owner`, `DisplayName`, the three subscription counts and
  `Policy` when one is set. `EffectiveDeliveryPolicy` and `DeliveryPolicy` are left out, since
  delivery retry policies are not simulated. `SubscriptionsPending` is always zero, because the one
  protocol simulated needs no confirmation.
- Tags, data protection policies and encryption are refused rather than ignored, whether by
  `CreateTopic` or by `SetTopicAttributes`.
- `MessageStructure` is refused, because a `json` structure picks a different body per protocol and
  picking one is not simulated.
- Publishing to a `TargetArn` or a `PhoneNumber` is refused. Only topics are simulated.
- `AddPermission` and `RemovePermission`, which are shorthands for writing one statement of the topic
  policy, are not implemented. The policy is set through the `Policy` attribute only.
- A CloudFormation property with no simulated behaviour fails the Resource rather than being recorded
  and stepped over, which is what simulated SQS does with most of its own. SNS refuses these to an
  SDK caller too, and going through the commands is what keeps the two answers the same.

The full list is in [docs/services/sns](../../../docs/services/sns/).
