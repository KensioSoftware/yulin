# Simulated CloudWatch Logs implementation

This directory contains the simulated CloudWatch Logs service implementation. Log groups, log
streams, the events in them, and retention as a property to assert on.

The guiding decision here is that nothing expires. Retention is stored and reported rather than
acted on, because a test would have to move the clock by months to see an event expire, and what
teams actually get wrong about retention is the value they deployed rather than the deletion that
eventually follows from it. A log group with no retention keeps its events forever, which is both
the AWS default and the mistake worth catching.

## Entry points

- `sim-logs.ts` is the main in-memory service object for one account/region scope.
- `index.ts` exports the public CloudWatch Logs simulator API for `@kensio/yulin/logs`.

A `SimLogs` instance owns a `SimLogsLogGroupStore` holding its log groups. The simulator is scoped
to an account and region because real log groups are: a group name is unique within one account and
region, and its ARN names the region.

## Log group model

Group state lives under `group/`.

`SimLogsLogGroup` is the stored resource: its name, its two ARNs, when it was made, its retention,
and the streams inside it. The group owns its streams rather than a service-wide stream table
owning them, because a stream has no identity outside the group it belongs to: two groups may hold
streams of the same name, and deleting a group takes its streams with it.

`sim-logs-arn.ts` builds every ARN this service reports or authorizes against. There are two forms
of a log group ARN and both matter. `simLogsLogGroupArn` names the group alone, which is what
`DescribeLogGroups` reports as `logGroupArn`. `simLogsLogGroupWildcardArn` appends `:*`, which is
what it reports as `arn` and, more importantly, what IAM policies are written against: granting
`logs:PutLogEvents` on a group means granting it on the streams inside, and the wildcard is what
covers them. A policy leaving it off reaches nothing, here and on real AWS.

The separator before the name is a colon rather than a slash, so a Lambda log group gives an ARN
with two colons in a row. That is how real CloudWatch Logs writes it, and it is why `parseSimArn`
is no use for these.

`SimLogsRetention` holds the fixed set of retention periods real CloudWatch Logs accepts. It is a
set rather than a range, which is the part that surprises people: `RetentionInDays: 10` looks
reasonable and is refused.

## Stream and event model

Stream state lives under `stream/`, and what a stream holds lives under `event/`.

`SimLogsLogStream` keeps its events in the order they arrived and reads them back oldest first.
Real CloudWatch Logs only requires a single batch to be in ascending timestamp order, so a later
batch may carry older events than one already accepted, and reading is where the two are put back
together. `compareSimLogsEvents` breaks a tie on the event ID, which increases with ingestion, so
two events sharing a millisecond come back in the order they were written rather than in whatever
order the streams happened to be walked.

`SimLogsEventIds` belongs to the service rather than to a stream, so an event ID is unique across
the whole simulated service the way the real one is unique across an account. The format is a
zero-padded counter rather than the long opaque number AWS generates: sortable and unique is
everything a caller can rely on about the real one.

`SimLogsEventBatch` is where a batch is checked. The chronological rule is the one worth having,
because the obvious way to build a batch is to collect lines from several places and send them in
whatever order they were collected, and an account refuses exactly that. The size limit counts the
26 bytes per event that AWS counts, so a batch refused here is a batch that would be refused there.

`sim-logs-event-window.ts` narrows events to a time range. The range is half open: `startTime` is
included and `endTime` is not. That asymmetry is easy to get wrong from either side, which is why
it lives in one place both readers share.

## Filter patterns

`SimLogsFilterPattern` reads the plain text pattern syntax: terms are case sensitive substrings,
all unprefixed terms must appear, `-` excludes, and `?` makes a term one of a set of alternatives.
`simLogsFilterTerms` does the reading, which needs a scanner rather than a split because a quoted
phrase may carry spaces and escaped quotes.

The structured syntaxes are refused rather than approximated. A JSON property pattern, a space
delimited field pattern and a regular expression term each raise
`SimLogsUnsupportedOperationException`, because a filter quietly treated as matching everything
turns an assertion about one log line into an assertion about any log line at all: the test still
passes, and it no longer tests anything.

## Commands

Command handling lives under `command/`, grouped by what it acts on rather than by operation, so
that the commands sharing a store and a set of rules sit together.

`SimLogsAuthorizer` is the only thing that reaches IAM. An operation on a named group authorizes
against that group's wildcard ARN; `DescribeLogGroups` names no particular group, so it authorizes
against `log-group:*` in the account and region, which is the resource it actually reaches. A
policy scoped to one group therefore fails to describe them all, as it would in an account.

