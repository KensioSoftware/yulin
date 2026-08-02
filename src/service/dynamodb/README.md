# Simulated DynamoDB implementation

This directory contains the simulated DynamoDB service implementation.

The implementation focuses on DynamoDB behavior that is useful for isolated tests and local
development. It does not try to reproduce every DynamoDB feature, but supported behavior should be
predictable and AWS-like enough that application code can interact with it through familiar AWS SDK
commands.

## Entry points

- `sim-dynamodb.ts` is the main in-memory service object for one account/region scope.
- `index.ts` exports the public DynamoDB simulator API for `@kensio/yulin/dynamodb`.

A `SimDynamoDb` instance owns an in-memory map of tables:

```typescript
Map<DynamoDbTableName, SimDynamoDbTable>;
```

The simulator is scoped to an AWS account and region. Table ARNs are built from that scope, so a
table created in account `666666666666` and region `eu-west-2` gets an ARN like:

```text
arn:aws:dynamodb:eu-west-2:666666666666:table/FoobarTable
```

When used through `SimAws`, DynamoDB is available from account/region containers, for example
`simAws.dynamoDb()`, `simAws.account("...").dynamoDb()`, or
`simAws.account("...").region("...").dynamoDb()`.

## Command handling

AWS SDK-style operations are implemented under `command/`.

Each supported command has its own directory containing:

- command input/output typing
- a handler that applies validation and state changes
- tests for the simulated command behavior

As with other service implementations, implementation code under `src/` should not import real AWS
SDK packages. Instead, the simulator defines minimal structural interfaces that match the shape of
the AWS SDK command objects closely enough for users and tests to pass in real SDK command
instances.

Current command areas include:

- `authorize/` (shared IAM authorization for every DynamoDB command)
- `table/` (CreateTable, DescribeTable, ListTables and DeleteTable)
- `item/` (PutItem, GetItem, DeleteItem, UpdateItem, and the structural types for the item commands)
- `query/` (Query)
- `scan/` (Scan, including parallel scan segments)
- `batch/` (BatchWriteItem and BatchGetItem)
- `transact/` (TransactWriteItems and TransactGetItems)
- `tag/` (TagResource, UntagResource and ListTagsOfResource)
- `time-to-live/` (UpdateTimeToLive and DescribeTimeToLive)

The `@aws-sdk/lib-dynamodb` document client's Commands are handled under `document/` rather than
here, since they are the same operations with a conversion around them.

`table/` is the layout newer commands follow: one directory per group of related commands, with the
structural command types in `table.command.ts`, the value and description shapes they are made of in
`table.types.ts`, and one class per command or closely related group. `item/` follows the same shape
for the item commands.

The main `SimDynamoDb` class delegates command execution to command classes and handlers rather than
keeping command handling logic inline.

## Authorization

`SimDynamoDbAuthorizer` applies simulated IAM to every DynamoDB command. One authorizer is built by
`SimDynamoDb` and passed to the command classes, rather than each command having its own.

AWS maps each DynamoDB API operation to the `dynamodb:` action of the same name, and the resource is
the ARN of the table the operation names. `authorizeTable()` builds that ARN from the Account and
Region scope, so the ARN is put together in one place. ListTables names no table, so
`authorizeAnyTable()` authorizes it against `*`.

The table need not exist. Real IAM evaluates a request before the service handles it, so
authorization comes before any lookup in the table store.

## Table model

Table state lives under `table/`.

`SimDynamoDbTable` represents a simulated table. It tracks:

- table name
- table ARN and table ID
- creation time
- current table status
- key schema and attribute definitions
- secondary indexes, global and local
- billing mode, provisioned throughput, table class and deletion protection
- tags
- in-memory items

A table is built from values that have already been checked, not from a command object. Anything
that can produce those values can make one, which is what will let CloudFormation create a table
without a CreateTable command to hand it. `toDescription()` is how a table reports itself back, so
the description lives with the table rather than in the command that made it.

Tables start in `CREATING` status. `SimDynamoDbCreateTable` schedules a background task that later
activates the table by changing its status to `ACTIVE`.

This means tests may observe `CREATING` immediately after creation, then call
`simAws.backgroundTasksComplete()` when they need all scheduled state transitions to have completed.

Each part of a table validates its own input, and each throws `SimDynamoDbValidationException`
naming what was wrong:

- `SimDynamoDbTableName` for the name pattern and length
- `SimDynamoDbKeySchema` for key element order, position and attribute names
- `SimDynamoDbAttributeDefinitions` for attribute types, duplicates, and matching every key schema in
  both directions
- `SimDynamoDbTableBilling` for the billing mode and the throughput that goes with it

## Key schema handling

`SimDynamoDbKeySchema` holds the key of a table or of one of its secondary indexes.

Supported key schema behavior:

- a `HASH` element is required, and comes first
- a `RANGE` element is optional, and comes second
- key attributes are `S`, `N` or `B`, and must have a matching attribute definition
- item partition and sort key values must be strings or numbers
- item keys are serialized as JSON and used as the internal item map key

A request carries several key schemas: the table's own, and one per index. `SimDynamoDbKeySchemaSubject`
is which of them a key schema is, and it travels with the key schema so a refusal names the one that
was wrong. That is also what lets `SimDynamoDbAttributeDefinitions.assertMatches` take every key
schema at once and report an undefined index key attribute against the index that declared it.

For a table with only a partition key named `id`, an item with `{ id: { S: "abc" } }` is stored
under an internal key equivalent to:

```json
{ "id": "abc" }
```

For a table with partition key `pk` and sort key `sk`, the internal key includes both:

```json
{ "pk": "user-123", "sk": "profile" }
```

This is an implementation detail, but it is important when changing item storage because `putItem()`
uses the key schema to overwrite items with the same primary key.

## Secondary index model

Index state lives under `secondary-index/`.

`SimDynamoDbSecondaryIndex` is the interface a read reaches an index through, whichever kind it is.
`SimDynamoDbGlobalSecondaryIndex` and `SimDynamoDbLocalSecondaryIndex` implement it, each as the name,
key schema and projection a read of it needs, plus what only it has: a throughput on the global one.

There is a collection per kind, since the two are declared apart and described apart.
`SimDynamoDbGlobalSecondaryIndexes` owns the 20 index cap and `SimDynamoDbLocalSecondaryIndexes` owns
the 5, along with the one rule about the table rather than an index: a table with no sort key has no
collection for a local secondary index to reorder. `SimDynamoDbSecondaryIndexes` holds both and owns
what they share, since neither collection can see the other:

- one namespace for their names, so a local secondary index cannot take a global one's name
- one cap of 100 `NonKeyAttributes` projected across every index of both kinds
- one `IndexName` parameter reaching either of them, through `requiredSimDynamoDbIndex`

The parts an index is made of are a file each, since each has rules of its own:

- `sim-dynamodb-index-name.ts` is the name pattern and length, which is the table name rule.
- `sim-dynamodb-index-projection.ts` is `SimDynamoDbIndexProjection`: the three projection types, and
  the two directions `INCLUDE` and `NonKeyAttributes` have to agree in. Both kinds project the same
  way, so both read it.
- `sim-dynamodb-index-throughput.ts` is the capacity a global secondary index is provisioned with,
  which contradicts the billing mode in both directions the way the table's own does.
  `sim-dynamodb-local-index-throughput.ts` is the other half of that: a local secondary index shares
  the table's throughput, so any capacity setting on one is refused.
- `sim-dynamodb-local-index-key-schema.ts` is what makes an index local. The partition key is the
  table's own, and the sort key is required and is anything the table is not already sorted by.
- `sim-dynamodb-index-status.ts` maps a table status to the index status. Nothing here adds an index
  to an existing table, so the index status follows the table's rather than being tracked apart from
  it: `CREATING` on the CreateTable response, `ACTIVE` once the table is. A local secondary index
  reports no status at all, since DynamoDB reports none for one.

Which items an index holds is worked out when the index is read rather than maintained on every
write, following the precedent `SimSqsQueue.applyLifecycle` sets. So PutItem, UpdateItem and
DeleteItem stay unaware of indexes apart from one check.

## Read views

`SimDynamoDbReadView` under `table/` is what a Query or a Scan reads: `SimDynamoDbTableView` for the
table itself, or `SimDynamoDbIndexView` for one of its indexes. `SimDynamoDbTable.view` is where the
choice is made, and it is the only place `IndexName` is looked at. Everything after it asks the view,
so a read of an index is the same read against a narrower thing rather than a second code path.

The two differ in four answers, which is the whole of what `IndexName` does:

- which items there are. An index is sparse, so the view keeps only the items carrying every index
  key attribute. That filter is the derivation, and it happens per read.
- which key a walk follows. The index key schema rather than the table's, so the key condition, the
  sort order and the parallel scan segments all follow the index.
- which attributes come back. `project` cuts an item to what the index carries, so a read of a
  KEYS_ONLY index answers with keys. A table view cuts nothing.
- what a token carries. An index key is not unique, so `tokenKey` carries the index key and the
  table key together, and `SimDynamoDbSortKeyOrder` takes the table's `SimDynamoDbItemKey` as an
  identity to separate two items sharing an index key. Without it a walk could not resume after
  either of them, and paging would repeat one or skip one.

`SimDynamoDbIndexView` splits those two ways, and what is left in the view is the walking, which is
the same walking a table gets and the same walking whichever kind of index it is:

- `SimDynamoDbIndexKeys` is which items the index holds and how an entry is named: `holds` is the
  sparseness, `tokenKey` is both keys together, and `assertStartKey` refuses a token missing either
  of them or carrying anything else.
- `SimDynamoDbIndexAttributes` is which parts of an item come back. It is an interface with an
  implementation per index kind, since this is the only place a read of one kind differs from a read
  of the other. The index builds its own through `attributesOf`, so the view asks rather than
  decides.

`SimDynamoDbProjectedIndexAttributes` is the global secondary index half. `assertCarriesWholeItem`
and `assertCarriesPaths` refuse a `Select` of `ALL_ATTRIBUTES` against a projection that is not ALL,
and a filter naming an attribute the index does not project. Both fail closed. The alternative to
the second is an empty page, which reads as a collection that happens to hold nothing.

`SimDynamoDbFetchedIndexAttributes` is the local secondary index half, and refuses neither. The index
entry is in the same partition as the item, so DynamoDB reads the base table for what the index does
not project and charges the extra capacity for it. Cutting an item down to the projection is still
the same job, so it is delegated to the projected implementation rather than written twice. What the
read then answers with is decided by `SimDynamoDbSelect.wholeItems` in `SimDynamoDbReadAnswer`: a
read asking for whole items gets the item, and anything else gets the view's projection of it.

The other place the kinds differ is `assertAnswersConsistentRead`, reached through
`SimDynamoDbReadView.assertConsistentRead` and applied by
`assertSimDynamoDbConsistentReadAnswerable`. A global secondary index is maintained asynchronously on
AWS and refuses one; a local secondary index and the table both answer it. That is why the check runs
after `IndexName` has been resolved to a view rather than off the request alone.

The one thing a write is held to on account of an index is `assertItemKeyTypes`, applied in
`SimDynamoDbTable.putItem`, which every write in the service goes through. An item missing an index
key attribute is fine, since a secondary index of either kind is sparse and simply does not hold it.
An item carrying one as a type the index did not declare is a `ValidationException`, since the index
could never hold it.

## Tagging behavior

`SimDynamoDbTableTags` is the tags one table holds, and `SimDynamoDbTableTag` is one of them. Every
rule a tag is held to lives on the tag itself: the key and value lengths, the characters a tag is
written with, and the reserved `aws:` prefix. A tag that arrived with CreateTable is checked the same
way one from TagResource is, because it is the same class reading it.

The 50 tag limit belongs to the collection rather than the tag, since it is about how many there are.
Real DynamoDB answers it with a `ValidationException` rather than the `LimitExceededException` its
API reference lists for TagResource, which is documented entirely in terms of how many table
operations are running at once.

A request is read whole before any of it is kept, so a call carrying one good tag and one bad one
leaves the table's tags exactly as they were. `TagResource` replaces the value of a key that is
already there, which is what makes it a way of changing a tag as well as adding one, and
`UntagResource` takes a key that is not there in its stride: it asks for a state rather than a
change.

`SimDynamoDbTagCommands` implements all three commands. They reach their table through the same
`SimDynamoDbTableAccess` every other command uses, so an ARN naming no table gives
`SimDynamoDbResourceNotFoundException` and an unauthorized caller is refused before the lookup. Each
authorizes the `dynamodb:` action of its own name.

Unlike the table commands, a tag command takes an ARN only. A bare table name is refused rather than
resolved, since real DynamoDB would refuse it too, and finding the table anyway would let a test pass
on a request AWS rejects.

`SimDynamoDbTagPage` pages ListTagsOfResource. The API has no page size parameter, so 25 is this
simulator's choice: half of the 50 a resource holds, so an ordinarily tagged table lists in one page
while a test can still reach a `NextToken`. As with ListTables, the token is the key to resume after
rather than an opaque cursor, so it still works when the tag it names has since been removed. Tags
are ordered by UTF-8 bytes, which is one of the orders DynamoDB allows and the one that makes paging
resumable.

## Item and attribute model

Item state lives under `item/`.

`SimDynamoDbItem` holds one item's attributes, reads them from the `AttributeValue` structures a
request carries, and writes them back. `SimDynamoDbValue` is the stored value: ten shapes, one per
DynamoDB descriptor, each holding what the request gave rather than a JavaScript stand-in for it.

