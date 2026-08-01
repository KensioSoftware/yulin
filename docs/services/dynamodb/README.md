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

## Tagging tables

A table is tagged by `CreateTable`, or afterwards by `TagResource`. `UntagResource` takes tags off,
and `ListTagsOfResource` reads them back. The three tag commands name their resource by ARN, in
`ResourceArn`, where the table commands take a name or an ARN.

```typescript sim-dynamodb-tag-table
/**
 * Tagging a table on creation and afterwards, and reading the tags back.
 */

import {
  CreateTableCommand,
  ListTagsOfResourceCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

const creation = await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
    Tags: [{ Key: "Environment", Value: "test" }],
  }),
);
await simAws.backgroundTasksComplete();

const tableArn = creation.TableDescription?.TableArn ?? "";

await dynamoDb.tagResource(
  new TagResourceCommand({
    ResourceArn: tableArn,
    Tags: [
      { Key: "Owner", Value: "platform" },
      // A key that is already there has its value replaced.
      { Key: "Environment", Value: "staging" },
    ],
  }),
);

await dynamoDb.untagResource(
  new UntagResourceCommand({ ResourceArn: tableArn, TagKeys: ["Owner"] }),
);

const { Tags } = await dynamoDb.listTagsOfResource(
  new ListTagsOfResourceCommand({ ResourceArn: tableArn }),
);

console.log(Tags); // [{ Key: "Environment", Value: "staging" }]
```

`TagResource` and `UntagResource` answer with an empty body, so `ListTagsOfResource` is the only way
to see what either did. Untagging a key that is not there is not an error: the request asks for a
table without that key, and that is what it gets either way.

The rules a tag is held to are DynamoDB's:

- a key is 1 to 128 characters, and a value is 0 to 256, so a key with nothing to say about itself
  is a tag with an empty value
- both are written with letters, whitespace, digits and `+ - = . _ : /`, which is narrower than
  the set some other AWS services take: there is no `@` in it
- a key beginning `aws:` is refused, since that prefix is AWS's to assign
- a resource holds 50 tags

A request that breaks one of those is refused whole, so a call carrying one good tag and one bad one
leaves the table's tags exactly as they were.

`ListTagsOfResource` pages with `NextToken`, and leaves the token off the last page:

```typescript
const tags = [];
let nextToken: string | undefined;

do {
  const page = await dynamoDb.listTagsOfResource(
    new ListTagsOfResourceCommand({
      ResourceArn: tableArn,
      NextToken: nextToken,
    }),
  );

  tags.push(...page.Tags);
  nextToken = page.NextToken;
} while (nextToken !== undefined);
```

A page carries 25 tags. The API has no page size parameter, so that number is this simulator's
rather than DynamoDB's: it is half of the 50 a resource holds, so an ordinarily tagged table lists
in one page and a test that wants to see a `NextToken` can reach one with 26 tags.

An `AWS::DynamoDB::Table` template property of `Tags` is deployed the same way, so a CDK app calling
`Tags.of(stack).add("Environment", "test")` gets a tagged table.

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
written as an `UpdateExpression` made of `SET`, `REMOVE`, `ADD` and `DELETE` clauses, in any order.
Each keyword appears at most once, and the actions inside a clause are separated by commas.

A `SET` action is `path = operand`, where an operand is a value from `ExpressionAttributeValues`,
another document path, or a call to `if_not_exists(path, operand)` or `list_append(one, other)`. Two
operands can be joined by one `+` or `-`. An update expression carries no literals, so every constant
arrives through `ExpressionAttributeValues`. A `REMOVE` action is a document path on its own, and
removing an attribute that is not there succeeds without changing the item.

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

### Counting and appending

`SET count = count + :n` and `SET count = count - :n` work out a number. DynamoDB takes one operator
between two operands, with no chaining and no brackets, so `:a + :b + :c` is refused. Arithmetic
against an attribute that is not there is a `ValidationException`, which is why a counter is usually
written `SET count = if_not_exists(count, :zero) + :one`.

The arithmetic runs on the decimal digits an item holds rather than on JavaScript numbers. Adding 1
to `9007199254740993` answers `9007199254740994` here, where an implementation going through a
double answers `9007199254740992`. A total wider than the 38 significant digits DynamoDB carries is
refused rather than rounded.

`list_append(one, other)` puts two lists end to end in the order they were written, so
`list_append(history, :entry)` appends and `list_append(:entry, history)` prepends.

A `SET` at a list index past the end of the list appends rather than leaving a gap, and a `REMOVE`
of a list element closes the list up. Every index an expression names is read against the stored
item, so `REMOVE lines[0], lines[1]` takes away the first two elements rather than the first and
the one that moved down into its place.

