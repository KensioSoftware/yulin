# Simulated DynamoDB

Yulin includes a simulated DynamoDB for tests and local development. Tables are held in memory, and
every operation is authorized by simulated IAM.

This page covers creating, describing, listing and deleting tables. What a request says is checked
the way real DynamoDB checks it, so a table that can be created here is one that could be created on
AWS.

DynamoDB-specific types are imported from the `@kensio/yulin/dynamodb` subpath.

## Creating a table

`CreateTable` needs a `TableName`, a `KeySchema`, and an `AttributeDefinitions` entry for every
attribute the key schema names.

```typescript sim-dynamodb-create-table
/**
 * Creating a simulated on-demand table.
 */

import { CreateTableCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

const creation = await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "FoobarTable",
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);

console.log(creation.TableDescription?.TableStatus); // "CREATING"
console.log(creation.TableDescription?.KeySchema?.[0]?.AttributeName); // "id"

// The table becomes ACTIVE once the scheduled background work has run.
await simAws.backgroundTasksComplete();
```

A new table is `CREATING`, and activation is scheduled as background work. Call
`simAws.backgroundTasksComplete()` when a test needs the table to be `ACTIVE`.

The description carries back what the request asked for: the key schema, the attribute definitions,
the table ARN, a table ID, and the billing and capacity the table was created with.

## Key schema and attribute definitions

The key schema holds one `HASH` element, optionally followed by one `RANGE` element, in that order.
`[{ RANGE }, { HASH }]` is refused here as it is on AWS.

`AttributeDefinitions` and the key attributes have to name exactly the same attributes. An attribute
defined that no key uses is a `ValidationException`, and so is a key attribute with no definition.
DynamoDB is only schemaless about the attributes that are not keys.

A key attribute is one of `S`, `N` or `B`, and an item written to the table has to carry every key
attribute as the type the table declared for it.

## Billing modes and throughput

`BillingMode` defaults to `PROVISIONED`, which makes `ProvisionedThroughput` required with at least
one read and one write capacity unit. A request that leaves both out asks for a provisioned table
with nothing provisioned, and is refused.

`PAY_PER_REQUEST` refuses `ProvisionedThroughput`, since an on-demand table has no capacity to
provision.

```typescript sim-dynamodb-provisioned-table
/**
 * Creating a simulated provisioned table with a sort key.
 */

import { CreateTableCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const creation = await simAws.dynamoDb().createTable(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [
      { AttributeName: "customerId", KeyType: "HASH" },
      { AttributeName: "orderedAt", KeyType: "RANGE" },
    ],
    AttributeDefinitions: [
      { AttributeName: "customerId", AttributeType: "S" },
      { AttributeName: "orderedAt", AttributeType: "N" },
    ],
    BillingMode: "PROVISIONED",
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 3 },
  }),
);

const throughput = creation.TableDescription?.ProvisionedThroughput;
console.log(throughput?.ReadCapacityUnits); // 5
console.log(throughput?.WriteCapacityUnits); // 3

await simAws.backgroundTasksComplete();
```

An on-demand table reports `ReadCapacityUnits` and `WriteCapacityUnits` of 0, which is what real
DynamoDB reports for one.

`TableClass` is stored and reported, and changes nothing else: nothing bills a table here.
`DeletionProtectionEnabled` does change what the table does, and is covered under deleting a table.

## Describing a table

`DescribeTable` answers with the same description `CreateTable` did, read off the table itself. A
test can check a table came out the way the request or the CloudFormation template meant it to.

The `TableName` parameter takes the table's name or its ARN.

## Listing tables

`ListTables` returns table names in DynamoDB's order, which is by UTF-8 bytes. `Limit` takes a whole
number from 1 to 100 and defaults to 100.

`LastEvaluatedTableName` is the name to resume from, and it is absent on the last page. That is what
lets a caller loop until it is gone rather than until a page comes back empty.

