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
- `put-item/`

`table/` is the layout newer commands follow: one directory per group of related commands, with the
structural command types in `table.command.ts`, the value and description shapes they are made of in
`table.types.ts`, and one class per command or closely related group. `put-item/` is one directory
per operation, the older layout, and moves into the grouped layout as the item commands are built
out.

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

`DynamoDbItem` wraps a record of item attributes. It also converts between internal item
representation and DynamoDB `AttributeValue`-style structures.

`DynamoDBItemAttribute` is the internal value wrapper. It supports conversion for these DynamoDB
attribute kinds:

- `S` → `string`
- `N` → `number`
- `B` → `Uint8Array`
- `BOOL` → `boolean`
- `NULL` → `null`
- `SS` → `Set<string>`
- `NS` → `Set<number>`
- `BS` → `Set<Uint8Array>`
- `L` → array of nested internal values
- `M` → object of nested internal values

Numbers are accepted in AWS-style input as strings, then converted to JavaScript numbers internally.
When converted back to `AttributeValue` output, numbers are serialized back to strings.

Unsupported `AttributeValue` shapes throw an error.

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

`SimDynamoDbTableCommands` implements all three. They share how a request names its table:
`readSimDynamoDbTableReference` takes either a table name or a table ARN, as real DynamoDB does, and
refuses an ARN for another Account or Region rather than resolving it to the local table of that
name.

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

`PutItemCommandHandler` implements item writes.

Important behavior:

- `TableName` is required.
- the target table must exist, otherwise `SimDynamoDbResourceNotFoundException` is thrown.
- `Item` is required.
- input `AttributeValue` structures are converted to a `DynamoDbItem`.
- the table key schema is used to compute the item key.
- items with the same computed key overwrite earlier items.
- the actual item map write is scheduled through the table's background scheduler.
- the command output currently returns `Attributes` containing the written item converted back to
  `AttributeValue` form.

The simulator does not currently implement condition expressions, return value modes, update
expressions, reads, scans, queries, indexes, or streams. Billing mode and provisioned capacity are
read and stored by CreateTable, but nothing enforces them: no write is ever throttled.

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
- `SimDynamoDbTable.putItem()` schedules the actual writing of the item.

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