`SimLogsPage` is shared by the three listings that page on an offset. `SimLogsEventCursor` is
separate because `GetLogEvents` pages in both directions and answers with two tokens: reaching
either end gives the same token back rather than nothing, which is how a caller polling a stream
knows to keep it and ask again.

`refuseUnsimulatedLogGroupInput` refuses tags, `kmsKeyId` and a non-standard log group class rather
than dropping them, following the same rule as the rest of the simulator: something accepted and
ignored here would be applied in an account.

## CloudFormation

`cfn/` creates `AWS::Logs::LogGroup` from a template, following the shape every other service's
resource factory has. `SimCfnLogGroupProperties` reads the two properties this simulation acts on
and `SimCfnLogGroupPropertyRules` records the rest, so a reader can tell a real property this
simulation chose not to act on from one CloudWatch Logs has never had.

Creation goes through the service writer rather than the command layer, which is what makes a
declared group and one a Lambda function made for itself the same thing. Real CloudFormation fails a
deploy that declares a group already in the account; here that is the ordinary case, because a
function that logged during test setup has already created `/aws/lambda/orders`.

Registering the service had one consequence worth recording. `SimCdkProviderScaffolding` used to
recognise a CDK provider function's log group and report it as deliberately left out, because
nothing simulated log groups and reporting it as a gap would have read as a missing feature. Now
that log groups are created, that branch is gone: a Resource type a service creates is created, and
an empty log group is exactly what an account is left with when nothing invokes the provider
function either.

## Subscription filters

`subscription/` delivers what is written to a log group onward to a Lambda function.

The shape follows simulated SNS's fan-out, for the same reasons. `SimLogsSubscriptionFanOut`
schedules a delivery on the background scheduler rather than making it inline, because real
CloudWatch Logs answers `PutLogEvents` before anything is delivered and a destination that throws
must not fail the write that triggered it. `SimAwsLogsSubscriptionFunctions` resolves the function
when an event is delivered rather than when it is built: simulated Lambda records its output here,
so reaching it during construction would be a cycle with no bottom.

Each filter gets only the events its own pattern matched, in one delivery, so a handler receives the
lines it subscribed to rather than everything that happened to be written. The payload is gzipped
and base64 encoded under `awslogs.data` exactly as AWS encodes it, because the first thing a real
subscription handler does is gunzip that field; delivering the document in the clear would be easier
to read in a test and would break every handler written against a real subscription.

Two checks matter and happen in different places. The destination is checked at
`PutSubscriptionFilter`, as real CloudWatch Logs checks it, so a function that never granted
permission fails the call rather than leaving a filter that drops every event in silence. The
resource policy is then consulted again on every delivery, so a permission taken away afterwards
stops delivery, which is what an account does.

A destination ARN may carry a version or alias qualifier. `SimLogsSubscriptionFunctionArn` holds it
beside the function name and `permittedSimLogsDestinationFunction` resolves it through
`getSimFunctionTarget` at both of those points. The alias is what the delivery is authorized
against, and the version behind it is what runs.

Failures are kept rather than thrown. Real CloudWatch Logs tells nobody about a failed delivery,
which would leave a test with a handler that mysteriously never ran, so every failure lands in
`subscriptionFailures` for a test to read.

## Writing from the rest of the simulation

`SimLogsServiceWriter`, under `write/`, is how a simulated service records its own output. It is
deliberately not the command layer: nothing validates a batch, pages, or authorizes, because real
CloudWatch Logs does not put a Lambda function's own output through `PutLogEvents` either.

Nothing on that path fails. A group or stream that is not there is made rather than refused, so
deleting a log group mid-test does not take the next invocation down with it, which is what real
Lambda does when its group has gone.

Authorization is the deliberate divergence. A real function needs `logs:CreateLogGroup` and
`logs:PutLogEvents` on its execution Role, and one without them produces no logs at all, in silence.
Simulating that faithfully would mean nearly every function in a test logged nothing with no failure
to explain why, so writing is unconditional here.

Only zip-packaged Lambda code reaches this. A handler function reference runs in the host scope with
no streams of its own, so there is nothing to tee without patching a global the whole test run
shares.

## What is not simulated

Nothing expires, as above. Metric filters, Logs Insights queries, export tasks, tagging, encryption
and data protection policies are all absent, and `metricFilterCount` is always zero. A stream's
`storedBytes` is always zero too, which matches real CloudWatch Logs: it stopped reporting the
figure per stream in 2019.

Subscription filters deliver to a Lambda destination only. Kinesis, Firehose and the logical
destinations that reach another Account are refused rather than accepted and never delivered to,
and `Distribution` is held and reported but changes nothing, since there are no shards to spread
across.