### Adding to numbers and sets

`ADD path :value` and `DELETE path :value` are written as a path and a value with nothing between
them. Both work on a top-level attribute, as they do on AWS, and both take a value the request
carries rather than a document path.

`ADD` on a number adds mathematically. An attribute that is not there counts as zero, and a negative
value counts down. `ADD` on a set unions the value into the stored set, and creates the attribute
when it is not there. The two sets have to be the same kind: adding a number set to a string set is
refused.

AWS recommends `SET` over `ADD` for a number, and it is worth repeating here. A retried `ADD` counts
twice, where a retried `SET` writes the same value again.

```typescript sim-dynamodb-update-counter
/**
 * Counting a view, appending to a list, and tagging an item.
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
    KeySchema: [{ AttributeName: "pageId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "pageId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "FoobarTable",
    Item: {
      pageId: { S: "page-1" },
      history: { L: [{ S: "created" }] },
      tags: { SS: ["draft"] },
    },
  }),
);

const counted = await dynamoDb.updateItem(
  new UpdateItemCommand({
    TableName: "FoobarTable",
    Key: { pageId: { S: "page-1" } },
    UpdateExpression:
      "SET views = if_not_exists(views, :zero) + :one, " +
      "history = list_append(history, :entry) " +
      "ADD tags :added",
    ExpressionAttributeValues: {
      ":zero": { N: "0" },
      ":one": { N: "1" },
      ":entry": { L: [{ S: "viewed" }] },
      ":added": { SS: ["published"] },
    },
    ReturnValues: "UPDATED_NEW",
  }),
);

// UPDATED_NEW answers with the attributes the expression touched.
console.log(counted.Attributes?.["views"]?.N); // "1"
console.log(counted.Attributes?.["history"]?.L?.length); // 2
console.log(counted.Attributes?.["tags"]?.SS); // [ "draft", "published" ]
console.log(counted.Attributes?.["pageId"]); // undefined

// Two actions cannot write to one attribute, so taking a tag away is its own
// update rather than a DELETE alongside the ADD above.
const untagged = await dynamoDb.updateItem(
  new UpdateItemCommand({
    TableName: "FoobarTable",
    Key: { pageId: { S: "page-1" } },
    UpdateExpression: "DELETE tags :gone",
    ExpressionAttributeValues: { ":gone": { SS: ["draft"] } },
    ReturnValues: "UPDATED_NEW",
  }),
);

console.log(untagged.Attributes?.["tags"]?.SS); // [ "published" ]
```

`DELETE` is set subtraction and nothing else. The value has to be a set of the kind the attribute
holds, a member the set does not hold is not an error, and a subtraction that empties the set takes
the attribute away with it, since DynamoDB has no empty set.

`ADD` and `DELETE` against a String, Binary, List or Map attribute are refused, as they are on AWS.

Assigning into a map the item does not carry is a `ValidationException` too. `SET address.city = :c`
needs an `address` map to write into, and an update does not make one on the way past.

An update cannot move an item's primary key. Assigning to a key attribute, or removing one, is a
`ValidationException` naming the attribute, since the request already names the item it works on
through its `Key`.

A request with no `UpdateExpression` at all still writes. It leaves a stored item as it was, and
creates one holding nothing but the `Key` when the key held nothing.

`ReturnValues` takes `NONE`, `ALL_OLD`, `ALL_NEW`, `UPDATED_OLD` and `UPDATED_NEW`. The `ALL_` modes
answer with the whole item, as it stood before the update or as it now is. The `UPDATED_` modes
answer with the parts of it the expression touched and nothing else, nested the way the item nests
them. `ALL_OLD` and `UPDATED_OLD` carry nothing when the key held nothing, and `UPDATED_NEW` carries
nothing when the expression only removed attributes.

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

## Reading and writing items in batches

`BatchWriteItem` puts and deletes items across tables in one call, and `BatchGetItem` reads them by
primary key. Both take `RequestItems`, a map of table name or ARN to what that table is asked for.

A batch write asks each table for a list of write requests, each carrying exactly one `PutRequest`
or `DeleteRequest`.

