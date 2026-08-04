# Simulated SQS implementation

This directory contains the simulated SQS service implementation. Standard queues only.

The guiding decision here is that visibility is a timestamp rather than a timer. A received message
records the instant it is hidden until, and it becomes receivable again when the simulation's clock
reaches that instant. Nothing has to fire, so a test advances simulated time instead of waiting out a
real thirty seconds, and the behaviour a consumer slower than its visibility timeout actually hits is
testable in a millisecond.

## Entry points

- `sim-sqs.ts` is the main in-memory service object for one account/region scope.
- `index.ts` exports the public SQS simulator API for `@kensio/yulin/sqs`.

A `SimSqs` instance owns a `SimSqsQueueStore` holding its queues. The simulator is scoped to an
account and region because real queues are: both the queue URL and the ARN name the region, and a
queue name is unique within one account and region rather than globally.

## Queue model

Queue state lives under `queue/`.

`SimSqsQueue` is the stored resource: its name, its ARN and URL, its attributes, its timestamps and
its messages. The queue owns its messages rather than a service-wide message table owning them,
because everything a message does depends on the queue's attributes: how long it stays hidden once
received, how long it is kept, and how large it is allowed to be.

`SimSqsQueueArn` builds both the ARN and the URL, since they carry the same three facts in two
formats. A queue ARN has no resource type separator, so it is `arn:aws:sqs:region:account:name`
rather than anything with a `queue/` in it. That is also why `parseSimArn` returns undefined for one,
and why `SimSqsQueueUrl` does the URL parsing this service needs. The URL format itself is
`sqsQueueUrl`, which anything holding a queue ARN builds through rather than writing the format out
again: an event source mapping polling a queue and a simulated service notifying one both mean the
same URL.

`SimSqsQueueUrl` reads a queue URL into its region, account and name. All three matter: a URL naming
another account or region reaches nothing here rather than having its name read out and looked up
locally.

`SimSqsQueueAttributes` holds the settable attributes as numbers rather than as the strings a request
carries, because that is what the queue's behaviour is expressed in. `SimSqsQueueAttributeNames`
splits reading an attribute from setting one: an attribute real SQS has and this simulation does not
is left out of a response, as real SQS leaves out an attribute a queue has no value for, but setting
one is refused rather than ignored.

`SimSqsRedrivePolicy` and `SimSqsQueuePolicy` are held apart from the numeric attributes, because they
are JSON documents and because a queue has neither until one is set. Both keep the string they were
parsed from, so `GetQueueAttributes` reports back what was set rather than a re-serialised version of
it. `SimSqsQueuePolicy` validates through sim IAM's own `SimIamPolicyDocumentValidator`, so a queue
policy is held to the same rules as any other policy document, and it is held to them when the
attribute is set rather than when the policy is first evaluated.
`SimSqsDeadLetterTargets` resolves the queue a policy names, matching whole ARNs rather than reading
the name out of one: that keeps the account and region in the comparison, which is what makes an ARN
naming another scope find nothing. The target is checked when the policy is set, because a policy
pointing at nothing would look like a working dead-letter queue and lose the messages it was supposed
to keep.

`SimSqsDeletedQueueNames` holds a deleted queue's name for 60 seconds, as real SQS holds it. The hold
is measured on the simulation's clock, so advancing simulated time frees the name. That is the
failure a redeployed stack actually hits.

## Message model

Message state lives under `message/`.

`SimSqsMessage` is what is on the queue: its id, its body, its attributes and when it was sent.
`SimSqsMessageVisibility` is the part that changes as it is handed out and given back, and it is the
reason the two are separate: a delay and a visibility timeout are the same idea seen from either side
of a first receive, so both are one instant the message is invisible until.

`SimSqsMessageBody` validates the size and characters real SQS validates, and holds a real MD5 of the
body. The digest is real because that is the whole point of it: a sender comparing `MD5OfMessageBody`
against its own digest either finds the body it sent or finds a bug.

`SimSqsMessageAttributes` is the set of attributes on one message, with the length-prefixed digest
encoding real SQS uses for `MD5OfMessageAttributes`. It is a set rather than a list of separate values
because both the digest and a receive request's selection are properties of the set.
`SimSqsMessageAttributePayload` splits a text value from a binary one, so nothing downstream has to
ask which kind it is holding.

`SimSqsMessageStore` holds a queue's messages and every receipt handle it has issued. Handles live
here rather than on the messages because a handle outlives the message it names: real SQS accepts a
delete for a message already deleted and refuses a handle it never issued, and only a store of what
has been issued can tell those two apart.