- `S` → the string, which may be empty
- `N` → `SimDynamoDbNumber`, digits rather than a JavaScript number
- `B` → the `Uint8Array` bytes
- `BOOL` → the boolean
- `NULL` → nothing; the kind is the value
- `SS`, `NS`, `BS` → the members, in the order they arrived
- `L` → the element values
- `M` → a `Map` of name to value

The work is split by direction, which is what keeps each part small:

- `sim-dynamodb-value-reader.ts` reads a request's `AttributeValue`, checking the descriptor, the
  nesting depth and the shape of what it carries.
- `sim-dynamodb-value-set.ts` reads the three set kinds, which are the ones with rules of their own.
- `sim-dynamodb-value-writer.ts` writes a stored value back out.
- `sim-dynamodb-value-size.ts` counts the bytes an item takes towards the 400 KB limit.

### Numbers

`SimDynamoDbNumber` is the reason this model exists. DynamoDB numbers carry up to 38 significant
digits and a JavaScript number carries about 15, so a number is held as text and never converted.

The text is normalised: leading and trailing zeros are trimmed, and an exponent is worked back into
plain notation, so `1E5`, `100000` and `100000.00` are one value. That is what lets a number set and
a number key compare by value rather than by how they were written.

A number outside DynamoDB's range, or with more than 38 significant digits, is a
`SimDynamoDbValidationException` rather than a rounded value.

### Sets

A set holds one kind of value, holds at least one, and holds each value once. Binary members compare
by their bytes rather than by object identity, through `simDynamoDbBinaryText`, and number members
compare by their normalised digits.

## CreateTable behavior

`SimDynamoDbCreateTable` implements table creation.

The order it works in matters:

1. `refuseUnsimulatedTableInput` refuses the request inputs this simulation does not model, before
   anything else looks at the request.
2. The table name is read and checked, because the ARN is built from it.
3. IAM authorizes `dynamodb:CreateTable` against that ARN. This runs before the table map is looked
   at, so an unauthorized caller cannot find out which names are taken.
4. The key schema, billing, secondary indexes, attribute definitions and table class are read and
   checked. The indexes come before the attribute definitions, since the definitions have to match
   every key schema the request carries and the indexes are where the rest of those are.
5. Only then is the name checked against the table map and taken.

`SimDynamoDb.createTable()` awaits `background.sequence()` and then calls `handle()`, which is
synchronous. Nothing is awaited between finding a name free and taking it, so two creates racing for
the same name cannot both get it. The second gets `SimDynamoDbResourceInUseException`.

The returned `TableDescription` reports the table back: `TableName`, `TableArn`, `TableId`,
`KeySchema`, `AttributeDefinitions`, `TableStatus`, `CreationDateTime`, `ProvisionedThroughput`,
`DeletionProtectionEnabled`, and `BillingModeSummary` or `TableClassSummary` when the request named
a billing mode or a table class. `GlobalSecondaryIndexes` and `LocalSecondaryIndexes` are each
there when the table has any of that kind, and left out altogether when it has none. `ItemCount` and `TableSizeBytes` stay at 0.

Unsimulated inputs are refused with `SimDynamoDbUnsupportedOperation` rather than dropped. Each one
is listed in the Limitations section of
[the usage docs](../../../docs/services/dynamodb/ "Simulated DynamoDB usage docs").

## Table store

`SimDynamoDbTableStore` holds the tables of one simulated DynamoDB, keyed by name. Listing them in
order lives there rather than in ListTables, because the order is a property of the tables rather
than of the request that reads them.

The order is by UTF-8 bytes, which is DynamoDB's, applied through
`compareSimDynamoDbTableNames`. Table names are ASCII, so this is the same order the characters are
in, but comparing bytes keeps it the same whatever locale the host runs in. It also means tests can
create tables concurrently and still assert a deterministic list.

## DescribeTable, ListTables and DeleteTable behavior

`SimDynamoDbTableCommands` implements all three, reaching their tables through
`SimDynamoDbTableAccess`. That is where the order every command follows lives: read the table the
request names, authorize the caller against it, and only then look it up.

DescribeTable and DeleteTable name one table, and `readSimDynamoDbTableReference` takes either its
name or its ARN, as real DynamoDB does. An ARN for another Account or Region is refused rather than
resolved to the local table of that name. ListTables names no table at all: its
`ExclusiveStartTableName` is a pagination token rather than a table reference, and it authorizes
against every table in the Account and Region.

DescribeTable answers with `table.toDescription()`, the same description CreateTable answered with.

ListTables pages through the store's ordered names in `SimDynamoDbTablePage`:

- `Limit` is a whole number from 1 to 100, and defaults to 100.
- `ExclusiveStartTableName` resumes at the first name strictly greater than it, so a token still
  works when the table it names has been deleted.
- `LastEvaluatedTableName` is only set when names remain after the page, so a caller looping until
  the token is absent terminates.

DeleteTable follows the status DynamoDB moves a deleted table through:

- a table protected by `DeletionProtectionEnabled` refuses the delete and stays as it was.
- a CREATING or UPDATING table throws `SimDynamoDbResourceInUseException`.
- an ACTIVE table goes to DELETING, and a background task then removes it from the store, taking its
  items with it.
- a table already DELETING is not an error, since the request asks for a state it is heading to.
- a table that is not there throws `SimDynamoDbResourceNotFoundException`.

## PutItem behavior

`SimDynamoDbPutItem` implements item writes. It reaches its table through the same
`SimDynamoDbTableAccess` the table commands use, so it takes a table name or ARN and authorizes
before the lookup.

Important behavior:

- `Item` is required, and is read into a `SimDynamoDbItem`, which is where value and size checks
  happen.
- `SimDynamoDbItemKey` marshals the primary key from the item, requiring every key attribute to be
  there, to be the type the table declared for it, and not to be empty.
- a put replaces the whole item under that key rather than merging into it.
- the write lands before the call returns, so the table is read-your-writes. Nothing about it is
  scheduled.
- `ReturnValues` takes `NONE` and `ALL_OLD`, which are the two real PutItem has. `ALL_OLD` answers
  with the item that was replaced, and with nothing when there was none.
- the inputs this simulation does not model are refused by name in
  `sim-dynamodb-unsimulated-item-write-input.ts`, which DeleteItem shares, and a request naming only
  their `NONE` default is let through. `SimDynamoDbUnsimulatedInput` is what each refusal is made of,
  so the wording is the same across the item commands.

## GetItem and DeleteItem behavior

`SimDynamoDbGetItem` and `SimDynamoDbDeleteItem` name one item by its primary key, and reach their
table the same way PutItem does.

Both read their `Key` through `readSimDynamoDbKey`, which reads it as an item so the attribute values
it carries are checked, and then through `SimDynamoDbItemKey.ofKey()`, which is the shared key
validator. A Key is the whole primary key and nothing else: an item may carry any attributes
alongside its key, but a Key has nothing to match an extra attribute against, so one is refused
naming the attribute. Missing key elements, type mismatches and empty key values come back through
the same checks PutItem applies on the way in.