```typescript sim-dynamodb-list-tables
/**
 * Paging through every simulated table, a page at a time.
 */

import {
  CreateTableCommand,
  ListTablesCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

for (const tableName of ["TableC", "TableA", "TableB"]) {
  await dynamoDb.createTable(
    new CreateTableCommand({
      TableName: tableName,
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
}

const names: string[] = [];
let startAfter: string | undefined;

do {
  const page = await dynamoDb.listTables(
    new ListTablesCommand({ Limit: 2, ExclusiveStartTableName: startAfter }),
  );
  names.push(...(page.TableNames ?? []));
  startAfter = page.LastEvaluatedTableName;
} while (startAfter !== undefined);

console.log(names); // ["TableA", "TableB", "TableC"]

await simAws.backgroundTasksComplete();
```

A token naming a table that has since been deleted still works: a page resumes at the first name
after the token rather than at a remembered position.

## Deleting a table

`DeleteTable` puts the table into `DELETING` and answers with its description. The table is still
there to describe until the scheduled background work has run, at which point it and its items are
gone.

Real DynamoDB only deletes a table that is `ACTIVE`. One that is still `CREATING` or `UPDATING`
answers `ResourceInUseException`, and one that has gone answers `ResourceNotFoundException`.
Deleting a table that is already deleting is not an error.

A table created with `DeletionProtectionEnabled` refuses to be deleted at all, and stays as it was.

```typescript sim-dynamodb-deletion-protection
/**
 * A simulated table that is protected from deletion.
 */

import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "ProtectedTable",
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
    DeletionProtectionEnabled: true,
  }),
);
await simAws.backgroundTasksComplete();

try {
  await dynamoDb.deleteTable(
    new DeleteTableCommand({ TableName: "ProtectedTable" }),
  );
} catch (error) {
  if ((error as Error).name !== "ValidationException") {
    throw error;
  }
  console.log("the table is protected from deletion");
}

const description = await dynamoDb.describeTable(
  new DescribeTableCommand({ TableName: "ProtectedTable" }),
);

console.log(description.Table?.TableStatus); // "ACTIVE"
```

`DeleteTable` takes the table's name or its ARN, as `DescribeTable` does.

## Writing items

`PutItem` writes one item, replacing the whole item under its primary key rather than merging into
it. The item is there by the time the call returns, so a write and the read that follows it need
nothing in between.

```typescript sim-dynamodb-put-item
/**
 * Writing an item, and reading back the item it replaced.
 */

import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

const written = await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "OrdersTable",
    Item: { orderId: { S: "order-1" }, total: { N: "19.99" } },
  }),
);

console.log(written.Attributes); // undefined

const replaced = await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "OrdersTable",
    Item: { orderId: { S: "order-1" }, total: { N: "24.99" } },
    ReturnValues: "ALL_OLD",
  }),
);

console.log(replaced.Attributes?.["total"]?.N); // "19.99"
```

A write with no `ReturnValues` answers with no `Attributes`, as real DynamoDB does. `ALL_OLD` gives
back the item that was replaced, or nothing when the key was free. Those are the only two modes
PutItem has.

An item has to carry its whole primary key, each key attribute has to be the type the table
declared, and a key attribute cannot be empty. An empty string or empty binary value is fine
anywhere else in the item.

## Reading and deleting items

`GetItem` reads one item by its primary key, and `DeleteItem` removes one the same way. The `Key`
both take is the whole primary key and nothing else. A missing key element, an attribute that is not
part of the key, or a value whose type does not match the table's `AttributeDefinitions` is a
`ValidationException` naming the attribute at fault.

```typescript sim-dynamodb-get-delete-item
/**
 * Writing an item, reading it back, and deleting it.
 */

import {
  CreateTableCommand,
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "OrdersTable",
    Item: { orderId: { S: "order-1" }, total: { N: "19.99" } },
  }),
);

const found = await dynamoDb.getItem(
  new GetItemCommand({
    TableName: "OrdersTable",
    Key: { orderId: { S: "order-1" } },
  }),
);

console.log(found.Item?.["total"]?.N); // "19.99"

const removed = await dynamoDb.deleteItem(
  new DeleteItemCommand({
    TableName: "OrdersTable",
    Key: { orderId: { S: "order-1" } },
    ReturnValues: "ALL_OLD",
  }),
);

console.log(removed.Attributes?.["total"]?.N); // "19.99"

const missing = await dynamoDb.getItem(
  new GetItemCommand({
    TableName: "OrdersTable",
    Key: { orderId: { S: "order-1" } },
  }),
);

console.log(missing.Item); // undefined
```