```typescript sim-dynamodb-batch-write-item
/**
 * Writing and deleting items across two tables in one call.
 */

import {
  BatchWriteItemCommand,
  CreateTableCommand,
  GetItemCommand,
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
await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "CustomersTable",
    KeySchema: [{ AttributeName: "customerId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "customerId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

const written = await dynamoDb.batchWriteItem(
  new BatchWriteItemCommand({
    RequestItems: {
      OrdersTable: [
        {
          PutRequest: {
            Item: { orderId: { S: "order-1" }, total: { N: "19.99" } },
          },
        },
        {
          PutRequest: {
            Item: { orderId: { S: "order-2" }, total: { N: "24.99" } },
          },
        },
        { DeleteRequest: { Key: { orderId: { S: "order-0" } } } },
      ],
      CustomersTable: [
        { PutRequest: { Item: { customerId: { S: "customer-1" } } } },
      ],
    },
  }),
);

// Nothing here is throttled, so nothing is ever left unprocessed.
console.log(written.UnprocessedItems); // {}

const output = await dynamoDb.getItem(
  new GetItemCommand({
    TableName: "OrdersTable",
    Key: { orderId: { S: "order-2" } },
  }),
);

console.log(output.Item?.["total"]?.N); // "24.99"
```

A put replaces the whole item under its key, exactly as `PutItem` does, and a delete names a key, so
deleting a key that is already free succeeds. Neither answers with the item it wrote over: a batch
has no `ReturnValues`, and no `ConditionExpression` either. A conditional write is what `PutItem`,
`DeleteItem` and `UpdateItem` are for.

Six things take the whole batch down rather than one entry of it, leaving nothing written:

- a table that is not there
- key attributes that do not match the table's key schema
- more than one operation on the same item of one table
- one table named twice, once by its name and once by its ARN
- more than 25 write requests, counted across every table the request names
- an item over the 400 KB an item holds

Real DynamoDB also refuses a request over 16 MB. That one is not simulated, for the reason under
Limitations.

The same key in two different tables is two items rather than one, so a batch may write both.

A batch read asks each table for `Keys`, and for how to read them. `ConsistentRead` and
`ProjectionExpression` are settled per table rather than per call, so one call can read the whole of
one table's items and part of another's.

```typescript sim-dynamodb-batch-get-item
/**
 * Reading items from two tables in one call, projecting one of them.
 */

import {
  BatchGetItemCommand,
  CreateTableCommand,
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
await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "CustomersTable",
    KeySchema: [{ AttributeName: "customerId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "customerId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "OrdersTable",
    Item: {
      orderId: { S: "order-1" },
      total: { N: "19.99" },
      note: { S: "gift wrapped" },
    },
  }),
);
await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "CustomersTable",
    Item: { customerId: { S: "customer-1" }, name: { S: "Ada" } },
  }),
);

const output = await dynamoDb.batchGetItem(
  new BatchGetItemCommand({
    RequestItems: {
      OrdersTable: {
        Keys: [{ orderId: { S: "order-1" } }, { orderId: { S: "order-404" } }],
        ConsistentRead: true,
        ProjectionExpression: "total",
      },
      CustomersTable: {
        Keys: [{ customerId: { S: "customer-1" } }],
      },
    },
  }),
);

// The key that holds nothing is left out rather than standing in the answer.
console.log(output.Responses["OrdersTable"]?.length); // 1
console.log(output.Responses["OrdersTable"]?.[0]); // { total: { N: "19.99" } }
console.log(output.Responses["CustomersTable"]?.[0]?.["name"]?.S); // "Ada"
console.log(output.UnprocessedKeys); // {}
```

An item that is not there is absent from `Responses`, with nothing standing in for it, so what came
back is what was there. A table that held none of the keys it was asked for is still in `Responses`,
with an empty list. DynamoDB reads a batch in parallel and answers in no particular order, so a
caller that needs to tell its items apart reads the key attributes off them rather than counting on
where they are in the list.

More than 100 keys in one call, counted across every table the request names, is a
`ValidationException`. So is the same key twice for one table, and so is one table named twice, once
by its name and once by its ARN.

Both commands answer with the map of what they could not get to, `UnprocessedItems` for a write and
`UnprocessedKeys` for a read. Both are always empty here, since nothing is throttled, but they are
there rather than absent, so the retry loop real code is written around still terminates:

```typescript
let unprocessed = {
  OrdersTable: [{ PutRequest: { Item: { orderId: { S: "order-1" } } } }],
};

while (Object.keys(unprocessed).length > 0) {
  const output = await dynamoDb.batchWriteItem(
    new BatchWriteItemCommand({ RequestItems: unprocessed }),
  );

  // Always empty against the simulator, so the loop runs once.
  unprocessed = output.UnprocessedItems;
}
```

## Reading and writing items in transactions

`TransactWriteItems` applies up to 100 actions in one step. Either all of them happen or none of
them do, so two items that have to agree with each other can be written together.

Each action carries exactly one of `Put`, `Update`, `Delete` and `ConditionCheck`, and names its own
table. A `ConditionCheck` writes nothing: it is how a transaction says that an item it is not
changing has to hold for the items it is changing to be written.

What a test usually wants to show is the failure. A transaction that succeeds looks the same as two
separate writes, so what is worth asserting is that a failed condition on the second action left the
first one unwritten.