Important behavior:

- GetItem leaves `Item` out altogether on a miss, rather than answering with an empty map. That
  absence is how a caller tells a miss from an item carrying nothing but its key. A projection that
  found none of what it asked for is the other case: the key was there, so `Item` is present and
  empty.
- GetItem reads its `ProjectionExpression` before it reaches the table, so an expression DynamoDB
  would refuse is refused whether or not the key holds anything.
- `ConsistentRead` is accepted either way and changes nothing. Nothing about a write is scheduled, so
  there is no window in which an eventually consistent read could answer with something older.
- DeleteItem is idempotent. It names a key rather than an item, so deleting a key that is already
  free succeeds and reports nothing removed.
- DeleteItem takes the same `ReturnValues` as PutItem, through `SimDynamoDbReturnValues`, which is
  where the two modes and the error text for a third live.
- Both take a `ConditionExpression`, through the shared `SimDynamoDbConditionCheck`. The condition is
  checked against what is stored before anything changes, so a write it turns away leaves the item
  exactly as it was. PutItem finds what is stored through `SimDynamoDbTable.itemUnder`, which reads
  the key out of the item being written rather than out of a Key of its own.
- GetItem refuses the legacy `AttributesToGet` and a `ReturnConsumedCapacity` that asks for anything,
  in `sim-dynamodb-unsimulated-item-read-input.ts`. `ExpressionAttributeNames` with no expression to
  use them in is a `ValidationException` rather than an unsupported operation, because real DynamoDB
  refuses that too. DeleteItem refuses the same conditional write and reporting inputs PutItem does.

## UpdateItem behavior

`SimDynamoDbUpdateItem` changes part of an item, where PutItem replaces the whole thing. It reaches
its table the same way, and reads its `Key` through the same `readSimDynamoDbKey`.

The order it works in matters:

1. `refuseUnsimulatedItemUpdateInput` refuses the inputs this simulation does not model, including
   the legacy `AttributeUpdates`.
2. `SimDynamoDbUpdatePlan` reads both expressions, before the table is reached.
3. The table is found and the caller authorized against `dynamodb:UpdateItem`.
4. The condition is checked against what is stored.
5. The update is refused if it would move the primary key, and then applied.

`SimDynamoDbUpdatePlan` is what holds an update and its condition together. UpdateItem is the first
command to carry two expressions at once, and both draw on the same `ExpressionAttributeNames` and
`ExpressionAttributeValues`. Reading them against one `SimDynamoDbExpressionParameters` is what lets
a placeholder used by either count as used, so `parseSimDynamoDbCondition` takes the parameters
rather than reading them from the request the way `readSimDynamoDbCondition` does.

Important behavior:

- every action is evaluated against `SimDynamoDbItemSnapshot` of the item as it stood before the
  request, rather than against the item being built. `REMOVE a SET b = a, c = b` on `{ a: 1, b: 2,
c: 3 }` leaves `{ b: 1, c: 2 }`, which an implementation applying actions left to right answers
  differently.
- UpdateItem upserts. With nothing stored under the key, the new item is built from the `Key` plus
  the SET actions, and the snapshot every action reads holds nothing.
- a SET operand pointing at an attribute the item does not have is a `ValidationException`, as it is
  on AWS. `if_not_exists` is how an expression says what to assign when the attribute may be absent.
- assigning into a map the item does not carry is a `ValidationException`. An update does not make a
  map on the way past.
- an update cannot move the primary key. `SimDynamoDbUpdate.assertLeavesKeyAlone` refuses an action
  writing to a key attribute, since the request already names the item it works on.
- `ReturnValues` takes all five modes, through the same `SimDynamoDbReturnValues` the other item
  writes use. `SimDynamoDbUpdateAnswer` reads the mode as two questions rather than five answers:
  which item is reported, and whether the whole of it is. `UPDATED_OLD` and `UPDATED_NEW` report the
  parts the expression touched by applying a `SimDynamoDbProjection` of the action targets, which is
  the same machinery a ProjectionExpression uses.

## Query behavior

`SimDynamoDbQuery` reads one item collection: the items under one partition key, in sort key order.
It reaches its table the same way the item commands do, and authorizes `dynamodb:Query` before the
lookup.

The order it works in is the order the other commands follow, with one addition:

1. `SimDynamoDbSelect.from` reads which attributes the request asks for. It comes first because it
   decides whether the projection the request carries is one it could have asked for at all.
2. `refuseUnsimulatedQueryInput` refuses the inputs this simulation does not model.
3. `readSimDynamoDbQueryExpressions` reads the `KeyConditionExpression` and the `FilterExpression`,
   before the table is reached, so an expression DynamoDB would refuse is refused whether or not the
   table is there. Both draw on one `SimDynamoDbExpressionParameters`, the way UpdateItem's two
   expressions do.
4. The table is found and the caller authorized.
5. `SimDynamoDbKeyConditionTerms.forTable` reads the terms against the table's key schema, which is
   the part that could not be checked without it: which attribute is the partition key, and what type
   the sort key is. `SimDynamoDbFilter.assertNamesNoKeyAttribute` is held to the same schema.
6. The collection is gathered, walked, and cut to a page, which is then filtered.

The parts a query is made of split by what they know:

- `expression/key-condition/` reads the expression. It is a closed grammar of its own rather than the
  general condition grammar, for the reason in the Expressions section below.
- `SimDynamoDbItemCollection` under `table/` is the items one key condition names, in sort key order.
  A table holds its items in a map keyed by the marshalled primary key, which carries no order at
  all, so a collection is gathered and ordered when it is read. `SimDynamoDbSortKeyOrder` is the
  order itself, and is where a table with no sort key stops mattering: such a table holds at most one
  item under a partition key, so every question about ordering has a trivial answer.
- `SimDynamoDbItemPage` under `command/item/` is `Limit` and `LastEvaluatedKey`. It takes items and a
  key schema rather than a query, which is what lets `Scan` use it unchanged.
- `command/read/` is what a query and a scan answer with, since both answer the same way.
  `SimDynamoDbReadAnswer` holds the order the counts depend on: a page cut at the `Limit`, then
  filtered, so `ScannedCount` is what was evaluated and `Count` what survived. `SimDynamoDbSelect` is
  the `Select` matrix, and is what leaves `Items` out of a counted read.
- `expression/filter/` reads the `FilterExpression`. It is the ordinary condition grammar rather than
  one of its own, so it goes through `SimDynamoDbConditionParser` under a different expression name.
  `SimDynamoDbFilter` is the condition plus the paths it named, which is what the key attribute rule
  needs.
- `readSimDynamoDbQueryStartKey` reads the `ExclusiveStartKey`. It goes through the table's own key
  reading, so a token that is not a whole primary key is refused the way any Key is, and then checks
  that it names the collection being read.

