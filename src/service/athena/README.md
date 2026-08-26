# Simulated Athena implementation

This directory contains the simulated Athena implementation. Workgroups and named queries are
deployable from a template and readable through the SDK, and a query runs through its states over
data a test seeded into simulated S3.

A query is answered one of two ways. A test declares what it answers with and the simulation matches
that declaration on the query text, the way simulated Bedrock answers a prompt and simulated
Rekognition answers an image, all three through `SimDeclaredResultRules`. Or the query engine reads
the objects a test seeded into simulated S3 and answers the statement under SQLite.

The engine was the second answer to a question this service originally settled the other way.
Writing a query engine over Parquet and JSON objects in S3 was sized at four to seven thousand lines
and ruled out. Handing the SQL to `node-sql-parser` and the rows to `node:sqlite` came to a tenth of
that, and it answers roughly nineteen queries in twenty of the shapes a test writes. The spike that
measured it is on `#1004`.

What the declarations give is still worth having on its own. The lifecycle a client polls is real,
the bytes-scanned cutoff refuses a query for real, the tables a query names are looked for in the
Data Catalog, and a result set really is written to the workgroup's output location. The divergence
to be honest about is that simulated Athena accepts a query real Athena would reject.
`docs/services/athena/README.md` says so in its Limitations list.

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

`sim-athena-scanned-bytes.ts` measures what a query reads. It lists every prefix the plan came to
through simulated S3, sums the object sizes, and counts a key reached twice once. An absent Bucket
scans nothing. Every other listing failure raises, and that is how a caller refused by IAM fails the
query.

That split is the point of the file. A table whose Bucket is absent from the simulation is ordinary
in a test, and refusing it would fail every query written before anything was measured. A caller
refused permission on the data is the behaviour the measurement exists to expose.

The cutoff is checked in the runner against that figure, or against a declaration where a test wrote
one down. `SimAthenaResolvedResult.declaredBytesScanned` is what tells a declared zero from an
absent one. That is the whole of the cost guardrail, and it is enforced whether or not the
engine answers the query.

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

## The query engine

`engine/` holds it. `SimAthenaQueryEngine` is the whole of the public surface. A query it cannot run is turned down,
and the declared result answers instead.

Three decisions shape the rest of the directory.

**It is opt-in.** A project holding `node-sql-parser` for a reason of its own would otherwise find
simulated Athena answering differently from the version before it. `enable()` loads the parser there and then. A project without
the package finds out at the line that asked for the engine.

**The parser is an optional peer dependency.** It materialises 88MB in the pnpm store, and most
users will never run a query. `sim-athena-parser-module.ts` loads it by a deep path,
`node-sql-parser/build/athena.js`, which pulls one grammar at 192KB out of the twenty published. The
specifier is held in a variable so that building this repository never turns the dependency into a
required one, and a failure to resolve it is reported as something to go and add.
`scripts/mts/verify-pack.mts` installs every declared peer into a throwaway consumer. The
`package.json` entries had to land in the same change as the import.

**Everything that can fail, turns the query down.** A statement the Athena grammar refuses, a table
in a format there is no reader for, an object the caller cannot open and a statement SQLite will not
run all end with no result and the declared result answering. `sim-athena-engine-run.ts` is where
that catch sits.

### The seam

`sim-athena-query-answer.ts` is the chain. A declaration written against one exact query text wins,
then the engine, then the declarations again for the workgroup tier and the default. A declared
`failsWith` is the exception and wins from any tier, because it is a statement about the query
rather than about its rows. `simAthenaPlanQuery` reads it before anything is planned or measured. That ordering
is what keeps every test written before the engine existed working, and what gives a test an escape
hatch for one statement the engine gets wrong.

`SimDeclaredResultRules` had to learn to report a miss for it. `resultFor` always answered by
falling back to the default, and `declaredFor` answers with `undefined` where every tier missed.
Asking it for the leading key alone is what isolates the exact-query tier.

`SimAthenaQueryExecution.answeredBy` records which of the two answered. Real Athena has no such
field. It is a simulator accessor, read off `queryExecutions()`.

### Reading the data

`sim-athena-record-reader.ts` picks a reader off the SerDe class name in the table's storage
descriptor. A table declaring Parquet lands in the same place as a table whose SerDe is absent.
Guessing would answer a Parquet query with nonsense.

`sim-athena-delimited-records.ts` reads a character at a time. A quoted CSV field carries both the
delimiter and the line ending often enough to matter. An empty field reads as null, along with
Hive's `\N`. Delimited text cannot tell an empty string from an absent value, and a numeric column
is better served by the null than by text SQLite cannot convert.

Partition values travel with the prefix. `simAthenaTablePartitions` used to answer with prefixes and
now answers with a prefix and the values that produced it, because a `storage.location.template` can put a
partition value nowhere in the key path. Reading the values back off the key would lose them for
exactly the tables a template exists to serve. A table with no projection falls
back to the Hive style `key=value` segments of the object's own key.

### The database

`sim-athena-sqlite-database.ts` builds one in-memory database per query. Each Glue database is
attached as a SQLite schema of the same name, and `rainlytics.access_logs` in the statement resolves
as it stands. SQLite refuses to reach across attached schemas from a view. A table the query context
lets a statement name unqualified is created twice.

Two settings keep an answer the same as Athena's, and both were found by measurement. `PRAGMA case_sensitive_like = ON` closes a filter that quietly takes in rows Athena
excludes. Emitting `ASC NULLS LAST` closes a sort that comes back in a different order. Each of them
was a query that succeeded and answered differently, which is the worst failure available here.

`node:sqlite` prints an `ExperimentalWarning` on the first import under Node 24.
`sim-athena-sqlite-module.ts` swaps the process warning listeners around that import and puts them
back a tick later, because `process.emitWarning` defers delivery and restoring synchronously misses
it. A project that installed a warning listener of its own keeps it, along with every other warning
it would have printed.

### Reading the answer back

`sim-athena-engine-result.ts` reads rows as arrays through `setReturnArrays`, since a statement is
free to answer with two columns of one name and an object would keep one of them.

`sim-athena-result-columns.ts` types them. SQLite reports the origin table and column for anything
traced back to a table, and that is what makes a boolean read as `true` and `false`. A computed
column has no origin. Its type is read off the first value the column answered with.

An expression nobody named is called `_col0` upward, the way Athena calls one. SQLite names it after
the expression text instead, and a name that could not have been written as an identifier is how
that is told apart from an alias a statement chose.

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