```typescript sim-dynamodb-transact-write-items
/**
 * Writing a ledger entry and the balance it moves, or writing neither.
 */

import {
  CreateTableCommand,
  GetItemCommand,
  PutItemCommand,
  TransactWriteItemsCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "AccountsTable",
    KeySchema: [{ AttributeName: "accountId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "accountId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "LedgerTable",
    KeySchema: [{ AttributeName: "entryId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "entryId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

// The account is closed, so the balance may not move.
await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "AccountsTable",
    Item: {
      accountId: { S: "account-1" },
      balance: { N: "100" },
      status: { S: "closed" },
    },
  }),
);

const ledgerEntry = {
  Put: {
    TableName: "LedgerTable",
    Item: { entryId: { S: "entry-1" }, amount: { N: "25" } },
  },
};

const balanceUpdate = {
  Update: {
    TableName: "AccountsTable",
    Key: { accountId: { S: "account-1" } },
    UpdateExpression: "SET balance = balance - :amount",
    ConditionExpression: "#status = :open",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":amount": { N: "25" },
      ":open": { S: "open" },
    },
  },
};

try {
  await dynamoDb.transactWriteItems(
    new TransactWriteItemsCommand({
      TransactItems: [ledgerEntry, balanceUpdate],
    }),
  );
} catch (error) {
  const cancelled = error as {
    name: string;
    CancellationReasons?: { Code: string; Message?: string }[];
  };

  console.log(cancelled.name); // "TransactionCanceledException"
  console.log(cancelled.CancellationReasons);
  // [
  //   { Code: "None" },
  //   {
  //     Code: "ConditionalCheckFailed",
  //     Message: "The conditional request failed.",
  //   },
  // ]
}

// The first action is reported even though nothing was wrong with it, and the
// ledger entry it would have written is not there.
const entry = await dynamoDb.getItem(
  new GetItemCommand({
    TableName: "LedgerTable",
    Key: { entryId: { S: "entry-1" } },
  }),
);

console.log(entry.Item); // undefined
```

`CancellationReasons` lines up with `TransactItems`. There is one entry per action, in the same
order, including the actions that would have gone through, which carry the code `None`. The codes
have no `Exception` suffix, so a failed condition reads as `ConditionalCheckFailed` rather than as
the `ConditionalCheckFailedException` a single `PutItem` throws.

An action that sets `ReturnValuesOnConditionCheckFailure` to `ALL_OLD` gets `Item` on its
cancellation reason, holding the item as it was, so a retry needs no second read.

Five things refuse the request outright rather than cancelling it, with nothing written either way:

- more than 100 actions
- an action carrying more than one of `Put`, `Update`, `Delete` and `ConditionCheck`, or none of them
- two actions on the same item of one table
- a table that is not there, or a key that does not match its key schema
- an update that would move the item's primary key

One table may be named as often as the transaction likes, which is the difference from a batch. What
it may not do is touch one item twice.

### Retrying a transaction

`ClientRequestToken` makes a retry idempotent. Replaying a token with the same actions inside ten
minutes succeeds without applying the writes again, and replaying it with different actions gives
`IdempotentParameterMismatchException`. Only a transaction that was applied is remembered, so
retrying one that was cancelled runs it again.

The ten minutes are measured on the simulated clock, so a test moves past the window rather than
waiting for it:

```typescript
const withdrawal = {
  TransactItems: [
    {
      Update: {
        TableName: "AccountsTable",
        Key: { accountId: { S: "account-1" } },
        UpdateExpression: "SET balance = balance - :amount",
        ExpressionAttributeValues: { ":amount": { N: "25" } },
      },
    },
  ],
  ClientRequestToken: "6b6b1a1e-0e2d-4d3f-9f5a-1c0f2b3d4e5f",
};

// The balance moves once, however many times the call is retried.
await dynamoDb.transactWriteItems(new TransactWriteItemsCommand(withdrawal));
await dynamoDb.transactWriteItems(new TransactWriteItemsCommand(withdrawal));

// Past the window, the same token is a new transaction, and it moves again.
await simAws.clock().advanceBy({ minutes: 10 });
await dynamoDb.transactWriteItems(new TransactWriteItemsCommand(withdrawal));
```

### Reading in a transaction

`TransactGetItems` reads up to 100 items in one step, and is always strongly consistent, so there is
no `ConsistentRead` to set. Each `Get` names its own table, and takes a `ProjectionExpression`.

