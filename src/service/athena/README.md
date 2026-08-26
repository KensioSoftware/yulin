# Simulated Athena implementation

This directory contains the simulated Athena implementation. Workgroups and named queries are
deployable from a template and readable through the SDK, and a query runs through its states with
one part of its SQL read.

The guiding decision is that no query is evaluated. Athena's own value is in the query engine, and a
query engine over Parquet and JSON objects in S3 is a different order of magnitude from the rest of
this. A test declares what a query answers with instead, and the simulation matches that declaration
on the query text. Simulated Bedrock answers a prompt the same way and simulated Rekognition answers
an image the same way, all three through `SimDeclaredResultRules`.

What that leaves is worth having. The lifecycle a client polls is real, the bytes-scanned cutoff
refuses a query for real, the tables a query names are looked for in the Data Catalog, and a result
set really is written to the workgroup's output location. The divergence to be honest about is that
simulated Athena accepts a query real Athena would reject. `docs/services/athena/README.md` says so
in its Limitations list.

## Entry points

- `sim-athena.ts` is the service facade for one account/region scope.
- `index.ts` exports the public Athena simulator API for `@kensio/yulin/athena`.

`SimAthena` is state and delegation. Its two stores are `SimAthenaWorkGroupStore` and
`SimAthenaNamedQueryStore`, and every command handler is wired in `command/sim-athena-commands.ts`
so the facade stays out of it.

Reads are held apart from writes for each resource, making four handlers. The two have different
collaborators. A write needs the clock and the rules about what may change, and a read
needs the shape a response comes back in. Each rule a write applies then sits in a file of its own
beside the handler, `sim-athena-work-group-creation.ts`, `-update.ts` and `-deletion.ts`. A create,
an update and a delete share only the workgroup they name.

The service is self-contained, and `SimAwsSelfContainedServiceBuilder` builds it for that reason. It
holds the same scope's simulated S3 to write a result into, and the same scope's simulated Glue to
resolve a table name against. Both are services in the scope Athena already belongs to.

## The primary workgroup

Every scope is constructed holding `primary`, which real Athena makes with the account. That is what
lets `CreateNamedQuery` and `ListNamedQueries` work before a workgroup is created, and it is why
`SimAthena`'s constructor puts one in the store before wiring the commands.

## Two stores, keyed differently

A workgroup is keyed by name, because that is what every command names one by. A named query is
keyed by id, because Athena lets two named queries share a name and hands back a generated id from
`CreateNamedQuery`. `inWorkGroup` is how a listing finds one. A named query against a workgroup that
is absent is refused for the same reason, since storing it would leave it unreachable.

## Configuration is held immutably

`SimAthenaWorkGroup` and `SimAthenaWorkGroupConfiguration` are replaced on every change. A workgroup
a caller is already holding then stays as it was. `UpdateWorkGroup` merges field by field, as real
Athena does, and each clearable field has its own removal flag. The merge lives on the configuration
itself, keeping the update rules next to the fields they are about.

`SimAthenaResultConfiguration.isEmpty` handles the update that removed everything. A workgroup left
with no results location reports no result configuration at all.

## How a query runs

`execution/` holds the one thing here that changes over time. `SimAthenaQueryExecution` is mutable
for that reason, where every other resource in this service is replaced rather than mutated.

`SimAthenaQueryRunner` moves it. Reaching `RUNNING` is one background task and finishing is another,
scheduled from inside the first. That is what makes each state visible to a caller polling
`GetQueryExecution`, since one lifecycle in a single task would be over before the first poll. Both
tasks check whether the execution has already settled, so a query somebody stopped in between is
left where it is.

`result/` holds the declarations. `SimAthenaQueryResults` wraps `SimDeclaredResultRules` with query
text as the leading key and workgroup name as the trailing one, which puts the specific tier first
the way Bedrock puts prompt before model. `SimAthenaResolvedResult` fills in what a declaration left
out, and it is the only place that knows how.