Important behavior:

- `ScanIndexForward` defaults to true. Setting it to false reads the collection backwards, and
  resumes backwards too.
- `Limit` counts the items a walk evaluated rather than the items it answers with. The filter runs
  over the page after the cut, so `ScannedCount` is the walk's own count and `Count` is what the
  filter kept. A page can come back empty with a `LastEvaluatedKey` on it.
- a filter naming a key attribute is refused, since a query has narrowed by its key condition
  already. `SimDynamoDbDocumentPath.startsAt` is the check, so a path into a map named after a key
  attribute is not caught by it.
- `LastEvaluatedKey` is there whenever the walk stopped at the limit, including when it stopped on
  the last matching item. A caller looping until the token is absent therefore reads one empty page
  at the end, which is what real DynamoDB does: it cannot know the range is exhausted without looking
  past it.
- `ExclusiveStartKey` resumes exclusively, by comparing sort keys rather than by looking the item up,
  so a token still works when the item it names has since been deleted. That is the same choice
  `ListTables` and `ListTagsOfResource` make.
- `ProjectionExpression` is refused by name, since it changes which parts of an item a query answers
  with.
- `IndexName` chooses what is read, through `SimDynamoDbTable.view`. Everything after that asks the
  view rather than the table, so a query of an index is the same query against a narrower thing.

## Scan behavior

`SimDynamoDbScan` reads a whole table rather than one item collection, so it needs no key condition
and no key knowledge. It takes the same steps a query does, minus the key condition:

1. `SimDynamoDbSelect.from` reads which attributes the request asks for.
2. `refuseUnsimulatedScanInput` refuses the inputs this simulation does not model.
3. `readSimDynamoDbScanSegment` reads `Segment` and `TotalSegments`, and `readSimDynamoDbFilter` the
   `FilterExpression`, before the table is reached, so input DynamoDB would refuse is refused whether
   or not the table is there. A scan filter needs nothing from the table, unlike a query's.
4. The table is found and the caller authorized.
5. The table is put in scan order, walked from the `ExclusiveStartKey`, and cut to a page by the same
   `SimDynamoDbItemPage` a query uses, then filtered by the same `SimDynamoDbReadAnswer`.

The parts a scan is made of sit under `table/`, since the order and the segments belong to the table
rather than to the command reading it:

- `SimDynamoDbTableScan` is every item the table holds, in the order a scan reads them. As with an
  item collection the order is worked out when the table is read, because the item map carries none.
- `SimDynamoDbScanPosition` is where one item sits in that order: by the hash of its partition key
  first, then by sort key through `SimDynamoDbSortKeyOrder`. Partition keys that hash alike are
  separated by their marshalled bytes, which is what makes the order total rather than merely
  arbitrary. A position is worked out for the `ExclusiveStartKey` too, so a token names a place
  rather than an item and still resumes a scan after the item it named has been deleted.
- `SimDynamoDbScanSegment` is one share of a parallel scan, and holds a partition key when its hash
  modulo `TotalSegments` is the segment's own number. It validates the division it was built from, so
  a segment that exists is one a request could ask for.
- `simDynamoDbPartitionKeyHash` is the hash both of those read. It is FNV-1a rather than DynamoDB's
  own, which is unpublished, so the segment an item lands in here is not the segment it lands in on
  AWS. What is reproduced is the shape: whole item collections move together and segments come out
  uneven.

Important behavior:

- Partition key values come back in hash order, which is deliberately not the sorted order. Real
  DynamoDB sorts nothing across partitions, so a scan that came back sorted would let a test lean on
  an ordering the service does not give. It is stable within a process all the same, since an
  `ExclusiveStartKey` could not resume a scan otherwise.
- Items under one partition key come back together and ascending by sort key.
- `Segment` and `TotalSegments` are supplied together or not at all, and neither is defaulted from
  the other. A request naming neither reads `SimDynamoDbScanSegment.whole()`, which is one segment out
  of one.
- An `ExclusiveStartKey` from another segment is refused. Resuming the wrong segment is the mistake
  parallel scan code makes, so it fails rather than reading that segment from the start.
- `ConsistentRead` is accepted and changes nothing, since every simulated read is strongly
  consistent.
- a scan filter may name any attribute, key attributes included, where a query's may not. A scan has
  narrowed nothing, so there is no key condition for a filter to contradict.
- `ExpressionAttributeNames` and `ExpressionAttributeValues` with no `FilterExpression` to use them
  in are a `ValidationException` through `SimDynamoDbExpressionParameters.assertNoneWithout`, rather
  than unsimulated input, because that is what real DynamoDB calls them.
- `Segment` and `TotalSegments` are declared on the Query input as well, and refused there by
  `refuseSimDynamoDbQuerySegment`. They are not Query parameters on AWS, and a query carrying one is
  code that meant to scan.

## BatchWriteItem and BatchGetItem behavior

`SimDynamoDbBatchWriteItem` and `SimDynamoDbBatchGetItem` work on several items across several
tables in one call. Both read a `RequestItems` map of table reference to what that table is asked
for, through the shared `readSimDynamoDbBatchRequestItems`, which keeps the reference as it arrived
so a batch read answers under the name or ARN the request used.

The order both work in is the same, and it is what makes a batch all or nothing:

1. Everything that can be read without a table is read: the request cap, the per entry shapes, the
   items, the keys and the projections. Nothing here has reached the table store.
2. Every table is reached and the caller authorized against it. The tables are then compared, since
   a name and an ARN are two entries naming one table, which real DynamoDB refuses.
3. Every key is marshalled through the table's key schema, which is both the key check and what
   tells two operations on one item apart.
4. Only then is the first item written.

A batch write that fails any of those leaves nothing written, which is what real DynamoDB does: it
rejects the whole request rather than reporting a failure per entry. That is the difference from the
SQS batch collaborator in `src/service/sqs/command/message/sim-sqs-batch-entries.ts`, which reports
per-entry failures in a `Failed` array while the rest of the batch goes through.

The parts a batch is made of split by what they know:

- `SimDynamoDbBatchWrite` is one put or delete, as the item or key it carries plus what it does to a
  table. Both implementations answer with the key they work on, so the duplicate check and the write
  read the same item.
- `sim-dynamodb-batch-writes.ts` reads a whole `RequestItems` into those, applying the 25 request
  cap across every table the request names.
- `sim-dynamodb-batch-reads.ts` does the same for a batch read, applying the 100 key cap and reading
  each table's `ProjectionExpression` through the same `readSimDynamoDbProjection` GetItem uses.
- `assertDistinctBatchItems` is the duplicate item check both use, over marshalled keys.
- `reachSimDynamoDbBatchTables` is how both reach their tables: it authorizes the caller against
  each, and refuses a request naming one table twice, comparing the tables the references resolved
  to rather than the references themselves.