```typescript sim-dynamodb-transact-get-items
/**
 * Reading two items in one step, one of which is not there.
 */

import {
  CreateTableCommand,
  PutItemCommand,
  TransactGetItemsCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "AccountsTable",
    KeySchema: [{ AttributeName: "accountId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "accountId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "AccountsTable",
    Item: {
      accountId: { S: "account-1" },
      balance: { N: "100" },
      status: { S: "open" },
    },
  }),
);

const output = await dynamoDb.transactGetItems(
  new TransactGetItemsCommand({
    TransactItems: [
      {
        Get: {
          TableName: "AccountsTable",
          Key: { accountId: { S: "account-1" } },
          ProjectionExpression: "balance",
        },
      },
      {
        Get: {
          TableName: "AccountsTable",
          Key: { accountId: { S: "account-404" } },
        },
      },
    ],
  }),
);

// Responses is positional and is never compacted, so a missing item is an
// entry with no Item rather than nothing at all.
console.log(output.Responses[0]); // { Item: { balance: { N: "100" } } }
console.log(output.Responses[1]); // {}
```

That is the difference from `BatchGetItem`, which leaves a missing item out of its answer
altogether. Here the answers stay lined up with the Gets that asked for them.

## Expiring items with time to live

`UpdateTimeToLive` names the attribute a table expires items by, and `DescribeTimeToLive` reports
it. The attribute holds epoch seconds in a Number. An item without it, or holding a String or
anything else, never expires, and that is not an error. Nor does an item whose timestamp is more
than five years in the past, which DynamoDB treats as a malformed value rather than as long overdue.

Expiry runs on [the simulated clock](../../time/). Moving the clock forward is what deletes items
whose time to live has run out, so one `advanceBy` expires a table's sessions alongside whatever
else that advance causes elsewhere in the simulation. There is nothing else for a test to call.

Deletion is not immediate. Real DynamoDB marks an item expired at its timestamp and deletes it
typically within 48 hours, and reads keep returning it until then. That gap is simulated, so a test
can advance an hour past a session's expiry, see the session come back from `GetItem`, and find out
that the code under test needs to cope with it.

```typescript sim-dynamodb-time-to-live
/**
 * Items expiring as the simulated clock moves past their time to live.
 */

import {
  CreateTableCommand,
  DescribeTimeToLiveCommand,
  GetItemCommand,
  PutItemCommand,
  UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-08-01T09:00:00.000Z")),
});
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "SessionsTable",
    KeySchema: [{ AttributeName: "sessionId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "sessionId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);

await dynamoDb.updateTimeToLive(
  new UpdateTimeToLiveCommand({
    TableName: "SessionsTable",
    TimeToLiveSpecification: { Enabled: true, AttributeName: "expiresAt" },
  }),
);
await simAws.backgroundTasksComplete();

const described = await dynamoDb.describeTimeToLive(
  new DescribeTimeToLiveCommand({ TableName: "SessionsTable" }),
);

console.log(described.TimeToLiveDescription?.TimeToLiveStatus); // "ENABLED"

// A session that expires in an hour.
const nowSeconds = Math.floor(simAws.now().getTime() / 1000);

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "SessionsTable",
    Item: {
      sessionId: { S: "abc" },
      expiresAt: { N: String(nowSeconds + 3600) },
    },
  }),
);

await simAws.clock().advanceBy({ hours: 2 });

const stale = await dynamoDb.getItem(
  new GetItemCommand({
    TableName: "SessionsTable",
    Key: { sessionId: { S: "abc" } },
  }),
);

// Expired an hour ago, and still there, as it would be on AWS.
console.log(stale.Item === undefined); // false

await simAws.clock().advanceBy({ days: 3 });

const collected = await dynamoDb.getItem(
  new GetItemCommand({
    TableName: "SessionsTable",
    Key: { sessionId: { S: "abc" } },
  }),
);

// Past the deletion window, with nothing else asked of the simulation.
console.log(collected.Item === undefined); // true
```

`UpdateTimeToLive` moves the status to `ENABLING` and it settles on `ENABLED` once the background
work has run, which is the sequence a table's own status goes through. Switching it off goes through
`DISABLING` to `DISABLED`, and a `DISABLED` table reports no attribute name.

An `UpdateTimeToLive` asking for the state the table is already in is a `ValidationException`, as it
is on AWS, so code that has to be idempotent reads `DescribeTimeToLive` first. Changing the
attribute an enabled table expires by means switching time to live off and then on again.

DynamoDB also takes one `UpdateTimeToLive` per table per hour. That hour is measured on the
simulated clock, so a second call inside it is a `ValidationException` and
`simAws.clock().advanceBy({ hours: 1 })` is what lets the next one through.

Switching time to live on reaches the items already on the table, since their attributes were only
inert while it was off. A removal already scheduled is checked again when it comes due, so an item
overwritten with a later timestamp, or one on a table whose time to live has since been switched
off, stays where it is.

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