The cutoff is checked in the runner against what the declaration says the query scanned. That is the
whole of the cost guardrail, and the one thing this simulation can enforce for real without an
engine.

`table/` reads the tables a query names. `sim-athena-sql-tokens.ts` tokenises and stops there, and
`sim-athena-table-references.ts` walks those tokens looking only at what follows `FROM`, `JOIN` and a
comma inside a FROM clause. Everything it does is conservative. A statement it cannot follow is
reported unreadable and nothing is resolved for one, because refusing a query real Athena would run
costs more than the check returns.

Three things in that scanner are there for a reason a reader would otherwise undo. Parentheses carry
a flag saying whether the word before them was a function name. That keeps `EXTRACT(hour FROM ts)`
from naming a table called `ts`. The depths currently inside a FROM clause are held as a set, one
entry per bracket level, and a subquery's own FROM then leaves the outer one standing. A name written
`x AS (` is taken as a common table expression, since nothing else in a statement this scans puts a
bracket straight after `AS`.

`projection/` expands a table's partition projection into the S3 prefixes its partitions sit under.
`sim-athena-projection-parameters.ts` reads the `projection.*` keys off the Glue table, and every
partition key needs a type once projection is on, since Athena has no other way to know what a
column's values are. `sim-athena-projection-values.ts` turns one column into its values, and
`sim-athena-projection-location.ts` crosses those values into prefixes through
`storage.location.template`, falling back to the Hive layout under the table's own location.

Two decisions in there are worth knowing. A date bound is validated by writing it back out in its
own format and comparing, because `Date.UTC` rolls a thirteenth month into the next January rather
than refusing it. And a projection is capped at 20,000 partitions, which turns a runaway range into
a named failure instead of a test that hangs.

`sim-athena-partition-filters.ts` reads the `WHERE` clause for `column = 'value'` and
`column IN (...)`. It reads nothing at all from a query carrying `OR`, since a value under one arm
of an `OR` constrains nothing on its own. Failing to read a filter is always safe here, because it
leaves every projected partition in.

`sim-athena-table-resolution.ts` turns those names into a refusal. It skips a query against a
catalog other than `awsdatacatalog`, and it skips everything while the Data Catalog holds no
database at all. A simulation where nothing created a database is one where nothing asked for a
table to be looked for, and every test written before this existed stays working because of it.

`SimAthenaResultWriter` writes the CSV through simulated S3 under the caller that started the query,
because Athena writes a result under the identity that asked for it. Simulated Firehose does the
same shape of thing under its delivery stream's role. A write that fails leaves the execution
`FAILED` rather than raising at a caller who was answered long ago and has gone away to poll.

## The CloudFormation layer

`cfn/` follows the shape the other services use. `SimAthenaCfnResourceFactory` dispatches on the
resource type name without its prefix, the form the CloudFormation engine passes in. Both creators
go through the ordinary SDK commands, so a workgroup a template deployed is the same thing an SDK
caller would have got, down to the refusals.

`sim-cfn-athena-resource-error.ts` is why a refusal fails the Resource. Sim CloudFormation reads an
error saying a Resource is unsupported as one to record and step over, and a stepped-over workgroup
would leave the stack looking deployed with its cost guardrail never configured.

Property handling splits the other way. `SimCfnAthenaWorkGroupPropertyRules` records anything the
simulation has no answer for on the Resource's `ignoredProperties` and lets the workgroup deploy
without it. A template carrying an execution role or a tag still gets its cutoff. Refusals are kept
for a property of the wrong type and for a resource the simulation could not create.

`sim-cfn-athena-property-values.ts` reads nested values. It takes a numeric or `"true"`/`"false"`
string as well as the real type, because a template parameter arrives as a string even where the
property it feeds is a number.

The `Ref` and `Fn::GetAtt` adapters live under
`src/service/cloudformation/resource/cfn/athena/`, beside the other services' adapters, as the
engine's own convention has them.