`UnprocessedItems` and `UnprocessedKeys` are always empty maps. Nothing here is throttled and no
response stops at a size, so no request is ever left over, but the map is answered with rather than
left out so a retry loop written around it terminates.

A batch write takes no `ConditionExpression`, as a real one does not. `SimDynamoDbPutRequest` and
`SimDynamoDbDeleteRequest` declare one anyway, so a request carrying it is refused by name rather
than written unconditionally.

Streams are not implemented. Billing mode and provisioned
capacity are read and stored by CreateTable, for the table and for each index, but nothing enforces
them: no write is ever throttled.

## TransactWriteItems and TransactGetItems behavior

`SimDynamoDbTransactWriteItems` and `SimDynamoDbTransactGetItems` work on several items across
several tables in one step, where either all of it happens or none of it does.

Atomicity here follows from the order the work is done in rather than from unwinding a partial
write:

1. Everything that can be read without a table is read: the action count, which of the four actions
   each entry carries, the items, the keys, the expressions and the request size.
2. Every table is reached and the caller authorized against it. A transaction is authorized as the
   operations it is made of, so each action carries its own `dynamodb:` action, and a ConditionCheck
   needs `dynamodb:ConditionCheckItem`.
3. Every key is marshalled through its table's key schema, which is both the key check and what
   tells two actions on one item apart. Unlike a batch, one table may be named as often as the
   request likes.
4. Every action is checked against what is stored, and only then does the first of them write.

The parts a transaction is made of split by what they know:

- `SimDynamoDbTransactWrite` is one action, as the item or key it carries, the condition guarding
  it, the IAM action it needs and what it does to a table. The four implementations are in
  `sim-dynamodb-transact-put-action.ts`, `sim-dynamodb-transact-update-action.ts` and
  `sim-dynamodb-transact-key-actions.ts`, which holds the delete and the condition check together
  since both are a key and a condition against what is stored under it. Each file reads its own
  action from the request, so what a Put requires lives with the Put.
- `sim-dynamodb-transact-write.ts` reads one entry into one of those, refusing an entry carrying two
  of the four or none of them.
- `sim-dynamodb-transact-writes.ts` reads a whole `TransactItems`, applying the 100 action cap and
  the 4 MB request size.
- `sim-dynamodb-transact-gets.ts` does the same for a transactional read, reading each `Get`'s
  `ProjectionExpression` through the same `readSimDynamoDbProjection` GetItem uses.
- `reachSimDynamoDbTransactTables` is how both reach their tables, and where the one-action-per-item
  rule is applied.
- `sim-dynamodb-transact-cancellation.ts` is the check and the writing, in that order. It asks every
  action whether it applies, turning a `SimDynamoDbConditionalCheckFailedException` into that
  action's cancellation reason and leaving anything else to throw, since a request DynamoDB would
  refuse is refused rather than cancelled. Only once every action has answered does the first of
  them write.

Every action is checked rather than stopping at the first failure, because a caller reads which of
its actions failed out of `CancellationReasons`. The reasons line up with the request positionally,
including the actions nothing was wrong with, which carry `None`.

`SimDynamoDbTransactionTokens` is the idempotency of `ClientRequestToken`. It holds the payload a
token was used with and when, so a replay inside ten minutes is answered without applying anything,
and a replay with a different payload is refused. The window is measured on the simulated clock,
which is why `SimDynamoDbTransactWriteItems` takes one. Only a transaction that was applied is
recorded, since one that was cancelled never happened.

The replay is checked after the request has been read and the caller authorized, rather than before.
Real IAM evaluates a request before the service handles it, so a caller with no permission is
refused whichever token it carries.

A transactional read answers positionally too. `Responses` is never compacted: a key holding nothing
gives an entry with no `Item`, where BatchGetItem leaves the item out altogether.

## Expressions

`expression/` holds the parts every DynamoDB expression parameter is made of. Projections,
conditions, filters, key conditions and updates are all written in the same lexical shapes and all
point at parts of an item the same way, so those parts are built once rather than once per
expression kind. Writing them per feature is how the parsers drift apart and start disagreeing about
what `a.b[0]` means.

The shared parts:

- `SimDynamoDbExpressionTokeniser` reads an expression into `name`, `namePlaceholder`,
  `valuePlaceholder`, `number` and `symbol` tokens. The set of symbols it knows is deliberately
  small, and grows as expression kinds arrive: a character outside it is refused rather than passed
  through to a parser that would ignore it. A fraction is read as one number token, so an index of
  `1.5` can be refused as a fraction rather than as a syntax error somewhere after it.
- `SimDynamoDbExpressionTokens` is a parser's place in those tokens. Reading forwards, peeking, and
  what happens at the end live there rather than in each parser.
- `SimDynamoDbExpressionPlaceholders` holds one of `ExpressionAttributeNames` or
  `ExpressionAttributeValues`. Both are a map of placeholders to what they stand for, so one generic
  class holds either. It fails closed in both directions: a placeholder an expression uses and the
  request does not define is refused, and so is an entry no expression used.
- `SimDynamoDbDocumentPath` is where an expression is pointing, as attribute and index segments
  rather than as text to split later. `SimDynamoDbDocumentPathParser` reads one, substituting name
  placeholders as it goes, so everything downstream sees one kind of path. It stops at the first
  token that cannot continue a path, leaving it for whatever is reading around it, such as the comma
  between two projected paths.
- `simDynamoDbExpressionError` builds every refusal, so they all read as
  `Invalid <parameter>: <reason>`. A request can carry several expressions, so naming which one was
  wrong matters.
- `SimDynamoDbItemSnapshot` is the item an expression is read against: the item stored under the
  key, which may be nothing at all. That is what makes `attribute_not_exists(id)` an insert if
  absent, since every path resolves to nothing when there is no item. Conditions and updates both
  read it, which is why it sits here rather than with either of them.

`expression/condition/` reads a ConditionExpression into a `SimDynamoDbCondition`, which answers yes
or no for a snapshot.

`SimDynamoDbConditionParser` is recursive descent with one method per precedence level, so the
precedence DynamoDB documents is the shape of the class rather than a table somewhere. The operands
and the function calls have parsers of their own, because deciding whether `size` is a call or an
attribute named `size` is a different job from deciding whether an OR binds looser than an AND.

`expression/filter/` is the same grammar under another name. A FilterExpression is a
ConditionExpression evaluated against each item a read reached, so `parseSimDynamoDbFilter` builds
the same parser through `SimDynamoDbConditionParser.of` and only the expression name a refusal
carries differs. What it adds is `SimDynamoDbFilter`, which holds the paths the expression named
alongside the condition. Nothing checking a write needs those, since the request already named the
item; a query does, to be refused for naming a key attribute.