Retention is applied whenever the messages are looked at rather than scheduled, so advancing
simulated time past `MessageRetentionPeriod` loses the messages AWS would have dropped instead of
keeping them indefinitely. Moving a message to a dead-letter queue works the same way, in
`SimSqsQueue.applyLifecycle`: a message that has used up its receives moves the next time its
visibility lapses, and nothing has to fire for that to happen.

The one thing redrive needs that retention does not is that a queue other than the one being asked
about can change. So `SimSqsQueueStore.applyLifecycle` brings every queue in the scope up to date,
and `SimSqsQueueAccess` runs it before answering from any of them. A test reading only the dead-letter
queue would otherwise find it empty, because the source queue is what notices the move.

`SimSqsQueueActivity` is how a consumer that cannot poll continuously keeps up with a queue. Real SQS
is polled continuously by whatever consumes it, and nothing in this simulation runs continuously, so
a simulated consumer that would poll is told instead.

The queue announces every transition it makes: a message arriving (`add`, which covers a move to a
dead-letter queue as well as a send), a message being handed out and hidden (`recordHandle`), and a
message having its visibility changed (`hideMessage`). Each carries the instant the message becomes
receivable rather than now, because a delayed or in-flight message is not receivable yet. Without the
last two, a message another consumer took would come back to the queue with nothing watching for it.

An announcement only reaches whoever was watching at the time, so `nextAvailability` answers the
other half: when the earliest message a queue cannot hand out yet becomes receivable. A consumer that
started watching a queue whose messages were all in flight asks that rather than waiting for an
announcement that has already been made. A Lambda event source mapping is the one thing using either
(see [the Lambda service README](../lambda/README.md)).

## Command handling

AWS SDK-style operations are implemented under `command/`, grouped by the collaborators they share
rather than one class per command, so the `SimSqs` facade stays a delegation:

- `command/queue/` — `CreateQueue`, `GetQueueUrl`, `ListQueues`, `DeleteQueue`, the attribute
  commands and `PurgeQueue`
- `command/message/` — the send, receive, delete and visibility commands
- `command/authorize/` — the shared IAM authorizer
- `command/sim-sqs-command.types.ts` — the command types gathered for the facade

`SimSqsQueueAccess` is how every operation but `ListQueues` reaches its queue: read the queue URL,
find the queue that URL implies, authorize the action against it, then require it to be there.
Finding the queue comes before authorizing because the queue's own policy is part of the decision.
A caller with no permission is still refused for a queue that does not exist rather than told the
queue is missing, because a queue that is not there contributes no policy and cannot admit anyone.

`SimSqsMessageWriter` is shared by `SendMessage` and every entry of `SendMessageBatch`, so the two
cannot drift apart on what a delay means or how large a body may be. `SimSqsReceiveRequest` is the
same idea for receiving: the whole request is checked before the first message is touched, so an
invalid request never half-receives one.

`sim-sqs-batch-entries.ts` holds the two halves of batch behaviour real SQS distinguishes. An empty
batch, too many entries, a malformed id or two entries sharing one take the whole request down;
anything else is one entry's own failure, reported in `Failed` while the rest of the batch goes
through.

As elsewhere, implementation code under `src/` does not import real AWS SDK packages. The structural
command types in `*.command.ts` match the SDK shapes closely enough for callers to pass real SDK
command instances.

## CloudFormation

`cfn/` holds the `AWS::SQS::Queue` and `AWS::SQS::QueuePolicy` resource factories.
`SimCfnSqsQueueProperties` reads the template properties into the shape `CreateQueue` takes, and
`SimCfnSqsQueueCreator` sends that command, so a queue a template deployed is the same thing an SDK
caller would have got. Nothing about the attribute ranges or the name rules is repeated here.

`SimCfnSqsQueuePolicyCreator` goes through `SetQueueAttributes` for the same reason, so a policy
declared in a template is validated and enforced exactly as one set through the SDK. A queue policy
has no existence of its own in SQS: it is the `Policy` attribute of the queues it names, so the
resource's simulated object is the first queue it named. `Ref` on an `AWS::SQS::Queue` gives its URL,
which is what `Queues` carries and what `SetQueueAttributes` takes.

The properties this simulation has no behaviour for fail the resource rather than being dropped,
including `FifoQueue: true`. A queue deployed without its redrive policy would look to the template
like a queue with a dead-letter queue and have none. The failures are worded as an invalid resource
rather than an unsupported one, because sim CloudFormation skips a resource whose error reads as
unsupported, and skipping is the wrong answer for a queue that cannot be created as asked.