A key that holds nothing comes back with no `Item` at all, rather than an empty one. That absence is
how a caller tells a miss from an item carrying nothing but its key.

`ConsistentRead` is accepted whichever way it is set, and changes nothing. Every write has landed by
the time the call that made it returns, so an eventually consistent read still answers with the
latest write.

`DeleteItem` names a key rather than an item, so deleting a key that is already free succeeds and
reports nothing removed. Its `ReturnValues` takes `NONE` and `ALL_OLD`, as `PutItem` does, and
`ALL_OLD` answers with the item that was removed.

Both take the table's name or its ARN, as the table commands do.

## Updating items

`UpdateItem` changes part of an item, where `PutItem` replaces the whole thing. What to change is
written as an `UpdateExpression` made of a `SET` clause, a `REMOVE` clause, or both in either order.
Each keyword appears at most once, and the actions inside a clause are separated by commas.

A `SET` action is `path = operand`, where an operand is a value from `ExpressionAttributeValues`,
another document path, or `if_not_exists(path, operand)`. An update expression carries no literals,
so every constant arrives through `ExpressionAttributeValues`. A `REMOVE` action is a document path
on its own, and removing an attribute that is not there succeeds without changing the item.

Every action reads the item as it stood before the request, rather than the item being built. So
this expression, against `{ a: 1, b: 2, c: 3 }`:

```text
REMOVE a SET b = a, c = b
```

leaves `{ b: 1, c: 2 }`. Both assignments read the values from before the update, and `a` is still
there to be read even though the `REMOVE` is written first.

```typescript sim-dynamodb-update-item
/**
 * Changing part of an item, against the item as it stood before the update.
 */

import {
  CreateTableCommand,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "FoobarTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "FoobarTable",
    Item: {
      orderId: { S: "order-1" },
      a: { N: "1" },
      b: { N: "2" },
      c: { N: "3" },
      draft: { BOOL: true },
    },
  }),
);

// Both assignments read the values from before the update, so removing `a`
// first does not take it away from the assignment reading it.
const updated = await dynamoDb.updateItem(
  new UpdateItemCommand({
    TableName: "FoobarTable",
    Key: { orderId: { S: "order-1" } },
    UpdateExpression: "REMOVE a, draft SET b = a, c = b",
    ReturnValues: "ALL_NEW",
  }),
);

console.log(updated.Attributes?.["b"]?.N); // "1"
console.log(updated.Attributes?.["c"]?.N); // "2"
console.log(updated.Attributes?.["a"]); // undefined

// if_not_exists keeps a value that is already there, and assigns one when it
// is not.
const defaulted = await dynamoDb.updateItem(
  new UpdateItemCommand({
    TableName: "FoobarTable",
    Key: { orderId: { S: "order-1" } },
    UpdateExpression: "SET #s = if_not_exists(#s, :packing)",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":packing": { S: "packing" } },
    ReturnValues: "ALL_NEW",
  }),
);

console.log(defaulted.Attributes?.["status"]?.S); // "packing"

// UpdateItem upserts, so a key holding nothing gets an item built from the Key
// and the SET actions.
await dynamoDb.updateItem(
  new UpdateItemCommand({
    TableName: "FoobarTable",
    Key: { orderId: { S: "order-2" } },
    UpdateExpression: "SET #s = :new",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":new": { S: "new" } },
  }),
);
```

An assignment reading a document path the item does not have is a `ValidationException` rather than
an assignment of nothing, as it is on AWS. `if_not_exists` is how an expression says what to assign
when the attribute may be absent.

Assigning into a map the item does not carry is a `ValidationException` too. `SET address.city = :c`
needs an `address` map to write into, and an update does not make one on the way past.

An update cannot move an item's primary key. Assigning to a key attribute, or removing one, is a
`ValidationException` naming the attribute, since the request already names the item it works on
through its `Key`.

A request with no `UpdateExpression` at all still writes. It leaves a stored item as it was, and
creates one holding nothing but the `Key` when the key held nothing.

`ReturnValues` takes `NONE`, `ALL_OLD` and `ALL_NEW`. `ALL_OLD` answers with the item as it stood
before the update, and carries nothing when the key held nothing. `ALL_NEW` answers with the item as
it now is.