The comparison rules live in `item/sim-dynamodb-value-comparison.ts` and
`item/sim-dynamodb-value-order.ts` rather than inside the evaluator, because a sort key condition
compares the same way a condition expression and a filter expression do. Strings compare by UTF-8 bytes rather than by UTF-16 code units, numbers compare through
`SimDynamoDbNumber.compareTo` so digits past what a JavaScript number holds still order correctly,
and binary compares as unsigned bytes. Two values of different types have no order at all, which is
what makes a comparison between them false rather than an error. `simDynamoDbValueBeginsWith` in
`item/sim-dynamodb-value-prefix.ts` is the same arrangement for a prefix, which `begins_with` asks
for in both grammars.

`expression/key-condition/` reads a KeyConditionExpression into the terms it is made of. It is a
grammar of its own rather than a use of the condition parser, and deliberately so: sharing one parser
would let a query accept `OR`, which real DynamoDB refuses in a key condition, and that is the kind
of divergence that passes here and fails on deploy.

The parts split by what they know:

- `SimDynamoDbKeyConditionParser` reads the shape a key condition is allowed to take. It knows
  nothing about which attribute is the partition key, since that belongs to the table.
- `SimDynamoDbKeyConditionOperands` reads the three pieces every term is built from: the key
  attribute, the comparator, and the value.
- `SimDynamoDbKeyConditionRefusals` is what a key condition is refused for being rather than for what
  it says: `OR`, `NOT`, brackets, a function that is not `begins_with`, and a dereferenced attribute.
- The three terms are a class each, in `sim-dynamodb-comparison-key-term.ts`,
  `sim-dynamodb-between-key-term.ts` and `sim-dynamodb-begins-with-key-term.ts`. Each knows what it
  refuses: a BETWEEN whose bounds run backwards or are different types, and a `begins_with` against a
  Number sort key. `assertUsableOn` is where a term is held to the type the table declared for the
  key attribute, through the shared `assertSimDynamoDbKeyValueType`. A value of another type is
  refused rather than matching nothing, since an empty page would read as a collection that happens
  to hold nothing.
- `SimDynamoDbKeyConditionTerms` holds the terms to the key schema once the table has been reached,
  and answers with a `SimDynamoDbKeyCondition`: the partition key value whose collection is read, and
  the run of it the sort key condition asks for.

`SimDynamoDbConditionCheck` under `command/item/` is what PutItem and DeleteItem both use. It reads
the expression before the table is reached, so an expression DynamoDB would refuse is refused
whether or not the key holds anything, and it throws
`SimDynamoDbConditionalCheckFailedException` before anything is written.

`expression/update/` reads an UpdateExpression into a `SimDynamoDbUpdate`, which is the actions it
asks for. `SimDynamoDbUpdateParser` reads the clauses, each keyword at most once and in either
order, and `SimDynamoDbUpdateOperandParser` reads what a SET action assigns.

The parts an update is made of split by what they know:

- `SimDynamoDbUpdateTarget` is where an action writes. It is a document path that has been checked
  for what an update can change: it starts at an attribute, since an item is a map, and what follows
  may be attributes or list indexes.
- `SimDynamoDbUpdateDocument` is the item being built. Nothing reads from it, which is what keeps
  the snapshot rule true however the actions are ordered. Writing into it and taking things out of
  it are a level at a time, in `sim-dynamodb-update-write.ts` and `sim-dynamodb-update-erase.ts`.
- `SimDynamoDbUpdateOperand` is what a SET action assigns: a supplied value, a document path, a call
  to `if_not_exists` or `list_append`, or two operands with one `+` or `-` between them. Update
  expressions have no literals, so every constant arrives through `ExpressionAttributeValues`.
- `SimDynamoDbAddAction` and `SimDynamoDbDeleteAction` are the two clauses that work from what is
  stored rather than replacing it. What they share is in `sim-dynamodb-update-accumulate-values.ts`:
  pairing the stored value with the one being applied, and the two refusals for when they do not go
  together.

DynamoDB takes one operator between two operands, with no chaining and no brackets, so the operand
parser reads one and refuses a second. That is a grammar rule rather than a simulation limit: real
DynamoDB refuses `:a + :b + :c` as a syntax error too.

`expression/projection/` is the other consumer. `readSimDynamoDbProjection` reads a
`ProjectionExpression` and its names into a `SimDynamoDbProjection`, and `SimDynamoDbProjectionNode`
merges the paths into a tree before anything is read, so `address.city` and `address.postcode` become
one `address` holding two attributes. Two paths where one contains the other are refused there, as
real DynamoDB refuses them.

Applying a projection is `undefined` for anything the item does not have, at every level: a missing
attribute, an index past the end of a list, and a path reaching into the wrong kind of value all
come back as nothing rather than as an error. A projected list is closed up, so `lines[2]` on its own
answers with a one element list.

## CloudFormation

`cfn/` owns the `AWS::DynamoDB::*` resource types, following the rule that CloudFormation
orchestrates and services create.

`SimDynamoDbCfnResourceFactory` is the entry point, resolved into the CloudFormation engine by
`sim-cfn-service-resolver.ts`. `Table` is the only resource type it creates. Anything else, including
`GlobalTable`, throws an `Unsupported sim DynamoDB CloudFormation Resource` error, which is the
wording that marks a resource as skipped rather than failing the stack.

The parts under `cfn/table/` split by responsibility:

- `SimCfnDynamoDbTablePropertyRules` decides what a property means. A simulated property is passed
  on, a real property that is not simulated skips the resource with a reason naming it, and anything
  that is not an `AWS::DynamoDB::Table` property at all fails the resource, because that is a
  template real CloudFormation would refuse too.
- `SimCfnDynamoDbTableValues` reads the plain shapes a property can hold, naming the property path in
  each refusal. It takes a number from the string a template Parameter carries one as.
- `SimCfnDynamoDbTableProperties` turns the template properties into `CreateTable` input, and
  generates a name for a table the template did not name, through the shared
  `SimCfnGeneratedResourceName`.
- `SimCfnDynamoDbTableCreator` calls `SimDynamoDb.createTable()` with that input and finds the
  created table through `SimDynamoDb.findTable()`.

Nothing here decides what a key schema, a billing mode or a table class is allowed to be. Creating
the table through the ordinary command is what keeps a template-created table the same thing an SDK
caller would have got.

`Ref` and `Fn::GetAtt` behaviour lives with the CloudFormation engine rather than on the table, in
`SimDynamoDbTableCfn` under `cloudformation/resource/cfn/dynamodb/`. `Ref` answers with the table
name and `Fn::GetAtt Arn` with the table ARN. `StreamArn` is refused by name, since an invented
stream ARN would read as a working stream.

## Error model

DynamoDB-specific errors live under `error/`.

The base error is `SimDynamoDbError`, which carries minimal AWS-like `$metadata`.

Current specialized errors:

- `SimDynamoDbResourceInUseException`
  - name: `ResourceInUseException`
  - HTTP status: `400`
  - used for duplicate table creation