## The document client

`@aws-sdk/lib-dynamodb` takes plain JavaScript values in place of AttributeValues. Intercept a
`DynamoDBDocumentClient` and its Commands reach simulated DynamoDB with the values converted, so
code written against the document client runs against the simulator unchanged.

```typescript sim-dynamodb-document-client
/**
 * Reading and writing items as plain JavaScript with the document client.
 */

import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();

const documents = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "eu-west-2" }),
);
simSdk.intercept(documents);

await documents.send(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simSdk.simAws.backgroundTasksComplete();

// Nested objects, lists and Sets all go in as themselves.
await documents.send(
  new PutCommand({
    TableName: "OrdersTable",
    Item: {
      orderId: "order-1",
      total: 42,
      paid: false,
      lines: [{ sku: "widget", quantity: 2 }],
      tags: new Set(["priority", "gift"]),
    },
  }),
);

const updated = await documents.send(
  new UpdateCommand({
    TableName: "OrdersTable",
    Key: { orderId: "order-1" },
    UpdateExpression: "SET paid = :paid",
    ExpressionAttributeValues: { ":paid": true },
    ReturnValues: "ALL_NEW",
  }),
);

console.log(updated.Attributes?.["paid"]); // true

const read = await documents.send(
  new GetCommand({ TableName: "OrdersTable", Key: { orderId: "order-1" } }),
);

const lines = read.Item?.["lines"] as { sku: string; quantity: number }[];
console.log(lines[0]?.quantity); // 2

const tags = read.Item?.["tags"] as Set<string>;
console.log(tags.has("priority")); // true
```

`PutCommand`, `GetCommand`, `DeleteCommand`, `UpdateCommand`, `BatchWriteCommand` and
`BatchGetCommand` are converted. A document Command with no route here, such as
`TransactWriteCommand`, is refused by name before anything tries to convert its values.