`UpdateItem` takes a `ConditionExpression` as well, checked the same way as on the other writes.
Both expressions draw on the same `ExpressionAttributeNames` and `ExpressionAttributeValues`, and a
placeholder used by either counts as used.

## Conditional writes

`PutItem`, `DeleteItem` and `UpdateItem` take a `ConditionExpression`, which is checked against
whatever is stored under the key before anything changes. A condition that does not hold leaves the item exactly as it
was and throws `ConditionalCheckFailedException`, with the name and message real DynamoDB uses.

That is how a write becomes an insert if absent, and how a version attribute becomes optimistic
locking.

```typescript sim-dynamodb-conditional-write
/**
 * Inserting only if absent, and writing only against the version last read.
 */

import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "FoobarTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

const order = {
  TableName: "FoobarTable",
  Item: { orderId: { S: "order-1" }, version: { N: "1" } },
  ConditionExpression: "attribute_not_exists(orderId)",
};

// The key is free, so the insert goes through.
await dynamoDb.putItem(new PutItemCommand(order));

// The key is taken now, so the same insert is turned away.
try {
  await dynamoDb.putItem(new PutItemCommand(order));
} catch (error) {
  console.log((error as Error).name); // "ConditionalCheckFailedException"
}

// Optimistic locking: write only if the version is still the one last read.
await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "FoobarTable",
    Item: { orderId: { S: "order-1" }, version: { N: "2" } },
    ConditionExpression: "version = :was",
    ExpressionAttributeValues: { ":was": { N: "1" } },
  }),
);

// A second writer holding the same stale version now loses the race.
try {
  await dynamoDb.putItem(
    new PutItemCommand({
      TableName: "FoobarTable",
      Item: { orderId: { S: "order-1" }, version: { N: "2" } },
      ConditionExpression: "version = :was",
      ExpressionAttributeValues: { ":was": { N: "1" } },
      ReturnValuesOnConditionCheckFailure: "ALL_OLD",
    }),
  );
} catch (error) {
  // ALL_OLD puts the item it lost to on the exception, so a retry needs no
  // second read.
  console.log((error as { Item?: Record<string, { N?: string }> }).Item);
  // { orderId: { S: "order-1" }, version: { N: "2" } }
}
```

`ReturnValuesOnConditionCheckFailure` takes `NONE` and `ALL_OLD`. `ALL_OLD` puts the stored item on
the exception as `Item`, and there is no `Item` when the key held nothing.

The expression is read before the table is reached, so an expression DynamoDB would refuse is
refused whether or not the key holds anything.

### What a condition can say

The comparators are `=`, `<>`, `<`, `<=`, `>` and `>=`. `BETWEEN` takes two bounds and counts both as
inside. `IN` takes up to 100 operands. `AND`, `OR`, `NOT` and brackets combine them, with `NOT`
binding tighter than `AND` and `AND` tighter than `OR`. Keywords are read in any case, so `and`
works as well as `AND`.

The functions are `attribute_exists`, `attribute_not_exists`, `attribute_type`, `begins_with`,
`contains` and `size`. Function names are read in lower case only, as they are on real AWS.
`attribute_exists` is true for an attribute stored as `NULL`, since `NULL` is a value rather than an
absent one. The first operand of every one of them names a path in the item, so a supplied value
there is refused rather than compared. `size` is a number rather than a condition, so it goes beside a comparator: a string and
binary measure in bytes, and a set, a list or a map in how many things it holds.

Strings compare by UTF-8 byte order, numbers compare by their digits rather than by what they round
to, and binary compares as unsigned bytes.

A comparison between two different types is never an error. Equality works across types, so a string
and a number are not equal: `=` is false and `<>` is true. Ordering does not, so `<`, `<=`, `>` and
`>=` are all false between them, as they are for a path the item does not have. That is what real
DynamoDB does, and it is what lets one condition guard items that do not all carry the same
attributes.

`ExpressionAttributeNames` and `ExpressionAttributeValues` have to agree exactly with the expression,
in both directions: a placeholder the request does not define is a `ValidationException`, and so is
an entry no expression uses.

## Projecting attributes

`GetItem` takes a `ProjectionExpression`, which is a comma-separated list of document paths. Only
those paths come back. A path is an attribute name, then any number of `.attribute` dereferences and
`[n]` list indexes: `address.city`, `lines[0].sku`.

