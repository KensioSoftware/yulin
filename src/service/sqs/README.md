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
and why `SimSqsQueueUrl` does the URL parsing this service needs.

`SimSqsQueueUrl` reads a queue URL into its region, account and name. All three matter: a URL naming
another account or region reaches nothing here rather than having its name read out and looked up
locally.

`SimSqsQueueAttributes` holds the settable attributes as numbers rather than as the strings a request
carries, because that is what the queue's behaviour is expressed in. `SimSqsQueueAttributeNames`
splits reading an attribute from setting one: an attribute real SQS has and this simulation does not
is left out of a response, as real SQS leaves out an attribute a queue has no value for, but setting
one is refused rather than ignored.

`SimSqsRedrivePolicy` is held apart from the numeric attributes, because it is a JSON object and
because a queue has none until one is set. It keeps the string it was parsed from, so
`GetQueueAttributes` reports back what was set rather than a re-serialised version of it.
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

`SimSqsQueueActivity` is how something outside SQS learns a message has arrived. Real SQS is polled
continuously by whatever consumes it, and nothing in this simulation runs continuously, so a
simulated consumer that would poll is told instead. `SimSqsQueue.add` tells the queue's watchers,
which covers a message moved to a dead-letter queue as well as a send, and carries the instant the
message becomes receivable rather than now, because a delayed message is not receivable yet. A
Lambda event source mapping is the one thing using it (see
[the Lambda service README](../lambda/README.md)).

## Command handling

AWS SDK-style operations are implemented under `command/`, grouped by the collaborators they share
rather than one class per command, so the `SimSqs` facade stays a delegation:

- `command/queue/` — `CreateQueue`, `GetQueueUrl`, `ListQueues`, `DeleteQueue`, the attribute
  commands and `PurgeQueue`
- `command/message/` — the send, receive, delete and visibility commands
- `command/authorize/` — the shared IAM authorizer
- `command/sim-sqs-command.types.ts` — the command types gathered for the facade

`SimSqsQueueAccess` is how every operation but `ListQueues` reaches its queue: read the queue URL,
authorize the action against the ARN that URL implies, then look the queue up. Authorization comes
first because real IAM decides before the service does anything, so a caller with no permission is
refused whether or not the queue exists.

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

`cfn/` holds the `AWS::SQS::Queue` resource factory. `SimCfnSqsQueueProperties` reads the template
properties into the shape `CreateQueue` takes, and `SimCfnSqsQueueCreator` sends that command, so a
queue a template deployed is the same thing an SDK caller would have got. Nothing about the attribute
ranges or the name rules is repeated here.

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

There is no queue policy support, so this service passes no resource policies into the IAM decision.
Cross-account access to a queue therefore cannot be granted, and a request naming another owner is
refused rather than quietly answered with a local queue of the same name.

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
- Tags, `RedriveAllowPolicy`, queue policies and the encryption attributes are refused rather than
  ignored, whether a request or a CloudFormation template asks for them. So is `RedrivePolicy` on a
  CloudFormation resource, where it is not simulated, unlike the queue attribute of the same name.
- A message moved to a dead-letter queue keeps its sent timestamp, which is documented AWS behaviour,
  and starts its receive count again, which is not documented either way.
- A Lambda event source mapping polls one batch at a time, where real Lambda runs several pollers and
  scales them with the queue.

The full list is in [docs/services/sqs](../../../docs/services/sqs/).