Intercept the document client itself. `DynamoDBDocumentClient.from(client)` builds a separate object
that is not an instance of `DynamoDBClient`, so intercepting the base client does nothing for
Commands sent through the document one. See
[the SDK docs](../../sdk/README.md#the-dynamodb-document-client).

### Which native types map to which descriptors

| Written as                                        | Stored as | Read back as         |
| ------------------------------------------------- | --------- | -------------------- |
| `string`                                          | `S`       | `string`             |
| `number`                                          | `N`       | `number`             |
| `bigint`                                          | `N`       | `number` or `bigint` |
| `NumberValue`                                     | `N`       | `number` or `bigint` |
| `boolean`                                         | `BOOL`    | `boolean`            |
| `null`                                            | `NULL`    | `null`               |
| `Uint8Array`, `Buffer` and the other typed arrays | `B`       | `Uint8Array`         |
| `Set` of strings                                  | `SS`      | `Set` of strings     |
| `Set` of numbers or bigints                       | `NS`      | `Set` of numbers     |
| `Set` of binary                                   | `BS`      | `Set` of binary      |
| `Array`                                           | `L`       | `Array`              |
| plain object, `Map`                               | `M`       | plain object         |

A class instance is not converted. The real document client refuses one unless it was built with
`convertClassInstanceToMap`, so an object with behaviour is not quietly flattened into attributes.

### Numbers through the document client

A simulated table holds a number's digits exactly, but the document client converts to and from
JavaScript numbers, and that is where digits are lost. It is the same loss AWS has, so a test that
passes here is telling you something true about the real thing.

- Writing a `number` outside the safe integer range is refused rather than stored already rounded.
  Write a `bigint`, or a `NumberValue` from `@aws-sdk/lib-dynamodb`, to keep the digits.
- Reading a stored number outside the safe integer range gives a `bigint`.
- Reading a stored decimal with more digits than a JavaScript number carries gives a rounded
  `number`. The table still holds every digit; the rounding is the document client's. Read through
  an ordinary `GetItemCommand` to see the stored digits.
- Reading a stored number that is outside the safe integer range and is not whole is refused, since
  there is nothing to answer with.

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
`ProvisionedThroughput`, `TableClass`, `DeletionProtectionEnabled` and `Tags`. Each one is passed to
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
`TimeToLiveSpecification`, `StreamSpecification`, `KinesisStreamSpecification`,
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

A transaction is authorized as the operations it is made of rather than as itself. Each action of a
`TransactWriteItems` needs `dynamodb:PutItem`, `dynamodb:UpdateItem`, `dynamodb:DeleteItem` or
`dynamodb:ConditionCheckItem` against the table it names, and each `Get` of a `TransactGetItems`
needs `dynamodb:GetItem`. A caller refused any one of them is refused the whole transaction, so
nothing is written.

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
- `UpdateItem`, with `SET`, `REMOVE`, `ADD` and `DELETE` update expressions, `if_not_exists`,
  `list_append`, decimal arithmetic, list element paths, upserting when the key holds nothing, and
  all five `ReturnValues` modes. Every action reads the item as it stood before the update.
- `ConditionExpression` on `PutItem`, `DeleteItem` and `UpdateItem`, with the six comparators, `BETWEEN`, `IN`,
  `AND`, `OR`, `NOT`, brackets, and the `attribute_exists`, `attribute_not_exists`, `attribute_type`,
  `begins_with`, `contains` and `size` functions.
- `BatchWriteItem`, putting and deleting items across tables in one call, with the 25 request cap,
  the whole batch refusals, and an empty `UnprocessedItems`.
- `BatchGetItem`, reading items across tables in one call, with `ConsistentRead` and
  `ProjectionExpression` per table, the 100 key cap, and an empty `UnprocessedKeys`.
- `TransactWriteItems`, applying up to 100 `Put`, `Update`, `Delete` and `ConditionCheck` actions in
  one step, with `TransactionCanceledException` carrying a cancellation reason per action, and
  `ClientRequestToken` making a retry idempotent for ten simulated minutes.
- `TransactGetItems`, reading up to 100 items in one step, with a positional `Responses` array in
  which a missing item is an entry with no `Item`.
- `Tags` on `CreateTable`, with `TagResource`, `UntagResource` and `ListTagsOfResource` addressing
  the table by ARN, the key, value and count rules DynamoDB applies, and `NextToken` paging.
- `UpdateTimeToLive` and `DescribeTimeToLive`, moving through `ENABLING` and `DISABLING` to settle,
  with the one update per hour rule measured on the simulated clock. Items expire as the clock moves
  past their deletion window, with no sweep for a test to call.
- `AWS::DynamoDB::Table` in CloudFormation, created through `CreateTable`, with `Ref` giving the
  table name, `Fn::GetAtt … Arn` the table ARN, `TimeToLiveSpecification` deploying a table that
  expires items, and `Tags` deploying a tagged table.
- SDK interception, so an intercepted `DynamoDBClient` reaches the simulation.
- The `@aws-sdk/lib-dynamodb` document client, with `PutCommand`, `GetCommand`, `DeleteCommand`,
  `UpdateCommand`, `BatchWriteCommand` and `BatchGetCommand` converting native JavaScript values on
  the way in and out.

## Limitations

- The document client's `Query`, `Scan`, transaction and PartiQL Commands are not converted, since
  the first two are operations this simulation does not have yet. `TransactWriteCommand` and
  `TransactGetCommand` are the exception: the operations behind them are simulated, so only the
  document form is missing. All of them are refused by name rather than half converted.
- A document client's translate config is not read, so the marshalling options it was built with do
  not apply. See [the SDK docs](../../sdk/README.md#limitations).
- `Expected`, `ConditionalOperator` and `AttributeUpdates` are not converted for the document
  client, because simulated DynamoDB refuses all three anyway. A request carrying one is refused by
  the operation rather than by the conversion.
- Global and local secondary indexes are not simulated. `GlobalSecondaryIndexes` and
  `LocalSecondaryIndexes` are refused rather than dropped, since a table missing an index it was
  asked for would answer queries differently to the real one. An empty list asks for no index, so it
  is accepted.
- Tagging is immediate. AWS documents `TagResource` and `UntagResource` as eventually consistent, so
  a real `ListTagsOfResource` issued straight after one of them may answer with the previous tags or
  with none. Here the change is there by the time the call returns, so a test cannot observe the
  window a retry would be written for.
- A `ListTagsOfResource` page carries 25 tags. The API has no page size parameter, so the number is
  this simulator's choice rather than DynamoDB's, and a real page may hold a different number.
- The 10 KB limit on the total size of a resource's tags is not enforced. The 50 tag count and the
  key and value lengths are, and 50 tags of the greatest key and value length are over 10 KB, so a
  set of tags real DynamoDB would refuse for its size is accepted here.
- Exceeding the 50 tag limit is a `ValidationException`. Real DynamoDB documents
  `LimitExceededException` for `TagResource`, but describes it entirely in terms of how many table
  operations are running at once, which is a different thing from how many tags a table carries.
- Tag based IAM condition keys are not simulated. `aws:RequestTag`, `aws:ResourceTag` and
  `aws:TagKeys` are not evaluated, so a policy that allows tagging only under a particular key
  allows all of it here.
- Tables are the only taggable DynamoDB resource here. Backups and global table replicas are not
  simulated, so an ARN naming one of those names nothing. Real DynamoDB also copies a table's tags
  onto its secondary indexes, which have nothing to copy to yet.
- The time to live deletion window is a fixed 48 hours, where AWS promises only that an expired item
  is typically deleted within 48 hours. A simulation has to pick a point in that range, and this
  picks the far end, because that is the longest an expired item can still be readable and so is the
  behaviour an application has to cope with. A test can rely on an item surviving its TTL timestamp,
  and on it being gone once the window has passed. It should not assert that an expired item is
  still there partway through the window, since real DynamoDB may well have collected it by then.
- Time to live expiry is dispatched by moving the clock through `simAws.clock()`, not by real time
  elapsing. An item whose window goes by while a running-mode clock tracks the host stays where it
  is until something moves the clock. A simulated DynamoDB constructed standalone as
  `new SimDynamoDb()` has no clock control at all, so nothing there ever expires.
- Time to live deletions publish no stream records. Real DynamoDB writes one with a `userIdentity`
  of type `Service`, which is how an application tells a TTL deletion from an application's own, and
  streams are not simulated here.
- The five year time to live eligibility rule counts 1825 days rather than five calendar years, so
  an item whose timestamp sits within a couple of days of the boundary may be treated differently
  here to how AWS treats it.
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
- `UpdateTable`, `Query` and `Scan` are not implemented yet.
- `UnprocessedItems` and `UnprocessedKeys` are always empty. Nothing here is throttled and no
  response stops at a size, so the branch of a batch retry loop that resends what did not go through
  is never taken against the simulator.
- The 16 MB limit on a batch request is not enforced. Real DynamoDB counts the request as the JSON it
  arrived as, which is larger than the items it carries, and that inflation is not modelled: a batch
  of 25 items under 400 KB each is under 10 MB by the sizes counted here, so nothing this simulation
  measures ever reaches 16 MB.
- `TransactionConflictException` and `TransactionInProgressException` are not modelled. Every call
  here is serialised in one process, so no transaction ever meets another one working on the same
  item, and neither error is reachable.
- Only `None` and `ConditionalCheckFailed` appear as cancellation codes. Nothing here is throttled
  and no item collection is tracked, so `ProvisionedThroughputExceeded` and
  `ItemCollectionSizeLimitExceeded` never happen, and input DynamoDB would report as a
  `ValidationError` per action is refused up front as a `ValidationException` for the whole request.
- The 4 MB limit on a transactional write is counted from the items and keys the actions carry,
  rather than from the JSON the request arrived as, which is larger. A transaction near the limit
  here is near the limit there, but the byte counts are not identical.
- A `ClientRequestToken` is compared against the `TransactItems` as the JSON they arrived as, so a
  retry that names the same actions in a different order reads as a different request and is refused
  rather than replayed. A retry of the same call sends the same JSON, so this shows up only in a
  test that rebuilds the request by hand.
- A CloudFormation stack reaches `CREATE_COMPLETE` while the table it created is still `CREATING`.
  Real CloudFormation waits for the table to be `ACTIVE`, so a test reading the status after the
  stack deployed calls `simAws.backgroundTasksComplete()` first.
- CloudFormation stack updates and deletes are not simulated, so neither is table replacement or the
  `DeletionPolicy` a template sets on a table.
- `ProjectionExpression` is simulated on `GetItem`, `BatchGetItem` and `TransactGetItems`. `Query`
  and `Scan` are not implemented yet, so they have nothing to project from.
- The legacy `AttributesToGet` is refused rather than ignored, since an item that came back whole
  where part of it was asked for would hide an application reading an attribute it never requested.
  `ProjectionExpression` replaced it, and real DynamoDB has built nothing on it since.
- The 4 KB limit on an expression and the 255 byte limit on a placeholder are not enforced. Nothing
  here is slower for a long expression, so an expression real DynamoDB would refuse for its size is
  evaluated.
- Reads are always strongly consistent. `ConsistentRead` is accepted either way and changes nothing,
  whether a request sets it once for a read or per table for a batch read, so a test cannot observe a
  stale read here the way it might against a real table.
- Condition expressions are simulated on `PutItem`, `DeleteItem`, `UpdateItem` and the actions of
  `TransactWriteItems`. The key condition and filter expressions of `Query` and `Scan` are not
  implemented yet, so there is nothing else to guard.
- Two update actions cannot write to overlapping paths, so `ADD tags :added DELETE tags :gone` in one
  expression is refused as it is on AWS. Taking members out of a set an expression also adds to is a
  second update.
- An update is applied in one go, so nothing here shows the concurrency an atomic counter is for. A
  simulated `ADD` counts exactly once per call, where a real one is what makes two callers counting
  at the same time both count.
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