- `SimDynamoDbResourceNotFoundException`
  - name: `ResourceNotFoundException`
  - HTTP status: `400`
  - used when a table lookup fails
- `SimDynamoDbValidationException`
  - name: `ValidationException`
  - HTTP status: `400`
  - used for request input real DynamoDB would refuse
- `SimDynamoDbConditionalCheckFailedException`
  - name: `ConditionalCheckFailedException`
  - HTTP status: `400`
  - used when a ConditionExpression did not hold, with the message real DynamoDB uses so SDK error
    handling matches. It carries the stored item when the request asked for it with
    `ReturnValuesOnConditionCheckFailure`.
- `SimDynamoDbTransactionCanceledException`
  - name: `TransactionCanceledException`
  - HTTP status: `400`
  - used when any action of a transactional write could not be applied. It carries
    `CancellationReasons`, one per action and in request order, and lists the codes in its message
    the way real DynamoDB does.
- `SimDynamoDbIdempotentParameterMismatchException`
  - name: `IdempotentParameterMismatchException`
  - HTTP status: `400`
  - used when a `ClientRequestToken` is replayed inside its window with a different request
- `SimDynamoDbUnsupportedOperation`
  - name: `UnsupportedOperation`
  - HTTP status: `400`
  - used for request input real DynamoDB accepts and this simulation does not model. Real DynamoDB
    has no error of this name, so it stays distinct from `ValidationException`: a refusal here says
    the simulation stops short, not that the request was wrong.

Item key failures still throw `TypeError`. Table creation no longer does: every input it refuses
comes back as an AWS-like exception.

## Background scheduling

DynamoDB uses the shared background task infrastructure to emulate asynchronous AWS behavior.

Current uses:

- `SimDynamoDb.createTable()` calls `background.sequence()` before creation to allow realistic
  non-deterministic async sequencing.
- table activation is scheduled after table creation.
- `SimDynamoDb` sequences background tasks before every table command, so a command reads table
  state at a realistic point rather than always the earliest one.
- DeleteTable schedules the removal of the table from the store, which is what takes a table from
  DELETING to gone.
- `SimDynamoDbTable.putItem()` writes the item at once. A write a caller has been told about is a
  write that is there, so nothing about it waits on the scheduler.
- `SimDynamoDbTransactionTokens` reads the scheduler's clock, which is what makes the ten minute
  `ClientRequestToken` window something `simAws.clock().advanceBy(...)` can move past.
- UpdateTimeToLive schedules the settle that takes the status from ENABLING to ENABLED, or from
  DISABLING to DISABLED, the same way table activation is scheduled.
- `SimDynamoDbTableExpiry` uses `scheduleAt` rather than `schedule`, so an item's removal is due at
  a simulated instant rather than on the next drain. Only moving the clock through `simAws.clock()`
  dispatches it, which is why `backgroundTasksComplete()` does not expire anything.

## The document client

`document/` handles `@aws-sdk/lib-dynamodb` Commands, which carry native JavaScript values rather
than AttributeValues.

The real document client converts in middleware added to the underlying Command's stack, and that
middleware is reached through `resolveMiddleware`, which `installSendPatch` replaces. So an
intercepted send never runs it and the conversion happens at the interception boundary instead.

- `sim-dynamodb-document-marshall.ts` reads a native value as an AttributeValue, and
  `-unmarshall.ts` reads one back. The rules and their order are `convertToAttr` and
  `convertToNative` from `util-dynamodb`, restated here rather than imported: no implementation file
  imports the AWS SDK, and `lib-dynamodb` is a devDependency. `-number.ts`, `-set.ts` and
  `-binary.ts` hold the parts with rules of their own.
- The option defaults `lib-dynamodb` sets, `convertTopLevelContainer` and
  `convertWithoutMapWrapper`, amount to converting one value at a time with no top-level unwrapping,
  which is what these functions do. The `util-dynamodb` defaults would drop the `M` wrapper off a
  nested object, which is not an attribute value at all.
- `sim-dynamodb-document-path.ts` says where in a Command the native values sit, since a Command
  carries ordinary request values everywhere else. `-command-paths.ts` states them per Command,
  mirroring the key nodes the real client declares on its own Commands, which are `protected` and so
  not read from it.
- `sim-dynamodb-document-route.ts` converts, sends to the ordinary facade method, and converts back.
  `-routes.ts` builds one per Command for the SDK router to merge in.

A document Command is named differently to the Command it stands for, so `PutCommand` and
`PutItemCommand` route separately. One with no route, such as `TransactWriteCommand`, is refused by
name before anything tries to convert its values.

Which object a user intercepts is settled: the document client itself.
`DynamoDBDocumentClient.from(client)` builds a separate object that extends the same `Client` base as
`DynamoDBClient` rather than extending `DynamoDBClient`, so patching the base client's send does not
reach it. It does share the base client's `config`, so `serviceId` and `region` resolve the same way
for both.

## Time to live

Time to live lives under `time-to-live/`, away from the commands that switch it on, because it is
table state rather than request handling.

- `SimDynamoDbTimeToLive` is one table's setting: the status, the attribute name, and when it was
  last updated. It owns the two rules an update has to pass: that it changes the state, and that it
  is at least an hour after the last one. Both are measured on the simulated clock.
- `SimDynamoDbTimeToLiveSpecification` is a checked `TimeToLiveSpecification`. Real DynamoDB
  requires both fields even when switching time to live off, so both are required here.
- `simDynamoDbItemDeletionInstant` works out when an item should be deleted, which is 48 hours after
  its TTL timestamp rather than on it. That window is the deliberate divergence: AWS promises a
  range and this picks the far end. The reasoning is in the constant's comment. It also applies the
  five year eligibility rule, which is why it takes the instant to read the timestamp against.
- `SimDynamoDbTableExpiry` schedules the removal and re-checks at fire time, the same shape as
  `SimSecretsManagerSecretExpiry`. The re-check recomputes the deletion instant from whatever is
  under the key now, so one check covers a deleted item, an overwrite with a later TTL, a TTL
  attribute that has gone or changed type, and time to live having been switched off.

`SimDynamoDbTable.putItem()` is the single hook. Every write in the service goes through it,
including batch and transactional ones, so nothing needs a scheduling call of its own.

Tests that need eventual state should call the broader sim AWS background-drain helper, for example:

```typescript
await simAws.backgroundTasksComplete();
```

## Tests as implementation guides

The colocated `*.iso.test.ts` files are useful references when changing DynamoDB internals. They
show the expected simulator behavior for table creation, table listing, table description, item
writes, attribute conversion, and key-schema validation.

The `.iso.test.ts` suffix is for isolated tests which do no real networking. They may use real AWS
SDK command classes to confirm that the simulator's structural command interfaces are compatible
with SDK types, but the simulator implementation itself should remain independent of the AWS SDK
packages.