An attribute name that is a DynamoDB reserved word, or that has a character an expression cannot
carry, is written as a `#name` placeholder and defined in `ExpressionAttributeNames`.

```typescript sim-dynamodb-projection-expression
/**
 * Reading part of an item with a projection expression.
 */

import {
  CreateTableCommand,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "FoobarTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "FoobarTable",
    Item: {
      orderId: { S: "order-1" },
      status: { S: "shipped" },
      address: { M: { city: { S: "Leeds" }, postcode: { S: "LS1 1AA" } } },
      lines: { L: [{ S: "widget" }, { S: "gasket" }] },
    },
  }),
);

const output = await dynamoDb.getItem(
  new GetItemCommand({
    TableName: "FoobarTable",
    Key: { orderId: { S: "order-1" } },
    ProjectionExpression: "#s, address.city, lines[0]",
    ExpressionAttributeNames: { "#s": "status" },
  }),
);

console.log(Object.keys(output.Item ?? {}));
// [ "status", "address", "lines" ]

// The nested shape is kept: the address holds only the projected attribute.
console.log(output.Item?.["address"]?.M);
// { city: { S: "Leeds" } }

// A projected list element comes back as a one element list.
console.log(output.Item?.["lines"]?.L?.length);
// 1
```

A projected path the item does not have is left out. It is not an error, and it does not come back
as a `NULL`, so an item with none of the projected paths answers with an `Item` holding nothing.

The placeholders and the expression have to agree exactly, in both directions. A `#name` the request
does not define is a `ValidationException`, and so is an `ExpressionAttributeNames` entry no
expression uses. The second is what a request hits after an expression is edited and the old
placeholder is left behind.

Two paths where one contains the other, such as `address, address.city`, are a `ValidationException`,
as they are on real AWS: the pair does not say whether the whole map or one attribute of it was
wanted. Naming one path twice counts the same way.

A document path goes at most 32 levels deep, which is as far as an item nests. A negative index, a
fractional index and a path past that depth are each a `ValidationException` naming the path.

## Numbers

A DynamoDB number carries up to 38 significant digits, where a JavaScript number carries about 15.
Numbers are held here as the digits they were written with, so an identifier, a monetary amount or a
large counter comes back exactly as it went in.

```typescript sim-dynamodb-number-precision
/**
 * A number too large for a JavaScript number, kept whole.
 */

import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "CountersTable",
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "CountersTable",
    Item: { id: { S: "counter" }, count: { N: "9007199254740993" } },
  }),
);

const replaced = await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "CountersTable",
    Item: { id: { S: "counter" }, count: { N: "9007199254740994" } },
    ReturnValues: "ALL_OLD",
  }),
);

// A JavaScript number would have rounded this to 9007199254740992.
console.log(replaced.Attributes?.["count"]?.N); // "9007199254740993"
```

The digits are normalised the way DynamoDB normalises them: leading and trailing zeros are trimmed,
and an exponent is worked back into plain notation, so `1E5` and `100000.00` are the same number.
That is what makes `{ N: "1" }` and `{ N: "1.0" }` the same key.

A number with more than 38 significant digits, or outside the range `1E-130` to
`9.9999999999999999999999999999999999999E+125` and its negative mirror, is a `ValidationException`.

## Sets, lists and maps

A set holds one kind of value, holds at least one, and holds each value once. Binary members compare
by their bytes rather than by object identity, so two `Uint8Array` values holding the same bytes are
one member and are refused as a duplicate.

Lists and maps nest up to 32 levels, and one item is at most 400 KB counting its attribute names as
well as its values. Both are `ValidationException` when exceeded.

## Table names and ARNs

A table name is 3 to 255 characters of letters, numbers, underscores, hyphens and periods. The name
is unique within an Account and Region, and the table ARN is built from that scope.

