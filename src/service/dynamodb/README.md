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
- `batch/` (BatchWriteItem and BatchGetItem)

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
- billing mode, provisioned throughput, table class and deletion protection
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
- `SimDynamoDbAttributeDefinitions` for attribute types, duplicates, and matching the key schema in
  both directions
- `SimDynamoDbTableBilling` for the billing mode and the throughput that goes with it

## Key schema handling

`SimDynamoDbKeySchema` holds the table primary key.

Supported key schema behavior:

- a `HASH` element is required, and comes first
- a `RANGE` element is optional, and comes second
- key attributes are `S`, `N` or `B`, and must have a matching attribute definition
- item partition and sort key values must be strings or numbers
- item keys are serialized as JSON and used as the internal item map key

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
4. The key schema, attribute definitions, billing and table class are read and checked.
5. Only then is the name checked against the table map and taken.

`SimDynamoDb.createTable()` awaits `background.sequence()` and then calls `handle()`, which is
synchronous. Nothing is awaited between finding a name free and taking it, so two creates racing for
the same name cannot both get it. The second gets `SimDynamoDbResourceInUseException`.

The returned `TableDescription` reports the table back: `TableName`, `TableArn`, `TableId`,
`KeySchema`, `AttributeDefinitions`, `TableStatus`, `CreationDateTime`, `ProvisionedThroughput`,
`DeletionProtectionEnabled`, and `BillingModeSummary` or `TableClassSummary` when the request named
a billing mode or a table class. `ItemCount` and `TableSizeBytes` stay at 0.

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

Scans, queries, indexes and streams are not implemented. Billing mode and provisioned capacity are
read and stored by CreateTable, but nothing enforces them: no write is ever throttled.

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

The comparison rules live in `item/sim-dynamodb-value-comparison.ts` rather than inside the
evaluator, because sort key conditions and filter expressions compare the same way when `Query` and
`Scan` arrive. Strings compare by UTF-8 bytes rather than by UTF-16 code units, numbers compare
through `SimDynamoDbNumber.compareTo` so digits past what a JavaScript number holds still order
correctly, and binary compares as unsigned bytes. Two values of different types have no order at all,
which is what makes a comparison between them false rather than an error.

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