`SimCfnSqsQueueName` generates the name for a queue the template does not name, from the stack name
and the logical ID. The random characters real CloudFormation adds are left out so a test can predict
the name.

`Ref` and `Fn::GetAtt` behaviour lives with the other CloudFormation value adapters, in
`cloudformation/resource/cfn/sqs/`. `Ref` gives the queue URL, as real CloudFormation does.

## Authorization

`SimSqsAuthorizer` authorizes each operation against the queue's ARN, which carries the queue name
with no resource type in front of it. A policy written with a `queue/` in the resource matches nothing
here, as it matches nothing on real AWS.

Two details are real SQS behaviour worth keeping:

- `ListQueues` authorizes against `arn:aws:sqs:region:account:*`, because real SQS gives it no
  queue-level permission. A policy naming one queue ARN therefore allows no listing.
- The batch operations authorize as their singular action. Real SQS has no `sqs:SendMessageBatch`,
  `sqs:DeleteMessageBatch` or `sqs:ChangeMessageVisibilityBatch` action, so a policy naming one grants
  nothing.

The queue's `Policy` attribute goes into the decision as its resource policy, through
`simSqsQueueResourcePolicies`. That is what admits a caller with no identity policy of its own: a
principal from another Account, or a service principal such as `s3.amazonaws.com`, which owns no
identity policies anywhere. A queue with no policy contributes nothing and the decision is left to
the caller's identity policies, as it is on real AWS.

`SimSqsRequestOptions` carries a `sourceArn` and a `sourceAccount` alongside the caller, supplied to
IAM as `aws:SourceArn` and `aws:SourceAccount`. A simulated service reaching a queue on a resource's
behalf sets both, which is how a queue policy granting a service principal tells one Bucket from
another, and one Account's Buckets from another's. A request that does not carry one leaves the key
out rather than supplying an empty string, so a statement conditioned on it fails to match.

`SimSqsServiceSendAuthorizer` answers whether a service principal may send to a queue, as a decision
rather than a thrown error. A service asks it before it has a message to send: simulated S3
validates a notification destination when the configuration naming it is applied, and has to report
the refusal as part of refusing the configuration. Sending later goes through `SendMessage` as
usual, which authorizes the same way, so nothing is remembered from the earlier question.

A request naming another Account as the queue owner is still refused rather than quietly answered
with a local queue of the same name: a queue policy admits another Account's principal to a queue
here, it does not make another Account's queues reachable through this one.

## Divergences worth knowing

- Ordering and duplicates are stricter than AWS promises: messages come back oldest first, and a
  message is handed out to one consumer at a time. Real standard queues make no ordering promise and
  deliver at least once. Redelivery once a visibility timeout lapses is simulated, since that follows
  from the timeout; a duplicate arriving on its own is not.
- `ReceiveMessageWaitTimeSeconds` and `WaitTimeSeconds` are accepted and not waited out. Nothing else
  is running that could send a message during the wait, so waiting could only ever time out.
- `DeleteQueue` and `PurgeQueue` happen at once, where real SQS may take up to a minute over either.
  The 60 second hold on a deleted queue's name is simulated.
- A queue name ending in `.fifo` is refused, as are the FIFO-only request fields.
- `SenderId` is not reported, because a simulated principal has no user or role id to report it as.
- Tags, `RedriveAllowPolicy` and the encryption attributes are refused rather than ignored, whether a
  request or a CloudFormation template asks for them. So is `RedrivePolicy` on a CloudFormation
  resource, where it is not simulated, unlike the queue attribute of the same name.
- A queue policy is set through the `Policy` attribute only. `AddPermission` and `RemovePermission`,
  which are shorthands for writing one statement of it, are not implemented.
- `GetQueueAttributes` reports the `Policy` string that was set. Real SQS re-serialises the document
  and adds an `Id` and a `Sid`, so what comes back there is not byte for byte what went in.
- A message moved to a dead-letter queue keeps its sent timestamp, which is documented AWS behaviour,
  and starts its receive count again, which is not documented either way.
- A Lambda event source mapping polls one batch at a time, where real Lambda runs several pollers and
  scales them with the queue.
- An S3 event notification arrives as one ordinary message with no message attributes. The
  `s3:TestEvent` real S3 puts on a queue when a configuration naming it is applied is not sent; see
  the S3 service README for why.

The full list is in [docs/services/sqs](../../../docs/services/sqs/).
