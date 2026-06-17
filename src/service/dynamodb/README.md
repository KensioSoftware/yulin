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

- `create-table/`
- `describe-table/`
- `list-tables/`
- `put-item/`

The main `SimDynamoDb` class delegates command execution to handlers rather than keeping command
handling logic inline.

## Table model

Table state lives under `table/`.

`SimDynamoDbTable` represents a simulated table. It tracks:

- table name
- table ARN
- creation time
- current table status
- key schema
- in-memory items

Tables start in `CREATING` status. `CreateTableCommandHandler` schedules a background task that
later activates the table by changing its status to `ACTIVE`.

This means tests may observe `CREATING` immediately after creation, then call
`simAws.backgroundTasksComplete()` when they need all scheduled state transitions to have completed.

## Key schema handling

`DynamoDbKeySchema` extracts the table primary key definition from `CreateTableCommand` input.

Supported key schema behavior:

- a `HASH` key is required
- a `RANGE` key is optional
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

`CreateTableCommandHandler` implements table creation.

Important behavior:

- `TableName` is required.
- `KeySchema` must be present and non-empty.
- duplicate table names throw `SimDynamoDbResourceInUseException`.
- table ARNs are account/region-specific.
- new tables are inserted into the service table map immediately.
- the returned table description reports the table status at creation time, usually `CREATING`.
- activation is scheduled as a background task.

The current returned `TableDescription` is intentionally minimal. It includes fields such as:

- `TableName`
- `TableArn`
- `TableStatus`
- `CreationDateTime`
- empty `AttributeDefinitions`
- empty `KeySchema`
- empty `GlobalSecondaryIndexes`

Not every field from real DynamoDB is populated.

## DescribeTable behavior

`DescribeTableCommandHandler` implements table lookup by name.

Important behavior:

- `TableName` is required.
- the handler waits for background sequencing before reading table state.
- unknown tables throw `SimDynamoDbResourceNotFoundException`.
- the returned description is currently minimal and includes:
  - `TableName`
  - `TableStatus`

This command is useful for observing the asynchronous transition from `CREATING` to `ACTIVE` after
background tasks complete.

## ListTables behavior

`ListTablesCommandHandler` implements deterministic in-memory table listing.

Important behavior:

- the handler waits for background sequencing before listing tables.
- tables are sorted alphabetically by table name.
- `Limit` is supported and defaults to `100`.
- `ExclusiveStartTableName` is supported by starting after the named table.
- `LastEvaluatedTableName` is currently set to the last table name in the returned page.

Because table names are sorted before pagination, tests can safely create tables concurrently and still
assert deterministic list order.

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
expressions, reads, scans, queries, indexes, capacity, billing modes, or streams.

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

Some validation failures still throw plain `Error` or `TypeError`. This is acceptable for current
coverage, but future changes may choose to model more AWS exception types as needed.

## Background scheduling

DynamoDB uses the shared background task infrastructure to emulate asynchronous AWS behavior.

Current uses:

- `CreateTableCommandHandler` calls `background.sequence()` before creation to allow realistic
  non-deterministic async sequencing.
- table activation is scheduled after table creation.
- `DescribeTableCommandHandler` and `ListTablesCommandHandler` sequence background tasks before
  reading table state.
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