```typescript sim-dynamodb-scoping
/**
 * The same table name in two Accounts, or two Regions, is two tables.
 */

import { CreateTableCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const tableInput = {
  TableName: "FoobarTable",
  KeySchema: [{ AttributeName: "id", KeyType: "HASH" as const }],
  AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" as const }],
  BillingMode: "PAY_PER_REQUEST" as const,
};

// Two Accounts, one Region.
const firstAccount = await simAws
  .account("111111111111")
  .region("eu-west-2")
  .dynamoDb()
  .createTable(new CreateTableCommand(tableInput));

const secondAccount = await simAws
  .account("222222222222")
  .region("eu-west-2")
  .dynamoDb()
  .createTable(new CreateTableCommand(tableInput));

console.log(firstAccount.TableDescription?.TableArn);
// "arn:aws:dynamodb:eu-west-2:111111111111:table/FoobarTable"
console.log(secondAccount.TableDescription?.TableArn);
// "arn:aws:dynamodb:eu-west-2:222222222222:table/FoobarTable"

// One Account, two Regions.
const otherRegion = await simAws
  .account("111111111111")
  .region("us-east-1")
  .dynamoDb()
  .createTable(new CreateTableCommand(tableInput));

console.log(otherRegion.TableDescription?.TableArn);
// "arn:aws:dynamodb:us-east-1:111111111111:table/FoobarTable"

await simAws.backgroundTasksComplete();
```

Creating a name that is already taken in the same scope fails with `ResourceInUseException`.

## Deploying a table from CloudFormation

Simulated CloudFormation creates a table from an `AWS::DynamoDB::Table` resource, in the stack's
account and region. The table is created through `CreateTable`, so a template-created table is the
same thing an SDK caller would get: the same name validation, the same key schema and attribute
definition rules, the same ARN.

`Ref` on the resource gives the table name, as it does on real AWS, so it can be handed straight to
`PutItem`. `Fn::GetAtt … Arn` gives the table ARN, which is what an IAM policy names it by.

```typescript sim-dynamodb-cloudformation-table
/**
 * Deploying a table from a CloudFormation template and writing to it.
 */

import { PutItemCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrdersTable: {
        Type: "AWS::DynamoDB::Table",
        Properties: {
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
          BillingMode: "PAY_PER_REQUEST",
        },
      },
    },
    Outputs: {
      OrdersTableName: { Value: { Ref: "OrdersTable" } },
      OrdersTableArn: { Value: { "Fn::GetAtt": ["OrdersTable", "Arn"] } },
    },
  },
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();

// Ref resolves to the table name, so it works as a PutItem TableName.
const tableName = stack.outputs.get("OrdersTableName")?.value as string;

console.log(tableName);
// "orders-stack-OrdersTable"

await simAws
  .dynamoDb()
  .putItem(
    new PutItemCommand({ TableName: tableName, Item: { id: { S: "1" } } }),
  );

console.log(stack.outputs.get("OrdersTableArn")?.value);
// "arn:aws:dynamodb:us-east-1:888888888888:table/orders-stack-OrdersTable"
```

The properties that are read are `TableName`, `KeySchema`, `AttributeDefinitions`, `BillingMode`,
`ProvisionedThroughput`, `TableClass` and `DeletionProtectionEnabled`. Each one is passed to
`CreateTable` rather than applied here, so a value the template gets wrong fails the same way it
would for an SDK caller.

A table with no `TableName` is named after the stack and its logical ID, so the table above with its
name left out would be `orders-stack-OrdersTable`. Real CloudFormation adds random characters to
that, which a template cannot predict either way. Two stacks deploying the same template get two
differently named tables. The generated name is trimmed to the 255 characters a table name allows,
ending in a hash of the untrimmed name so two long names that start the same stay apart.

`Fn::GetAtt … StreamArn` is refused by name. Streams are not simulated, and an invented stream ARN
would read as a working stream to whatever the template handed it to.

A property with behaviour that is not simulated skips the resource, with a reason naming the
property, and the rest of the stack still deploys: `GlobalSecondaryIndexes`, `LocalSecondaryIndexes`,
`TimeToLiveSpecification`, `Tags`, `StreamSpecification`, `KinesisStreamSpecification`,
`SSESpecification`, `PointInTimeRecoverySpecification`, `ContributorInsightsSpecification`,
`ImportSourceSpecification`, `ResourcePolicy`, `OnDemandThroughput` and `WarmThroughput`. A property
`AWS::DynamoDB::Table` does not have fails the resource instead, since that is a template real
CloudFormation would refuse too.

`AWS::DynamoDB::GlobalTable` is skipped rather than deployed, since replication across regions is
not simulated.

CDK works without hand-editing. A `dynamodb.Table` synthesises a template that deploys here, with
the table name reaching a function through its environment and a grant policy naming the table by
the ARN `Fn::GetAtt` gives.

## IAM authorization

`CreateTable` authorizes `dynamodb:CreateTable` against the ARN the table is about to have, before
it looks the name up. A caller with no permission is denied whether or not the name is free, so an
unauthorized caller cannot find out which names are taken.

`DescribeTable`, `PutItem`, `GetItem`, `DeleteItem` and `UpdateItem` authorize against the table ARN
in the same way, each against the `dynamodb:` action of its own name. `ListTables` names no table, so it
authorizes against `*`.

## Available functionality

- `CreateTable`, with table name, key schema, attribute definition, billing mode and throughput
  validation.
- `DescribeTable`, answering with the full table description, by table name or ARN.
- `ListTables`, ordered by UTF-8 bytes and paged with `Limit` and `ExclusiveStartTableName`.
- `DeleteTable`, following the table status DynamoDB moves a deleted table through, and refusing a
  table that is protected from deletion.
- `PutItem`, with the attribute value model behind it: numbers keep their digits, sets compare by
  value, and key attributes are checked against what the table declared. It takes a table name or
  ARN and authorizes before the lookup.
- `GetItem`, answering with the item under a primary key, and with no `Item` at all when the key
  holds nothing.
- `ProjectionExpression` on `GetItem`, with document paths, list indexing and `ExpressionAttributeNames`
  placeholders.
- `DeleteItem`, removing the item under a primary key and answering with it for `ALL_OLD`.
- `UpdateItem`, with `SET` and `REMOVE` update expressions, `if_not_exists`, upserting when the key
  holds nothing, and `NONE`, `ALL_OLD` and `ALL_NEW` for `ReturnValues`. Every action reads the item
  as it stood before the update.
- `ConditionExpression` on `PutItem`, `DeleteItem` and `UpdateItem`, with the six comparators, `BETWEEN`, `IN`,
  `AND`, `OR`, `NOT`, brackets, and the `attribute_exists`, `attribute_not_exists`, `attribute_type`,
  `begins_with`, `contains` and `size` functions.
- `AWS::DynamoDB::Table` in CloudFormation, created through `CreateTable`, with `Ref` giving the
  table name and `Fn::GetAtt … Arn` the table ARN.
- SDK interception, so an intercepted `DynamoDBClient` reaches the simulation.

## Limitations

- Global and local secondary indexes are not simulated. `GlobalSecondaryIndexes` and
  `LocalSecondaryIndexes` are refused rather than dropped, since a table missing an index it was
  asked for would answer queries differently to the real one. An empty list asks for no index, so it
  is accepted.
- Table tags are not simulated. A non-empty `Tags` list is refused rather than dropped, and there is
  no `TagResource`, `UntagResource` or `ListTagsOfResource`.
- Time to live is not simulated. There is no `UpdateTimeToLive` or `DescribeTimeToLive`, and no item
  expires.
- DynamoDB streams are not simulated. A `StreamSpecification` with `StreamEnabled` set is refused,
  so a table whose changes nothing is publishing cannot be created by accident. One that switches
  streams off describes the table this simulation already makes, so it is accepted.
- Encryption at rest is not simulated. An `SSESpecification` with `Enabled` set is refused rather
  than reported back against items held in the clear. `Enabled: false` asks for the AWS owned key
  real DynamoDB uses by default, so it is accepted.
- Table resource policies are not simulated. `ResourcePolicy` is refused, since a table left open to
  callers the policy would have kept out is the wrong way to fail.
- `OnDemandThroughput` and `WarmThroughput` are refused. Nothing here applies a request-unit maximum
  or pre-warms capacity.
- `BillingModeSummary` and `TableClassSummary` are reported only when the request named a
  `BillingMode` or a `TableClass`. Real DynamoDB reports the effective values whichever way the table
  was created.
- `ItemCount` and `TableSizeBytes` are always 0. Real DynamoDB updates both about every six hours, so
  they lag behind the items there too.
- Deletion happens as soon as the background work runs, where real DynamoDB may take a while over a
  large table. Nothing waits for a `DELETING` table to go, so a test that needs it gone calls
  `simAws.backgroundTasksComplete()`.
- A table ARN naming another Account or Region is refused rather than resolved to the local table of
  that name. Cross-account table access needs a resource policy, which is not simulated.
- `UpdateTable` is not implemented, so a table never reaches `UPDATING` on its own. `DeleteTable`
  refuses that status anyway, for when it can.
- Nothing enforces capacity. A provisioned table's throughput is stored and reported, and no request
  is ever throttled with `ProvisionedThroughputExceededException`.
- `UpdateTable`, `Query`, `Scan` and the batch item commands are not implemented yet.
- A CloudFormation stack reaches `CREATE_COMPLETE` while the table it created is still `CREATING`.
  Real CloudFormation waits for the table to be `ACTIVE`, so a test reading the status after the
  stack deployed calls `simAws.backgroundTasksComplete()` first.
- CloudFormation stack updates and deletes are not simulated, so neither is table replacement or the
  `DeletionPolicy` a template sets on a table.
- `ProjectionExpression` is simulated on `GetItem` only. `BatchGetItem`, `Query` and `Scan` are not
  implemented yet, so they have nothing to project from.
- The legacy `AttributesToGet` is refused rather than ignored, since an item that came back whole
  where part of it was asked for would hide an application reading an attribute it never requested.
  `ProjectionExpression` replaced it, and real DynamoDB has built nothing on it since.
- The 4 KB limit on an expression and the 255 byte limit on a placeholder are not enforced. Nothing
  here is slower for a long expression, so an expression real DynamoDB would refuse for its size is
  evaluated.
- Reads are always strongly consistent. `ConsistentRead` is accepted either way and changes nothing,
  so a test cannot observe a stale read here the way it might against a real table.
- Condition expressions are simulated on `PutItem`, `DeleteItem` and `UpdateItem` only. The
  transactional condition checks and the key condition and filter expressions of `Query` and `Scan`
  are not implemented yet, so there is nothing else to guard.
- The `ADD` and `DELETE` clauses of an update expression are refused rather than applied, and so are
  arithmetic such as `SET n = n + :one`, `list_append`, and list element paths such as
  `SET lines[0] = :line`. An update that quietly left one of them out would leave a test passing
  against an item the real call would have changed.
- `UPDATED_OLD` and `UPDATED_NEW` are refused. Both answer with the attributes the update touched,
  which is a different answer to the whole item rather than a smaller one, and nothing here tracks
  which attributes those were.
- The legacy `AttributeUpdates` is refused rather than ignored, for the same reason `Expected` is.
  `UpdateExpression` replaced it, and real DynamoDB has built nothing on it since.
- A `REMOVE` whose path reaches through an attribute that is missing, or that is not a map, changes
  nothing rather than being refused. `REMOVE` names a place rather than a value, so there was nothing
  there to remove either way.
- The legacy `Expected` and `ConditionalOperator` are refused rather than ignored, since an
  expectation that is never evaluated would let a write or a delete through that DynamoDB would have
  turned away. `ConditionExpression` replaced them, and real DynamoDB has built nothing on them
  since.
- The 4 KB limit on an expression and the 300 operator limit are not enforced. Nothing here is slower
  for a long expression, so an expression real DynamoDB would refuse for its size is evaluated.
- Capacity and item collection reporting are not simulated. `ReturnConsumedCapacity` and
  `ReturnItemCollectionMetrics` are refused unless they name `NONE`.
- A `Key` that does not match the table's key schema is refused with the attribute named. Real
  DynamoDB answers `The provided key element does not match the schema` without saying which
  attribute was at fault.
- A number comes back in plain decimal notation, whatever notation it was written in, so a request
  carrying `1E5` reads back `100000`. The value is the one that was written either way, but the text
  is not always character for character what real DynamoDB would answer with for a number at the
  extremes of its range.
- Item sizes follow the figures AWS documents for its 400 KB limit, which AWS itself describes as
  approximate. An item near the limit here is near the limit there, but the byte counts are not
  identical.
- DynamoDB Streams and PartiQL are not simulated, and are not on the roadmap for this service.
- DynamoDB is not served as an HTTP API by `serveSimAws`.
