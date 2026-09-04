# Simulated DynamoDB

Yulin simulates DynamoDB tables, indexes, items, streams and time to live in memory. Use
`simAws.dynamoDb()` directly or intercept a `DynamoDBClient`. DynamoDB types are available from
`@kensio/yulin/dynamodb`.

## Creating a table

`CreateTable` requires a table name, a key schema and an attribute definition for every key
attribute.

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

The response describes the table's keys, attribute definitions, ARN, ID, billing mode and capacity.

## Key schema and attribute definitions

The key schema holds one `HASH` element, optionally followed by one `RANGE` element, in that order.
`[{ RANGE }, { HASH }]` is refused here as it is on AWS.

`AttributeDefinitions` and the key attributes have to name exactly the same attributes. An attribute
defined that no key uses is a `ValidationException`, and so is a key attribute with no definition.
DynamoDB is only schemaless about the non-key attributes.

A key attribute is one of `S`, `N` or `B`, and an item written to the table has to carry every key
attribute as the type the table declared for it.

## Billing modes and throughput

`BillingMode` defaults to `PROVISIONED`. A provisioned table requires at least one read and one write
capacity unit in `ProvisionedThroughput`.

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

An on-demand table reports `ReadCapacityUnits` and `WriteCapacityUnits` of 0, as real DynamoDB
reports for one.

`TableClass` is stored and reported, and changes nothing else, since no billing happens here.
`DeletionProtectionEnabled` does change what the table does, and is covered under deleting a table.

## Global secondary indexes

`GlobalSecondaryIndexes` adds indexes over the table's items. Each index requires an `IndexName`,
`KeySchema` and `Projection`.

```typescript sim-dynamodb-global-secondary-index
/**
 * Declaring a global secondary index on a simulated table.
 */

import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

const creation = await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    // Every index key attribute needs a definition, alongside the table's own.
    AttributeDefinitions: [
      { AttributeName: "orderId", AttributeType: "S" },
      { AttributeName: "status", AttributeType: "S" },
      { AttributeName: "orderedAt", AttributeType: "N" },
    ],
    BillingMode: "PAY_PER_REQUEST",
    GlobalSecondaryIndexes: [
      {
        IndexName: "byStatus",
        KeySchema: [
          { AttributeName: "status", KeyType: "HASH" },
          { AttributeName: "orderedAt", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  }),
);

const index = creation.TableDescription?.GlobalSecondaryIndexes?.[0];
console.log(index?.IndexName); // "byStatus"
console.log(index?.IndexStatus); // "CREATING"
console.log(index?.IndexArn); // ".../table/OrdersTable/index/byStatus"

await simAws.backgroundTasksComplete();

// This order carries neither index key attribute, so it is absent from
// byStatus rather than refused. Missing either one is enough.
await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "OrdersTable",
    Item: { orderId: { S: "order-1" }, total: { N: "42" } },
  }),
);
```

`AttributeDefinitions` has to match the table key schema and every index key schema exactly, in both
directions. Declaring an index without adding its key attribute definitions is a
`ValidationException`, and so is defining an attribute no key uses. This is where `CreateTable`
input most often goes wrong.

An index key schema takes the same shape the table's does, with one `HASH` element, optionally
followed by one `RANGE` element, and key attributes of `S`, `N` or `B`. Index names are unique
within a table, and a table holds at most 20 indexes.

`Projection` says which attributes the index carries. `ALL` is the whole item, `KEYS_ONLY` is the
index keys plus the table keys, and `INCLUDE` adds 1 to 20 `NonKeyAttributes` to those. `INCLUDE`
with no attributes named is refused, since it would add no attribute to `KEYS_ONLY`, and attributes
named under either of the other two types are refused as well.

A table projects at most 100 `NonKeyAttributes` across all of its indexes, as well as 20 in any one
of them. An attribute projected into two indexes counts twice.

A provisioned table needs a `ProvisionedThroughput` per index as well as its own. `PAY_PER_REQUEST`
refuses one, since an on-demand index has no capacity to provision.

The description reports each index with its `IndexName`, `IndexArn`, `KeySchema`, `Projection`,
`ProvisionedThroughput` and `IndexStatus`. The index ARN is the table's own with the index named
under it. An index status follows its table's. It is `CREATING` on the `CreateTable` response and
`ACTIVE` once the table is. A table that declared no index leaves `GlobalSecondaryIndexes` out of
its description altogether.

An index is sparse. An item missing any one of an index's key attributes is absent from that index,
and the write itself still succeeds. An index keyed on two attributes needs both. The one thing a
write is held to on account of an index is the type. An item carrying an index key attribute as a
type the index did not declare is a `ValidationException`, since the index could never hold it.

## Local secondary indexes

`LocalSecondaryIndexes` on `CreateTable` gives an item collection a second sort key. The index
shares the table's partition key. An entry sits in the same partition as the item it indexes, and
its sort key is some other attribute. That is what serves an access pattern such as "this customer's
orders in date order" against a table keyed by customer and order id.

`CreateTable` is the only place one can be declared. AWS has no call that adds, changes or removes a
local secondary index afterwards. A table created without one stays without it for the whole of its
life.

```typescript sim-dynamodb-local-secondary-index
/**
 * Declaring and querying a local secondary index.
 */

import {
  CreateTableCommand,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "Orders",
    KeySchema: [
      { AttributeName: "customerId", KeyType: "HASH" },
      { AttributeName: "orderId", KeyType: "RANGE" },
    ],
    AttributeDefinitions: [
      { AttributeName: "customerId", AttributeType: "S" },
      { AttributeName: "orderId", AttributeType: "S" },
      { AttributeName: "placedAt", AttributeType: "S" },
    ],
    BillingMode: "PAY_PER_REQUEST",
    LocalSecondaryIndexes: [
      {
        IndexName: "OrdersByDate",
        // The partition key is the table's own. The sort key is the whole of
        // what the index adds.
        KeySchema: [
          { AttributeName: "customerId", KeyType: "HASH" },
          { AttributeName: "placedAt", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "KEYS_ONLY" },
      },
    ],
  }),
);
await simAws.backgroundTasksComplete();

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "Orders",
    Item: {
      customerId: { S: "customer-1" },
      orderId: { S: "order-1" },
      placedAt: { S: "2026-03-19" },
      total: { N: "7" },
    },
  }),
);

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "Orders",
    Item: {
      customerId: { S: "customer-1" },
      orderId: { S: "order-2" },
      placedAt: { S: "2026-01-08" },
      total: { N: "42" },
    },
  }),
);

const byDate = await dynamoDb.query(
  new QueryCommand({
    TableName: "Orders",
    IndexName: "OrdersByDate",
    KeyConditionExpression: "customerId = :customerId",
    ExpressionAttributeValues: { ":customerId": { S: "customer-1" } },
    // The index sits in the same partition as the item it indexes, so it can
    // answer a strongly consistent read.
    ConsistentRead: true,
  }),
);

// In date order, which is not the order the table's own sort key gives.
console.log(byDate.Items?.[0]?.["orderId"]?.S); // "order-2"
console.log(byDate.Items?.[1]?.["orderId"]?.S); // "order-1"

// The index projects its keys alone, so `total` is not on what it answers with.
console.log(byDate.Items?.[0]?.["total"]); // undefined

const whole = await dynamoDb.query(
  new QueryCommand({
    TableName: "Orders",
    IndexName: "OrdersByDate",
    KeyConditionExpression: "customerId = :customerId",
    ExpressionAttributeValues: { ":customerId": { S: "customer-1" } },
    // Asking for whole items fetches what the index does not project from the
    // base table, which is the read AWS charges the extra capacity for.
    Select: "ALL_ATTRIBUTES",
  }),
);

console.log(whole.Items?.[0]?.["total"]?.N); // "42"
```

The key schema is what a declaration is held to. The `HASH` element is the table's own partition
key, and a `RANGE` element is required and names some other attribute. An index sorted by the
attribute the table is already sorted by is refused, since it would repeat the order the table is
in, and so is one keyed on a partition key of its own. A table with no sort key at all takes no
local secondary index, because it holds one item per partition key and there is no collection for a
second sort key to reorder.

A table holds at most 5 local secondary indexes. Index names are unique within a table across both
kinds, and a local secondary index cannot take the name of a global one. `Projection` follows the
same `ALL`, `KEYS_ONLY` and `INCLUDE` rules a global secondary index does, and the 100
`NonKeyAttributes` a table projects is counted across every index of both kinds.

A per-index `ProvisionedThroughput` is refused. A local secondary index is read and written out of
the table's own capacity. There is no capacity to provision for it, and real DynamoDB has no
throughput field on a `LocalSecondaryIndex` at all.

The description reports each index with its `IndexName`, `IndexArn`, `KeySchema` and `Projection`.
There is no `IndexStatus` and no `ProvisionedThroughput`, since the index is built with the table
and shares its capacity. A table that declared none leaves `LocalSecondaryIndexes` out of its
description altogether.

## Describing a table

`DescribeTable` answers with the same description `CreateTable` did, read off the table itself. A
test can check a table came out the way the request or the CloudFormation template meant it to.

The `TableName` parameter takes the table's name or its ARN.

## Listing tables

`ListTables` returns table names in DynamoDB's order, sorted by UTF-8 bytes. `Limit` takes a whole
number from 1 to 100 and defaults to 100.

`LastEvaluatedTableName` is the name to resume from, and it is absent on the last page. That is what
lets a caller loop until it is gone, rather than until a page comes back empty.

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

A token naming a table that has since been deleted still works. A page resumes at the first name
after the token.

## Updating a table

`UpdateTable` changes a table after it exists. It does one of these per call, as AWS does:

- change what the table is billed and provisioned as
- add one global secondary index
- remove one global secondary index

A request combining two of them is a `ValidationException`. `TableClass` and
`DeletionProtectionEnabled` sit outside the three and can ride along with any of them, or stand on
their own.

The table goes to `UPDATING` at once and settles back to `ACTIVE` once the scheduled background work
has run. It serves reads and writes throughout, since AWS keeps a table online while updating it. A
second `UpdateTable` while one is in flight is a `ResourceInUseException`.

Adding an index is the change most likely to go wrong in a deployment. It is worth writing a test
against. The new index is on the table straight away with an `IndexStatus` of `CREATING` and
`Backfilling` true, and cannot be read until it is `ACTIVE`. A `Query` or a `Scan` against it before
then is refused with `Cannot read from backfilling global secondary index`, which is what real
DynamoDB answers. The indexes the table already had stay `ACTIVE` and readable while the new one
builds.

The key attributes of the new index have to be in the `AttributeDefinitions` of the same call. That
is the only chance to declare them, and a request that leaves them out fails the same way a
`CreateTable` missing a definition does. Those definitions are added to the ones the table already
has, so redeclaring an existing attribute as another type is refused.

```typescript sim-dynamodb-update-table-index
/**
 * Adding a global secondary index to a table that is already live.
 */

import {
  DescribeTableCommand,
  QueryCommand,
  UpdateTableCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable({
  input: {
    TableName: "OrdersTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  },
});
await simAws.backgroundTasksComplete();

await dynamoDb.putItem({
  input: {
    TableName: "OrdersTable",
    Item: { orderId: { S: "order-1" }, status: { S: "OPEN" } },
  },
});

// The attributes the new index is keyed on are declared on the same call, which
// is the only chance to declare them.
await dynamoDb.updateTable(
  new UpdateTableCommand({
    TableName: "OrdersTable",
    AttributeDefinitions: [{ AttributeName: "status", AttributeType: "S" }],
    GlobalSecondaryIndexUpdates: [
      {
        Create: {
          IndexName: "byStatus",
          KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      },
    ],
  }),
);

const building = await dynamoDb.describeTable(
  new DescribeTableCommand({ TableName: "OrdersTable" }),
);

console.log(building.Table?.TableStatus); // "UPDATING"
console.log(building.Table?.GlobalSecondaryIndexes?.[0]?.IndexStatus); // "CREATING"
console.log(building.Table?.GlobalSecondaryIndexes?.[0]?.Backfilling); // true

// A query against the index now would be refused with
// "Cannot read from backfilling global secondary index: byStatus".
await simAws.backgroundTasksComplete();

// Once it is ACTIVE it answers for the order that was written before it existed.
const open = await dynamoDb.query(
  new QueryCommand({
    TableName: "OrdersTable",
    IndexName: "byStatus",
    KeyConditionExpression: "#status = :status",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":status": { S: "OPEN" } },
  }),
);

console.log(open.Items?.[0]?.["orderId"]?.S); // "order-1"

// Removing it takes it back off the table.
await dynamoDb.updateTable(
  new UpdateTableCommand({
    TableName: "OrdersTable",
    GlobalSecondaryIndexUpdates: [{ Delete: { IndexName: "byStatus" } }],
  }),
);
await simAws.backgroundTasksComplete();

const described = await dynamoDb.describeTable(
  new DescribeTableCommand({ TableName: "OrdersTable" }),
);

console.log(described.Table?.GlobalSecondaryIndexes); // undefined
```

Removing an index takes it out of `DescribeTable`, after which a read naming it gives
`ResourceNotFoundException`. Deleting one the table lacks gives the same, since there is no such
index either way.

A request carrying `ProvisionedThroughput` and no `BillingMode` reprovisions the table under the
mode it already has, so setting capacity on an on-demand table is refused, and never quietly
switched. Switching to `PROVISIONED` has to state the capacity here, which real DynamoDB estimates
instead. See Limitations.

## Deleting a table

`DeleteTable` puts the table into `DELETING` and answers with its description. The table is still
there to describe until the scheduled background work has run, at which point it and its items are
gone.

Real DynamoDB only deletes a table that is `ACTIVE`. One that is still `CREATING` or `UPDATING`
answers `ResourceInUseException`, and one that has gone answers `ResourceNotFoundException`.
Deleting a table that is already deleting succeeds.

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

Add tags during `CreateTable` or later with `TagResource`. Remove them with `UntagResource` and read
them with `ListTagsOfResource`. Tag commands require the table ARN in `ResourceArn`.

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
to see what either did. Untagging a key that was never set succeeds. The request asks for a table
without that key, and that is what it gets either way.

The rules a tag is held to are DynamoDB's:

- a key is 1 to 128 characters, and a value is 0 to 256, and a key with no value of its own is a tag
  with an empty value
- both are written with letters, whitespace, digits and `+ - = . _ : /`, narrower than the set some
  other AWS services take, with no `@` in it
- a key beginning `aws:` is refused, since that prefix is AWS's to assign
- a resource holds 50 tags

A request that breaks one of those is refused whole. A call carrying one good tag and one bad one
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

A page carries 25 tags. The API has no page size parameter. That number is this simulator's own
choosing. It is half of the 50 a resource holds, which puts an ordinarily tagged table in one page
and lets a test that wants to see a `NextToken` reach one with 26 tags.

An `AWS::DynamoDB::Table` template property of `Tags` is deployed the same way, and a CDK app
calling `Tags.of(stack).add("Environment", "test")` gets a tagged table.

## Writing items

`PutItem` replaces the complete item stored under the primary key. The write is visible when the
command returns.

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

`GetItem` reads an item by primary key. `DeleteItem` removes it. The `Key` must contain every key
attribute and no others, using the types declared in `AttributeDefinitions`. Invalid keys raise
`ValidationException`.

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

A key that holds nothing comes back with no `Item` at all, and not an empty one. That absence is how
a caller tells a miss from an item carrying nothing but its key.

`ConsistentRead` is accepted whichever way it is set, and has no effect. Every write has landed by
the time the call that made it returns. An eventually consistent read still answers with the latest
write.

`DeleteItem` names a key, never an item, so deleting a key that is already free succeeds and reports
no removal. Its `ReturnValues` takes `NONE` and `ALL_OLD`, as `PutItem` does, and `ALL_OLD` answers
with the item that was removed.

Both take the table's name or its ARN, as the table commands do.

## Updating items

`UpdateItem` changes selected attributes. Its `UpdateExpression` may contain `SET`, `REMOVE`, `ADD`
and `DELETE` clauses in any order. Each clause may appear once and contain comma-separated actions.

A `SET` action is `path = operand`, where an operand is a value from `ExpressionAttributeValues`,
another document path, or a call to `if_not_exists(path, operand)` or `list_append(one, other)`. Two
operands can be joined by one `+` or `-`. An update expression carries no literals, so every
constant arrives through `ExpressionAttributeValues`. A `REMOVE` action is a document path on its
own, and removing an attribute that is absent succeeds without changing the item.

Every action reads the item as it stood before the request, and never the item being built. So this
expression, against an item of `{ a: 1, b: 2, c: 3 }`:

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

An assignment reading a document path the item lacks is a `ValidationException`, as it is on AWS,
and never an assignment of nothing. `if_not_exists` is how an expression says what to assign when
the attribute may be absent.

### Counting and appending

`SET count = count + :n` and `SET count = count - :n` work out a number. DynamoDB takes one operator
between two operands, with no chaining and no brackets, so `:a + :b + :c` is refused. Arithmetic
against an attribute that is absent is a `ValidationException`, which is why a counter is usually
written `SET count = if_not_exists(count, :zero) + :one`.

The arithmetic runs on the decimal digits an item holds, never on JavaScript numbers. Adding 1 to
`9007199254740993` answers `9007199254740994` here, where an implementation going through a double
answers `9007199254740992`. A total wider than the 38 significant digits DynamoDB carries is
refused, never rounded.

`list_append(one, other)` puts two lists end to end in the order they were written, so
`list_append(history, :entry)` appends and `list_append(:entry, history)` prepends.

A `SET` at a list index past the end of the list appends, and never leaves a gap, and a `REMOVE` of
a list element closes the list up. Every index an expression names is read against the stored item,
so `REMOVE lines[0], lines[1]` takes away the first two elements, and never the first and the one
that moved down into its place.

### Adding to numbers and sets

`ADD path :value` and `DELETE path :value` are written as a path and a value with nothing between
them. Both work on a top-level attribute, as they do on AWS, and both take a value the request
carries, never a document path.

`ADD` on a number adds mathematically. An attribute that is absent counts as zero, and a negative
value counts down. `ADD` on a set unions the value into the stored set, and creates the attribute
when it is absent. The two sets have to be the same kind, and adding a number set to a string set is
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
holds, a member the set fails to hold is allowed, and a subtraction that empties the set takes the
attribute away with it, since DynamoDB has no empty set.

`ADD` and `DELETE` against a String, Binary, List or Map attribute are refused, as they are on AWS.

Assigning into a map the item lacks is a `ValidationException` too. `SET address.city = :c` needs an
`address` map to write into, and an update never makes one on the way past.

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

`PutItem`, `DeleteItem` and `UpdateItem` evaluate `ConditionExpression` against the stored item before
writing. A failed condition leaves the item unchanged and raises
`ConditionalCheckFailedException`.

Use `attribute_not_exists` for insert-only writes or compare a version attribute for optimistic
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

The expression is read before the table is reached, and an expression DynamoDB would refuse is
refused whether or not the key holds anything.

### What a condition can say

The comparators are `=`, `<>`, `<`, `<=`, `>` and `>=`. `BETWEEN` takes two bounds and counts both
as inside. `IN` takes up to 100 operands. `AND`, `OR`, `NOT` and brackets combine them, with `NOT`
binding tighter than `AND` and `AND` tighter than `OR`. Keywords are read in any case, so `and`
works as well as `AND`.

The functions are `attribute_exists`, `attribute_not_exists`, `attribute_type`, `begins_with`,
`contains` and `size`. Function names are read in lower case only, as they are on real AWS.
`attribute_exists` is true for an attribute stored as `NULL`, since `NULL` is a value and not an
absent one. The first operand of every one of them names a path in the item. A supplied value there
is refused, never compared. `size` is a number and not a condition, so it goes beside a comparator.
It measures a string or binary in bytes, and a set, a list or a map in how many things it holds.

Strings compare by UTF-8 byte order, numbers compare by the digits they hold, and binary compares as
unsigned bytes.

A comparison between two different types is never an error. Equality works across types, and a
string and a number are unequal, with `=` false and `<>` true. Ordering fails across types, so `<`,
`<=`, `>` and `>=` are all false between them, as they are for a path the item lacks. That is what
real DynamoDB does, and it is what lets one condition guard items that do not all carry the same
attributes.

`ExpressionAttributeNames` and `ExpressionAttributeValues` have to agree exactly with the
expression, in both directions. A placeholder the request leaves undefined is a
`ValidationException`, and so is an entry no expression uses.

## Projecting attributes

`ProjectionExpression` is a comma-separated list of document paths returned by `GetItem`. A path can
contain map attributes and list indexes, such as `address.city` or `lines[0].sku`.

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

A projected path the item lacks is left out. That is allowed, and it never comes back as a `NULL`.
An item with none of the projected paths answers with an `Item` holding nothing.

The placeholders and the expression have to agree exactly, in both directions. A `#name` the request
leaves undefined is a `ValidationException`, and so is an `ExpressionAttributeNames` entry no
expression uses. The second is what a request hits after an expression is edited and the old
placeholder is left behind.

Two paths where one contains the other, such as `address, address.city`, are a
`ValidationException`, as they are on real AWS. The pair leaves it open whether the whole map or one
attribute of it was wanted. Naming one path twice counts the same way.

A document path goes at most 32 levels deep, as far as an item nests. A negative index, a fractional
index and a path past that depth are each a `ValidationException` naming the path.

## Querying an item collection

A table with a sort key keeps one ordered item collection per partition key. `Query` reads one
collection.

`KeyConditionExpression` requires equality on the partition key. It may add one sort key condition
with `AND`. Sort key operators are `=`, `<`, `<=`, `>`, `>=`, `BETWEEN` and `begins_with`.

```typescript sim-dynamodb-query
/**
 * Reading a customer's orders back in sort key order.
 */

import {
  CreateTableCommand,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [
      { AttributeName: "customerId", KeyType: "HASH" },
      { AttributeName: "orderId", KeyType: "RANGE" },
    ],
    AttributeDefinitions: [
      { AttributeName: "customerId", AttributeType: "S" },
      { AttributeName: "orderId", AttributeType: "S" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

for (const orderId of ["2026-03-01", "2026-01-14", "2027-01-02"]) {
  await dynamoDb.putItem(
    new PutItemCommand({
      TableName: "OrdersTable",
      Item: { customerId: { S: "c-1" }, orderId: { S: orderId } },
    }),
  );
}

const page = await dynamoDb.query(
  new QueryCommand({
    TableName: "OrdersTable",
    KeyConditionExpression:
      "customerId = :customer AND begins_with(orderId, :prefix)",
    ExpressionAttributeValues: {
      ":customer": { S: "c-1" },
      ":prefix": { S: "2026-" },
    },
  }),
);

console.log(page.Items?.map((item) => item["orderId"]?.S));
// [ "2026-01-14", "2026-03-01" ]

console.log(page.Count); // 2
console.log(page.ScannedCount); // 2

// ScanIndexForward reads the collection backwards.
const newestFirst = await dynamoDb.query(
  new QueryCommand({
    TableName: "OrdersTable",
    KeyConditionExpression: "customerId = :customer",
    ExpressionAttributeValues: { ":customer": { S: "c-1" } },
    ScanIndexForward: false,
  }),
);

console.log(newestFirst.Items?.map((item) => item["orderId"]?.S));
// [ "2027-01-02", "2026-03-01", "2026-01-14" ]
```

The order is DynamoDB's and not JavaScript's. A String sort key orders by its UTF-8 bytes, a Binary
one as unsigned bytes, and a Number one by value however it was written, so `1E2` and `100` are one
key and not two, and `9` sorts below `20`.

`begins_with` reads a prefix of a String or Binary sort key. Against a Number sort key it is a
`ValidationException`, as it is on AWS. A number is stored as a value, never as the digits it was
written with. It has no prefix.

A query on a table with no sort key is allowed, and reads the one item under the partition key.

### What a key condition can say

The grammar is closed, and deliberately narrower than a `ConditionExpression`. Each of these is a
`ValidationException` naming what was wrong:

- a key condition that leaves the partition key untested for equality
- a range operator or `begins_with` applied to the partition key
- an operator or function a sort key condition refuses, such as `<>` or `contains`
- an attribute outside the table's primary key
- `OR` or `NOT` anywhere
- the same key attribute tested twice
- a `BETWEEN` whose upper bound is below its lower bound, or whose bounds are different types
- a value written into the expression, where `ExpressionAttributeValues` should supply it
- a value whose type differs from the one the table declared for that key attribute, such as
  comparing an `S` sort key against an `N`. A key attribute has one type, and the condition could
  never hold, and an empty page would read as a collection that happens to hold nothing.

An attribute name that is a DynamoDB reserved word is written as a `#name` placeholder and defined
in `ExpressionAttributeNames`, as in any other expression.

### Paging a collection

`Limit` counts evaluated items. Pass `LastEvaluatedKey` back as `ExclusiveStartKey` to continue after
the last evaluated item.

```typescript sim-dynamodb-query-paging
/**
 * Paging through an item collection until the token runs out.
 */

import {
  CreateTableCommand,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import type { AttributeValue } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "EventsTable",
    KeySchema: [
      { AttributeName: "streamId", KeyType: "HASH" },
      { AttributeName: "eventId", KeyType: "RANGE" },
    ],
    AttributeDefinitions: [
      { AttributeName: "streamId", AttributeType: "S" },
      { AttributeName: "eventId", AttributeType: "N" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

for (const eventId of ["1", "2", "3"]) {
  await dynamoDb.putItem(
    new PutItemCommand({
      TableName: "EventsTable",
      Item: { streamId: { S: "stream-1" }, eventId: { N: eventId } },
    }),
  );
}

const read: string[] = [];
let exclusiveStartKey: Record<string, AttributeValue> | undefined;

do {
  const page = await dynamoDb.query(
    new QueryCommand({
      TableName: "EventsTable",
      KeyConditionExpression: "streamId = :stream",
      ExpressionAttributeValues: { ":stream": { S: "stream-1" } },
      Limit: 2,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );

  read.push(...(page.Items ?? []).map((item) => item["eventId"]?.N ?? ""));
  exclusiveStartKey = page.LastEvaluatedKey;
} while (exclusiveStartKey !== undefined);

console.log(read); // [ "1", "2", "3" ]
```

`LastEvaluatedKey` is left out only when the key range ran out inside the `Limit`. Reaching the
limit on the last matching item still hands out a token, and the next call answers with an empty
page and no token. That is what real DynamoDB does, since it cannot know the range is exhausted
without looking past it. A loop like the one above is the way to read a whole collection.

A token still works when the item it names has since been deleted. It says where to resume. A token
from a different partition key is refused, since it names a collection this query goes unreading.

## Reading a global secondary index

Set `IndexName` on `Query` or `Scan` to read an index. Key conditions then use the index key schema.

```typescript sim-dynamodb-query-index
/**
 * Querying a global secondary index.
 */

import {
  CreateTableCommand,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [
      { AttributeName: "orderId", AttributeType: "S" },
      { AttributeName: "status", AttributeType: "S" },
    ],
    BillingMode: "PAY_PER_REQUEST",
    GlobalSecondaryIndexes: [
      {
        IndexName: "byStatus",
        KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
        Projection: { ProjectionType: "INCLUDE", NonKeyAttributes: ["total"] },
      },
    ],
  }),
);
await simAws.backgroundTasksComplete();

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "OrdersTable",
    Item: {
      orderId: { S: "order-1" },
      status: { S: "OPEN" },
      total: { N: "42" },
      note: { S: "Gift wrap" },
    },
  }),
);

// A draft carries no status, so the index does not hold it.
await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "OrdersTable",
    Item: { orderId: { S: "order-2" }, total: { N: "7" } },
  }),
);

const open = await dynamoDb.query(
  new QueryCommand({
    TableName: "OrdersTable",
    IndexName: "byStatus",
    KeyConditionExpression: "#status = :status",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":status": { S: "OPEN" } },
  }),
);

console.log(open.Count); // 1
console.log(open.Items?.[0]?.["orderId"]?.S); // "order-1"
console.log(open.Items?.[0]?.["total"]?.N); // "42"

// `note` is not projected, so it is not on the item the index answers with.
console.log(open.Items?.[0]?.["note"]); // undefined
```

The index is sparse. An item missing any of the index key attributes stays out of the index. A read
of it simply misses that item. The write itself said so at no point.

An index key can repeat, so several items can share one. Items sharing an index key come back in no
particular order, and `LastEvaluatedKey` carries the index key attributes together with the table
key attributes, and the two together name one of them exactly enough to resume after. An
`ExclusiveStartKey` carrying only part of that is refused.

A read answers with the attributes the index projects, so `Select` defaults to
`ALL_PROJECTED_ATTRIBUTES` in place of `ALL_ATTRIBUTES`. Asking for more than the index carries is
refused outright:

- `Select: ALL_ATTRIBUTES` against an index whose projection falls short of `ALL` is a
  `ValidationException`.
- A `FilterExpression` naming an attribute the index omits is refused too. The attribute is absent
  from the items the index holds, and the filter would drop all of them and the empty page would
  read as a collection that happens to hold nothing.

An `IndexName` the table lacks gives `ResourceNotFoundException`. `ConsistentRead: true` against a
global secondary index is a `ValidationException`, because a global secondary index is maintained
asynchronously on AWS and cannot answer a strongly consistent read at all.

`Scan` takes `IndexName` the same way, including in parallel segments, which divide by the index
partition key rather than the table's.

## Reading a local secondary index

`IndexName` reaches a local secondary index the same way, and the walk is the same walk. The index
is sparse, the key condition is held to the index key schema, and `Scan` takes the index too. Two
things differ, and both follow from the index sitting in the same partition as the item it indexes.

`ConsistentRead: true` is answered here. The index is written with the item, in the same partition.
There is no window in which it lags behind the table.

An attribute the index omits is fetched from the base table, and never refused. So `Select:
ALL_ATTRIBUTES` against a `KEYS_ONLY` index answers with whole items, and a `FilterExpression` may
name any attribute of the item, and never only a projected one. Real DynamoDB charges the extra read
capacity for that fetch. A read that asks for one of those anyway still answers with what the index
projects, since `Select` defaults to `ALL_PROJECTED_ATTRIBUTES` on any index.

`LastEvaluatedKey` carries three attributes, which are the table partition key, the index sort key
and the table sort key. Two entries can share a whole index key. The table sort key is what names
one of them exactly enough to resume after. An `ExclusiveStartKey` missing any of the three is
refused.

## Scanning a table

`Scan` reads every item in a table without a key condition. It is useful for test assertions but
usually reads more data than application code needs.

```typescript sim-dynamodb-scan
/**
 * Reading a whole table back, whatever partition keys it holds.
 */

import {
  CreateTableCommand,
  PutItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [
      { AttributeName: "customerId", KeyType: "HASH" },
      { AttributeName: "orderId", KeyType: "RANGE" },
    ],
    AttributeDefinitions: [
      { AttributeName: "customerId", AttributeType: "S" },
      { AttributeName: "orderId", AttributeType: "S" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

const written = [
  { customerId: "c-1", orderId: "2026-03" },
  { customerId: "c-1", orderId: "2026-01" },
  { customerId: "c-1", orderId: "2026-02" },
  { customerId: "c-2", orderId: "2026-04" },
  { customerId: "c-3", orderId: "2026-05" },
];

for (const order of written) {
  await dynamoDb.putItem(
    new PutItemCommand({
      TableName: "OrdersTable",
      Item: {
        customerId: { S: order.customerId },
        orderId: { S: order.orderId },
      },
    }),
  );
}

const page = await dynamoDb.scan(new ScanCommand({ TableName: "OrdersTable" }));

console.log(page.Count); // 5
console.log(page.ScannedCount); // 5

// The items under one partition key come back together, ascending by sort key.
console.log(
  page.Items?.filter((item) => item["customerId"]?.S === "c-1").map(
    (item) => item["orderId"]?.S,
  ),
);
// [ "2026-01", "2026-02", "2026-03" ]
```

The partition key values themselves come back in an arbitrary order. It is neither the sorted order
nor the order the items were written in. Real DynamoDB walks a table by the hash of the partition
key, and a scan that came back globally sorted would be something no real table gives you, and a
test leaning on one would pass here and fail against the service.

The order is arbitrary but fixed. Two scans of an unchanged table read it the same way, and that is
what lets a token resume one.

`Limit`, `LastEvaluatedKey` and `ExclusiveStartKey` page a scan the way they page a query, and the
loop is the same one. `ConsistentRead` is accepted and changes nothing, since every simulated read
is already the strongly consistent one.

### Scanning in parallel

`Segment` and `TotalSegments` divide a table between workers. `TotalSegments` is how many shares the
table is divided into, and `Segment` is the zero based number of the share this request reads.

```typescript sim-dynamodb-parallel-scan
/**
 * Reading a table in four segments.
 */

import {
  CreateTableCommand,
  PutItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [
      { AttributeName: "customerId", KeyType: "HASH" },
      { AttributeName: "orderId", KeyType: "RANGE" },
    ],
    AttributeDefinitions: [
      { AttributeName: "customerId", AttributeType: "S" },
      { AttributeName: "orderId", AttributeType: "S" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

for (const customerId of ["c-1", "c-2", "c-3", "c-4"]) {
  for (const orderId of ["2026-01", "2026-02"]) {
    await dynamoDb.putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: { customerId: { S: customerId }, orderId: { S: orderId } },
      }),
    );
  }
}

const totalSegments = 4;

// Which segment each of a customer's orders came back in.
const segmentsByCustomer = new Map<string, number[]>();

for (let segment = 0; segment < totalSegments; segment++) {
  const segmentPage = await dynamoDb.scan(
    new ScanCommand({
      TableName: "OrdersTable",
      Segment: segment,
      TotalSegments: totalSegments,
    }),
  );

  const items = segmentPage.Items ?? [];

  for (const item of items) {
    const customerId = item["customerId"]?.S ?? "";
    const segments = segmentsByCustomer.get(customerId) ?? [];

    segmentsByCustomer.set(customerId, [...segments, segment]);
  }
}

// The segments together are the whole table, with nothing read twice.
console.log(segmentsByCustomer.values().toArray().flat().length); // 8
console.log(segmentsByCustomer.size); // 4

// And each customer's two orders came back in one segment rather than split
// between two.
console.log(
  segmentsByCustomer
    .values()
    .map((segments) => new Set(segments).size)
    .toArray(),
);
// [ 1, 1, 1, 1 ]
```

An item belongs to a segment by its partition key value, so every item of one item collection lands
in the same segment. That is what makes a segment a share of the table's partition keys rather than
a share of its items, and it is why segments come out uneven. A segment holding nothing is ordinary,
and dividing a table into more segments than it has partition key values leaves most of them empty.

There is no speed to gain here, since a simulated scan walks a map in memory. What a parallel scan
gives a test is the caller's side of one. Code that divides a table between workers can be run
without a real table.

Each segment pages on its own. `Limit` and `LastEvaluatedKey` work per segment, and the next request
passes that segment's token back with the same `Segment` and `TotalSegments`. A token from another
segment is refused, since it names a place that segment's walk never reaches.

These are the rules a request is held to, each a `ValidationException`:

- `Segment` without `TotalSegments`, or `TotalSegments` without `Segment`. They are supplied
  together or not at all, and a request naming both as absent reads the whole table.
- a `Segment` at or above `TotalSegments`, or below zero. It is zero based. The last segment of four
  is `3`.
- a `TotalSegments` outside 1 to 1000000. A `TotalSegments` of 1 is a sequential scan.
- an `ExclusiveStartKey` belonging to another segment.

`Segment` and `TotalSegments` are refused on `Query`, since it is a single-collection operation and
never had them. A query reads one item collection, which sits under one partition key and so inside
one segment.

## Filtering a read

`FilterExpression` drops items a `Query` or a `Scan` read. It is the same grammar a
[conditional write](#conditional-writes) is guarded by, evaluated against each item the read
reached.

It runs after the read, and that order is what the counts report. The walk is cut at the `Limit`
first, and the filter then drops items from the page that came back. `ScannedCount` is how many
items the read evaluated, and `Count` how many of those survived.

```typescript sim-dynamodb-query-filter
/**
 * Reading a customer's open orders, and counting what that cost.
 */

import {
  CreateTableCommand,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [
      { AttributeName: "customerId", KeyType: "HASH" },
      { AttributeName: "orderId", KeyType: "RANGE" },
    ],
    AttributeDefinitions: [
      { AttributeName: "customerId", AttributeType: "S" },
      { AttributeName: "orderId", AttributeType: "S" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

const orders = [
  { orderId: "2026-01", status: "OPEN" },
  { orderId: "2026-02", status: "SHIPPED" },
  { orderId: "2026-03", status: "OPEN" },
  { orderId: "2026-04", status: "SHIPPED" },
];

for (const order of orders) {
  await dynamoDb.putItem(
    new PutItemCommand({
      TableName: "OrdersTable",
      Item: {
        customerId: { S: "c-1" },
        orderId: { S: order.orderId },
        status: { S: order.status },
      },
    }),
  );
}

const page = await dynamoDb.query(
  new QueryCommand({
    TableName: "OrdersTable",
    KeyConditionExpression: "customerId = :customer",
    FilterExpression: "#status = :open",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":customer": { S: "c-1" },
      ":open": { S: "OPEN" },
    },
    Limit: 3,
  }),
);

console.log(page.Items?.map((item) => item["orderId"]?.S));
// [ "2026-01", "2026-03" ]

// Three items were read, and two of them survived the filter.
console.log(page.ScannedCount); // 3
console.log(page.Count); // 2

// There is more to read, even though the page came back shorter than the Limit.
console.log(page.LastEvaluatedKey?.["orderId"]?.S); // "2026-03"

// Select COUNT counts the same read and answers with no items at all.
const counted = await dynamoDb.query(
  new QueryCommand({
    TableName: "OrdersTable",
    KeyConditionExpression: "customerId = :customer",
    FilterExpression: "#status = :open",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":customer": { S: "c-1" },
      ":open": { S: "OPEN" },
    },
    Select: "COUNT",
  }),
);

console.log(counted.Count); // 2
console.log(counted.ScannedCount); // 4
console.log(counted.Items); // undefined
```

A filter saves no capacity. Every item it drops was read. A filtered query is charged for what it
threw away on AWS.

A `Count` below the `Limit` therefore leaves it open whether the collection is exhausted. A page can
even come back with no items at all and a `LastEvaluatedKey`, when the filter dropped every item on
it. Loop until the token is gone. A short or empty page proves nothing on its own.

An item that lacks what the filter points at fails it. `status = :open` drops an item with no
`status`, the same way a condition on a write fails to hold for an attribute that is absent.

### What a filter may name

A `Query` filter may not name a key attribute, and a `Scan` filter may name any attribute at all. A
query has already narrowed the read by its `KeyConditionExpression`, and a filter on the partition
key or the sort key is either that condition written twice or a condition the key condition should
have carried. Real DynamoDB refuses it as a `ValidationException`, and so does this. A scan narrows
no read. There a key attribute is an attribute like any other.

The rule is about where a path starts, so `details.customerId` is allowed on a query with a
`customerId` partition key. It names an attribute of a map and not the key. Writing the key
attribute as an `ExpressionAttributeNames` placeholder gets past it no more easily.

The key condition and the filter share one set of placeholders. A `#name` or `:value` either of them
uses counts as used, and one that goes unused by both is refused the way an unused placeholder
always is.

### Projecting a read

`ProjectionExpression` names the attributes a `Query` or a `Scan` answers with, the way it does on
[a GetItem](#projecting-attributes). Only the paths it names come back. The key attributes the read
walked by are left out along with everything else. That is what makes a projection usable as an
allow-list over what leaves the table.

The projection runs after the filter, and an attribute the filter tested can be left out of the
answer.

```typescript sim-dynamodb-scan-projection
/**
 * Scanning a table without reading the attributes the caller has no use for.
 */

import {
  CreateTableCommand,
  PutItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "ReadersTable",
    KeySchema: [{ AttributeName: "readerId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "readerId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "ReadersTable",
    Item: {
      readerId: { S: "reader-1" },
      email: { S: "reader@example.com" },
      status: { S: "active" },
      lastReadAt: { S: "2026-01-31" },
    },
  }),
);

const output = await dynamoDb.scan(
  new ScanCommand({
    TableName: "ReadersTable",
    // `status` is a DynamoDB reserved word, so it is named by a placeholder.
    ProjectionExpression: "#status, lastReadAt",
    ExpressionAttributeNames: { "#status": "status" },
  }),
);

// The key the scan walked by is left out along with the email address.
console.log(Object.keys(output.Items?.[0] ?? {}));
// [ "status", "lastReadAt" ]

console.log(output.Items?.[0]?.["lastReadAt"]?.S);
// 2026-01-31
```

`Count` and `ScannedCount` count items. A projection cuts each item down and moves neither figure.

`LastEvaluatedKey` names the item a page stopped on by its key, whether or not the projection asked
for those attributes. A paged read resumes from a token the items it answered with do not carry.

The key condition, the filter and the projection share one set of placeholders. A `#name` or
`:value` any of them uses counts as used, and one none of them uses is refused the way an unused
placeholder always is.

On a global secondary index a projection may name only the attributes the index projects. Anything
else is a `ValidationException`, the refusal a filter naming the same attribute gets. A local
secondary index fetches from the base table, and any attribute of the item is nameable there.

### Counting and projecting with Select

`Select` says which attributes a read answers with. A table read defaults to `ALL_ATTRIBUTES`,
meaning whole items.

`COUNT` answers with `Count` and `ScannedCount` and no `Items` at all, as at the end of the example
above. It reads and filters the same items, and leaves them out of the response. `Limit` and
`LastEvaluatedKey` page a counted read the same way.

The other two values are held to the rules AWS holds them to, each a `ValidationException`:

- `SPECIFIC_ATTRIBUTES` needs a `ProjectionExpression` to name what to answer with.
- a `ProjectionExpression` alongside any `Select` other than `SPECIFIC_ATTRIBUTES`. That one is the
  `Select` that projects. Writing a `ProjectionExpression` and no `Select` at all is fine.
- `ALL_PROJECTED_ATTRIBUTES` without an `IndexName`. It asks for the attributes an index projects,
  and a table read has no index to project from.

`SPECIFIC_ATTRIBUTES` alongside a `ProjectionExpression` answers with the attributes that
projection names. See [projecting a read](#projecting-a-read).

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
deleting a key that is already free succeeds. Neither answers with the item it wrote over. A batch
has no `ReturnValues`, and no `ConditionExpression` either. A conditional write is what `PutItem`,
`DeleteItem` and `UpdateItem` are for.

Six things take the whole batch down rather than one entry of it, leaving no write behind:

- a table that is absent
- key attributes that do not match the table's key schema
- more than one operation on the same item of one table
- one table named twice, once by its name and once by its ARN
- more than 25 write requests, counted across every table the request names
- an item over the 400 KB an item holds

Real DynamoDB also refuses a request over 16 MB. That one is absent, for the reason under
Limitations.

The same key in two different tables is two items, never one. A batch may write both.

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

An item that was never written is left out of `Responses`, with no placeholder standing in for it,
so what came back is what was there. A table that held none of the keys it was asked for is still in
`Responses`, with an empty list. DynamoDB reads a batch in parallel and answers in no particular
order, and a caller that needs to tell its items apart reads the key attributes off them rather than
counting on where they are in the list.

More than 100 keys in one call, counted across every table the request names, is a
`ValidationException`. So is the same key twice for one table, and so is one table named twice, once
by its name and once by its ARN.

Both commands answer with the map of what they could not get to, `UnprocessedItems` for a write and
`UnprocessedKeys` for a read. Both are always empty here, since no request is throttled, but they
are there all the same. The retry loop real code is written around still terminates:

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
table. A `ConditionCheck` writes nothing. It is how a transaction says that an item it is leaving
alone has to hold for the items it is changing to be written.

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
have no `Exception` suffix. A failed condition reads as `ConditionalCheckFailed`, never as the
`ConditionalCheckFailedException` a single `PutItem` throws.

An action that sets `ReturnValuesOnConditionCheckFailure` to `ALL_OLD` gets `Item` on its
cancellation reason, holding the item as it was, and a retry needs no second read.

These refuse the request outright rather than cancelling it, with no write either way:

- more than 100 actions
- an action carrying more than one of `Put`, `Update`, `Delete` and `ConditionCheck`, or none of
  them
- two actions on the same item of one table
- a table that is absent, or a key that fails to match its key schema
- an update that would move the item's primary key
- an item carrying a secondary index key attribute as a type the index did not declare
- an update that would take the item past the 400 KB one item holds

One table may be named as often as the transaction likes, and that is the difference from a batch.
What it may not do is touch one item twice.

### Retrying a transaction

`ClientRequestToken` makes a retry idempotent. Replaying a token with the same actions inside ten
minutes succeeds without applying the writes again, and replaying it with different actions gives
`IdempotentParameterMismatchException`. Only a transaction that was applied is remembered, so
retrying one that was cancelled runs it again.

The ten minutes are measured on the simulated clock. A test moves past the window rather than
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

`TransactGetItems` reads up to 100 items in one step, and is always strongly consistent. There is no
`ConsistentRead` to set. Each `Get` names its own table, and takes a `ProjectionExpression`.

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

### Transactions through the document client

`TransactWriteCommand` and `TransactGetCommand` from `@aws-sdk/lib-dynamodb` reach the same two
operations. Every action's `Item`, `Key` and `ExpressionAttributeValues` are converted on the way in,
and the `Item` of each `Responses` entry on the way out.

```typescript sim-dynamodb-document-transactions
/**
 * Writing an order and the claim on its code together, in plain JavaScript.
 */

import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  TransactGetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();

const documents = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "eu-west-2" }),
);
simSdk.intercept(documents);

for (const [tableName, keyName] of [
  ["OrdersTable", "orderId"],
  ["ClaimsTable", "code"],
] as const) {
  await documents.send(
    new CreateTableCommand({
      TableName: tableName,
      KeySchema: [{ AttributeName: keyName, KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: keyName, AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
}
await simSdk.simAws.backgroundTasksComplete();

const claim = {
  TableName: "ClaimsTable",
  ConditionExpression: "attribute_not_exists(code)",
};

// The order and the claim on its code go in together.
await documents.send(
  new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: "OrdersTable",
          Item: { orderId: "order-1", total: 42, lines: [{ sku: "widget" }] },
        },
      },
      { Put: { ...claim, Item: { code: "ABC123", orderId: "order-1" } } },
    ],
  }),
);

const read = await documents.send(
  new TransactGetCommand({
    TransactItems: [
      { Get: { TableName: "OrdersTable", Key: { orderId: "order-1" } } },
      { Get: { TableName: "ClaimsTable", Key: { code: "ABC123" } } },
    ],
  }),
);

const lines = read.Responses?.[0]?.Item?.["lines"] as { sku: string }[];
console.log(lines[0]?.sku); // widget
console.log(read.Responses?.[1]?.Item?.["orderId"]); // order-1

// A second order wanting the same code loses the claim, and loses the order
// with it.
try {
  await documents.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: "OrdersTable",
            Item: { orderId: "order-2", total: 7 },
          },
        },
        { Put: { ...claim, Item: { code: "ABC123", orderId: "order-2" } } },
      ],
    }),
  );
} catch (error) {
  const cancelled = error as {
    name: string;
    CancellationReasons?: { Code: string }[];
  };

  console.log(cancelled.name); // "TransactionCanceledException"
  console.log(cancelled.CancellationReasons?.map((reason) => reason.Code));
  // ["None", "ConditionalCheckFailed"]
}

const second = await documents.send(
  new TransactGetCommand({
    TransactItems: [
      { Get: { TableName: "OrdersTable", Key: { orderId: "order-2" } } },
    ],
  }),
);

console.log(second.Responses?.[0]); // {}
```

`CancellationReasons` arrive as the low-level Command reports them. There is one per action, in
`TransactItems` order. A reason's `Item` holds AttributeValues, because a cancelled transaction is
thrown, and the real document client converts nothing on the way out of a transactional write.

## Expiring items with time to live

`UpdateTimeToLive` names the attribute a table expires items by, and `DescribeTimeToLive` reports
it. The attribute holds epoch seconds in a Number. An item without it, or holding a String or
anything else, never expires, and that is allowed. Nor does an item whose timestamp is more than
five years in the past, which DynamoDB treats as a malformed value rather than as long overdue.

Expiry runs on [the simulated clock](https://yulinsim.dev/time/). Moving the clock forward is what deletes items
whose time to live has run out, so one `advanceBy` expires a table's sessions alongside whatever
else that advance causes elsewhere in the simulation. That is the only call a test has.

Deletion is not immediate. Real DynamoDB marks an item expired at its timestamp and deletes it
typically within 48 hours, and reads keep returning it until then. That gap is simulated, and a test
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
work has run, following the sequence a table's own status goes through. Switching it off goes
through `DISABLING` to `DISABLED`, and a `DISABLED` table reports no attribute name.

An `UpdateTimeToLive` asking for the state the table is already in is a `ValidationException`, as it
is on AWS, so code that has to be idempotent reads `DescribeTimeToLive` first. Changing the
attribute an enabled table expires by means switching time to live off and then on again.

DynamoDB also takes one `UpdateTimeToLive` per table per hour. That hour is measured on the
simulated clock. A second call inside it is a `ValidationException` and `simAws.clock().advanceBy({
hours: 1 })` is what lets the next one through.

Switching time to live on reaches the items already on the table, since their attributes were only
inert while it was off. A removal already scheduled is checked again when it comes due. An item
overwritten with a later timestamp, or one on a table whose time to live has since been switched
off, stays where it is.

## Capturing changes with a stream

A `StreamSpecification` on `CreateTable` gives a table a stream, and every change to an item is
captured on it as a record. That is an `INSERT` for the first write of an item, a `MODIFY` for a
write over one that was there, and a `REMOVE` for a deletion. `DescribeTable` reports the
specification back along with `LatestStreamArn` and `LatestStreamLabel`.

Which images a record carries is what `StreamViewType` chooses, and every record carries the keys of
the item that changed whichever one it is:

| `StreamViewType`     | `INSERT`        | `MODIFY`          | `REMOVE`        |
| -------------------- | --------------- | ----------------- | --------------- |
| `KEYS_ONLY`          | keys            | keys              | keys            |
| `NEW_IMAGE`          | keys, new image | keys, new image   | keys            |
| `OLD_IMAGE`          | keys            | keys, old image   | keys, old image |
| `NEW_AND_OLD_IMAGES` | keys, new image | keys, both images | keys, old image |

A `REMOVE` under `NEW_IMAGE` and an `INSERT` under `OLD_IMAGE` are keys and nothing else, because
the view type asks for an image the record lacks. The record is still written, since it is how a
reader learns that the change happened at all.

```typescript sim-dynamodb-stream-specification
/**
 * A table capturing its item changes on a stream.
 */

import {
  CreateTableCommand,
  DescribeTableCommand,
  PutItemCommand,
  UpdateTableCommand,
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
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: "NEW_AND_OLD_IMAGES",
    },
  }),
);
await simAws.backgroundTasksComplete();

const described = await dynamoDb.describeTable(
  new DescribeTableCommand({ TableName: "OrdersTable" }),
);

console.log(described.Table?.StreamSpecification?.StreamViewType); // "NEW_AND_OLD_IMAGES"
console.log(described.Table?.LatestStreamArn?.includes("/stream/")); // true

// Every write from here is captured on the stream.
await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "OrdersTable",
    Item: { orderId: { S: "order-1" }, total: { N: "101" } },
  }),
);

// Switching the stream off keeps what it captured, and keeps naming it.
await dynamoDb.updateTable(
  new UpdateTableCommand({
    TableName: "OrdersTable",
    StreamSpecification: { StreamEnabled: false },
  }),
);
await simAws.backgroundTasksComplete();

const withoutStream = await dynamoDb.describeTable(
  new DescribeTableCommand({ TableName: "OrdersTable" }),
);

console.log(withoutStream.Table?.StreamSpecification?.StreamEnabled); // false
console.log(withoutStream.Table?.LatestStreamArn !== undefined); // true
```

`UpdateTable` switches a stream on for a table that has none and off for one that has one. A
`StreamViewType` belongs to the stream rather than to the table, and there is no changing it in
place. Switching the stream off and on again is what AWS makes an application do, and gives the
table a stream with a fresh label and ARN. Asking to switch on a stream that is already on, or off
one that is absent, is a `ValidationException` either way.

A time to live expiry is captured as a `REMOVE` carrying `userIdentity: { type: "Service",
principalId: "dynamodb.amazonaws.com" }`, where a deletion the application asked for carries none.
That is how a stream consumer tells an item it deleted from one DynamoDB collected.

Nothing is captured for a write that never reached the item, such as a refused conditional write, a
cancelled transaction, a delete of a key holding nothing, or a request the table refused. Deleting
the table takes its items with it in one go. No record is captured for that either.

## Reading a stream's records

Reading the records back is the DynamoDB Streams API, which AWS puts behind a client of its own.
`simAws.dynamoDbStreams()` is that API here, with `ListStreams`, `DescribeStream`,
`GetShardIterator` and `GetRecords`.

Reading a stream takes four calls the first time. `ListStreams` finds the stream ARN for a table,
`DescribeStream` reports the shard, `GetShardIterator` says where on that shard to start, and
`GetRecords` reads from there and hands back the iterator to carry on with.

```typescript sim-dynamodb-stream-records
/**
 * Reading a table's captured changes back off its stream.
 */

import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  DescribeStreamCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  ListStreamsCommand,
} from "@aws-sdk/client-dynamodb-streams";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();
const dynamoDbStreams = simAws.dynamoDbStreams();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: "NEW_AND_OLD_IMAGES",
    },
  }),
);
await simAws.backgroundTasksComplete();

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "OrdersTable",
    Item: { orderId: { S: "order-1" }, total: { N: "101" } },
  }),
);

const listed = await dynamoDbStreams.listStreams(
  new ListStreamsCommand({ TableName: "OrdersTable" }),
);
const streamArn = listed.Streams?.[0]?.StreamArn;

const described = await dynamoDbStreams.describeStream(
  new DescribeStreamCommand({ StreamArn: streamArn }),
);
const shardId = described.StreamDescription?.Shards?.[0]?.ShardId;

console.log(described.StreamDescription?.StreamStatus); // "ENABLED"

const iterator = await dynamoDbStreams.getShardIterator(
  new GetShardIteratorCommand({
    StreamArn: streamArn,
    ShardId: shardId,
    ShardIteratorType: "TRIM_HORIZON",
  }),
);

const read = await dynamoDbStreams.getRecords(
  new GetRecordsCommand({ ShardIterator: iterator.ShardIterator }),
);

console.log(read.Records?.[0]?.eventName); // "INSERT"
console.log(read.Records?.[0]?.dynamodb?.NewImage?.["total"]?.N); // "101"

// The iterator to poll with next, which is there while the stream is open.
console.log(read.NextShardIterator !== undefined); // true
```

A record carries `eventID`, `eventName`, `eventSource`, `awsRegion` and a `dynamodb` body holding
`Keys`, the images the view type selects, `SequenceNumber`, `SizeBytes` and
`ApproximateCreationDateTime`. A time to live removal carries `userIdentity: { PrincipalId:
"dynamodb.amazonaws.com", Type: "Service" }`. The Streams API capitalizes those two fields where the
Lambda event carries the same values as `principalId` and `type`. A consumer written against one
shape fails to read the other.

### Where to start reading

`ShardIteratorType` picks the place on the shard an iterator starts at.

| `ShardIteratorType`     | Starts at                                |
| ----------------------- | ---------------------------------------- |
| `TRIM_HORIZON`          | the oldest record the stream still holds |
| `LATEST`                | just after the newest record on it       |
| `AT_SEQUENCE_NUMBER`    | the record the `SequenceNumber` names    |
| `AFTER_SEQUENCE_NUMBER` | the record following the one it names    |

`AT_SEQUENCE_NUMBER` and `AFTER_SEQUENCE_NUMBER` need a `SequenceNumber`, and the other two are
refused if given one, since an iterator asking for both is saying two different things about where
to start.

### Polling with NextShardIterator

`GetRecords` answers with the iterator to use for the next call. Reading a stream to the end and
polling it is the same loop either way. Pass each `NextShardIterator` to the following `GetRecords`.

One `GetRecords` hands back at most 1000 records, and a reader with more than that behind it stays
behind until it polls again. `Limit` asks for fewer, and a `Limit` above 1000 is a
`ValidationException`.

An empty `Records` array alongside a `NextShardIterator` is the ordinary answer for a reader that
has caught up, and means to look again, and not that anything is wrong. `NextShardIterator` is
absent only when the shard is closed and the reader has reached the end of it, which happens once
the table has switched the stream off and everything on it has been read.

### The 24 hour retention window

A stream keeps its records for 24 hours on the simulated clock, and the trim is applied when the
stream is read. Reading from a position the stream no longer holds raises a
`TrimmedDataAccessException`, whether the sequence number was named in a `GetShardIterator` call or
carried in an iterator that was still good when it was handed out. `TRIM_HORIZON` never raises it,
since it means the oldest record still there, whatever has gone.

A stream stays listable and readable after its table switches it off, and after everything on it has
been trimmed. A trimmed stream reads as empty, never as missing.

### Delivering a stream to a Lambda function

Most applications consume a stream by having a Lambda function run on it rather than by polling it
themselves, and that is a
[Lambda event source mapping](https://yulinsim.dev/services/lambda/#triggering-a-function-from-a-dynamodb-stream "Simulated Lambda event source mapping docs").
Create the mapping, write to the table, and the function is invoked with the changes. The
`GetRecords` loop above is still there for a consumer that wants to read a stream directly.

## Numbers

A DynamoDB number carries up to 38 significant digits, where a JavaScript number carries about 15.
Numbers are held here as the digits they were written with. An identifier, a monetary amount or a
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

The digits are normalised the way DynamoDB normalises them. Leading and trailing zeros are trimmed,
and an exponent is worked back into plain notation, so `1E5` and `100000.00` are the same number.
That is what makes `{ N: "1" }` and `{ N: "1.0" }` the same key.

A number with more than 38 significant digits, or outside the range `1E-130` to
`9.9999999999999999999999999999999999999E+125` and its negative mirror, is a `ValidationException`.

## Sets, lists and maps

A set holds one kind of value, holds at least one, and holds each value once. Binary members compare
by their bytes, so two `Uint8Array` values holding the same bytes are one member and are refused as
a duplicate.

Lists and maps nest up to 32 levels, and one item is at most 400 KB counting its attribute names as
well as its values. Both are `ValidationException` when exceeded.

## The document client

`@aws-sdk/lib-dynamodb` takes plain JavaScript values rather than AttributeValues. Intercept a
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

`PutCommand`, `GetCommand`, `DeleteCommand`, `UpdateCommand`, `QueryCommand`, `ScanCommand`,
`BatchWriteCommand`, `BatchGetCommand`, `TransactWriteCommand` and `TransactGetCommand` are
converted. The two transactional ones have
[a section of their own](#transactions-through-the-document-client). A document Command with no route
here, such as the PartiQL `ExecuteStatementCommand`, is refused by name before anything tries to
convert its values.

Intercept the document client itself. `DynamoDBDocumentClient.from(client)` builds a separate object
outside the `DynamoDBClient` class, so intercepting the base client leaves Commands sent through the
document one untouched. See [the SDK docs](https://yulinsim.dev/sdk/#the-dynamodb-document-client).

### Querying and scanning through the document client

`@aws-sdk/lib-dynamodb` names its `QueryCommand` and `ScanCommand` exactly as
`@aws-sdk/client-dynamodb` does. Both are routed, and which one a request gets is decided by the
Command it was sent with rather than by the name. The two can be used on the same intercepted
client.

Expression values and `ExclusiveStartKey` are converted on the way in, and `Items` and
`LastEvaluatedKey` on the way out. A key from one page goes straight back in as the start of the
next, so `paginateQuery` and `paginateScan` work as they are.

```typescript sim-dynamodb-document-read
/**
 * Querying a simulated table through the document client, a page at a time.
 */

import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  paginateQuery,
  PutCommand,
  QueryCommand,
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
    KeySchema: [
      { AttributeName: "customerId", KeyType: "HASH" },
      { AttributeName: "orderId", KeyType: "RANGE" },
    ],
    AttributeDefinitions: [
      { AttributeName: "customerId", AttributeType: "S" },
      { AttributeName: "orderId", AttributeType: "S" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simSdk.simAws.backgroundTasksComplete();

for (const orderId of ["order-1", "order-2"]) {
  await documents.send(
    new PutCommand({
      TableName: "OrdersTable",
      Item: { customerId: "cust-1", orderId, total: 42 },
    }),
  );
}

const query = {
  TableName: "OrdersTable",
  KeyConditionExpression: "customerId = :customer",
  ExpressionAttributeValues: { ":customer": "cust-1" },
  Limit: 1,
};

const first = await documents.send(new QueryCommand(query));

console.log(first.Items?.[0]?.["total"]); // 42

// The key comes back as plain JavaScript, and goes back in as it is.
const second = await documents.send(
  new QueryCommand({ ...query, ExclusiveStartKey: first.LastEvaluatedKey }),
);

console.log(second.Items?.[0]?.["orderId"]); // order-2

// The paginators send the same Commands, so they need nothing extra. Each one
// writes the next start key into the input it was given, so it gets a copy.
const pages = paginateQuery({ client: documents, pageSize: 1 }, { ...query });

for await (const page of pages) {
  console.log(page.Items?.length); // 1
}
```

### Which native types map to which descriptors

| Written as                                        | Stored as | Read back as                |
| ------------------------------------------------- | --------- | --------------------------- |
| `string`                                          | `S`       | `string`                    |
| `number`                                          | `N`       | `number`                    |
| `bigint`                                          | `N`       | `number` or `bigint`        |
| `NumberValue`                                     | `N`       | `number` or `bigint`        |
| `boolean`                                         | `BOOL`    | `boolean`                   |
| `null`                                            | `NULL`    | `null`                      |
| `Uint8Array`, `Buffer` and the other typed arrays | `B`       | `Uint8Array`                |
| `Set` of strings                                  | `SS`      | `Set` of strings            |
| `Set` of numbers, bigints or `NumberValue`        | `NS`      | `Set` of numbers or bigints |
| `Set` of binary                                   | `BS`      | `Set` of binary             |
| `Array`                                           | `L`       | `Array`                     |
| plain object, `Map`                               | `M`       | plain object                |

A class instance goes unconverted. The real document client refuses one unless it was built with
`convertClassInstanceToMap`, and an object with behaviour is never quietly flattened into
attributes.

### Numbers through the document client

A simulated table holds a number's digits exactly, but the document client converts to and from
JavaScript numbers, and that is where digits are lost. It is the same loss AWS has. A test that
passes here is telling you something true about the real thing.

- Writing a `number` outside the safe integer range is refused, never stored already rounded. Write
  a `bigint`, or a `NumberValue` from `@aws-sdk/lib-dynamodb`, to keep the digits.
- Reading a stored number outside the safe integer range gives a `bigint`.
- Reading a stored decimal with more digits than a JavaScript number carries gives a rounded
  `number`. The table still holds every digit, and the rounding is the document client's. Read
  through an ordinary `GetItemCommand` to see the stored digits.
- Reading a stored number that is outside the safe integer range and carrying a fraction is refused,
  since there is no value it could answer with.

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
account and region. The table is created through `CreateTable`. A template-created table is the same
thing an SDK caller would get, with the same name validation, the same key schema and attribute
definition rules, and the same ARN.

`Ref` on the resource gives the table name, as it does on real AWS, and it can be handed straight to
`PutItem`. `Fn::GetAtt … Arn` gives the table ARN, and an IAM policy names it by that.

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
const tableName = stack.output("OrdersTableName");

console.log(tableName);
// "orders-stack-OrdersTable"

await simAws
  .dynamoDb()
  .putItem(
    new PutItemCommand({ TableName: tableName, Item: { id: { S: "1" } } }),
  );

console.log(stack.output("OrdersTableArn"));
// "arn:aws:dynamodb:us-east-1:888888888888:table/orders-stack-OrdersTable"
```

The properties that are read are `TableName`, `KeySchema`, `AttributeDefinitions`, `BillingMode`,
`ProvisionedThroughput`, `TableClass`, `DeletionProtectionEnabled`, `Tags`,
`GlobalSecondaryIndexes`, `LocalSecondaryIndexes`, `StreamSpecification` and
`TimeToLiveSpecification`. All but the last are passed to `CreateTable`, never applied here. A value
the template gets wrong fails the same way it would for an SDK caller.

`TimeToLiveSpecification` is applied after the table is created, through `UpdateTimeToLive`. Real
`CreateTable` has no parameter for it either, so real CloudFormation makes the table and then
updates it. A specification the template got wrong is refused in the words `UpdateTimeToLive`
refuses it in.

A table with no `TableName` is named after the stack, its logical ID and a tail derived from both.
The table above with its name left out would be `orders-stack-OrdersTable-` and twelve more
characters, where real CloudFormation ends the name in twelve random ones. Two stacks deploying the
same template get two differently named tables. The name is trimmed to the 255 characters a table
name allows, and [the CloudFormation docs](https://yulinsim.dev/services/cloudformation/#names-cloudformation-generates "Names CloudFormation generates")
cover how the stack name and the logical ID share what is left.

`Fn::GetAtt … StreamArn` gives the ARN of the stream the table's `StreamSpecification` gave it. On a
table with no `StreamSpecification` it is refused by name, naming the table, since an invented
stream ARN would read as a working stream to whatever the template handed it to. Real CloudFormation
refuses the same template while validating it, where this refuses when the attribute is asked for.

A property with behaviour that is absent is left out and recorded in
[`stack.ignoredProperties`](https://yulinsim.dev/services/cloudformation/#properties-a-resource-was-created-without),
and the table is created and the rest of the stack still deploys. Those properties are
`KinesisStreamSpecification`, `SSESpecification`, `PointInTimeRecoverySpecification`,
`ContributorInsightsSpecification`, `ImportSourceSpecification`, `ResourcePolicy`,
`OnDemandThroughput` and `WarmThroughput`. A property `AWS::DynamoDB::Table` lacks is recorded the
same way, so a typo or a property AWS added since this list was written.

`AWS::DynamoDB::GlobalTable` deploys a table as well, under
[deploying a global table](#deploying-a-global-table-from-cloudformation).

CDK works without hand-editing. A `dynamodb.Table` synthesises a template that deploys here, with
the table name reaching a function through its environment and a grant policy naming the table by
the ARN `Fn::GetAtt` gives.

## Deploying a table with secondary indexes

`GlobalSecondaryIndexes` and `LocalSecondaryIndexes` are read off the resource and handed to
`CreateTable` with the rest of the table. An index a template declared is the index an SDK caller
would have got. It is queried and scanned the same way.

```typescript sim-dynamodb-cloudformation-indexes
/**
 * Deploying a table with secondary indexes from a CloudFormation template.
 */

import { PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrdersTable: {
        Type: "AWS::DynamoDB::Table",
        Properties: {
          TableName: "orders",
          KeySchema: [
            { AttributeName: "customerId", KeyType: "HASH" },
            { AttributeName: "orderId", KeyType: "RANGE" },
          ],
          AttributeDefinitions: [
            { AttributeName: "customerId", AttributeType: "S" },
            { AttributeName: "orderId", AttributeType: "S" },
            { AttributeName: "status", AttributeType: "S" },
            { AttributeName: "total", AttributeType: "N" },
          ],
          BillingMode: "PAY_PER_REQUEST",
          GlobalSecondaryIndexes: [
            {
              IndexName: "byStatus",
              KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
              Projection: { ProjectionType: "ALL" },
            },
          ],
          LocalSecondaryIndexes: [
            {
              IndexName: "byTotal",
              KeySchema: [
                { AttributeName: "customerId", KeyType: "HASH" },
                { AttributeName: "total", KeyType: "RANGE" },
              ],
              Projection: { ProjectionType: "ALL" },
            },
          ],
        },
      },
    },
  },
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();

await simAws.dynamoDb().putItem(
  new PutItemCommand({
    TableName: "orders",
    Item: {
      customerId: { S: "customer-1" },
      orderId: { S: "order-1" },
      status: { S: "OPEN" },
      total: { N: "42" },
    },
  }),
);

// The global index is keyed by a partition key the table does not have.
const open = await simAws.dynamoDb().query(
  new QueryCommand({
    TableName: "orders",
    IndexName: "byStatus",
    KeyConditionExpression: "#status = :status",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":status": { S: "OPEN" } },
  }),
);

console.log(open.Items?.[0]?.["orderId"]?.S); // "order-1"

// The local index sorts one customer's orders by total.
const byTotal = await simAws.dynamoDb().query(
  new QueryCommand({
    TableName: "orders",
    IndexName: "byTotal",
    KeyConditionExpression: "customerId = :customerId",
    ExpressionAttributeValues: { ":customerId": { S: "customer-1" } },
  }),
);

console.log(byTotal.Count); // 1
```

Which properties an index entry may carry is decided here, and no other part of an index is. A
template declaring an index whose key attributes are missing from `AttributeDefinitions` fails that
resource with the error the API gives for the same input. The same goes for the projection rules,
the per-index throughput a provisioned table needs, and the rule that a local secondary index shares
the table's partition key.

`ContributorInsightsSpecification`, `OnDemandThroughput` and `WarmThroughput` on a global secondary
index are absent. The index is created without them and the record names the index it was on, such
as `GlobalSecondaryIndexes.0.WarmThroughput`. `LocalSecondaryIndexes` entries have `IndexName`,
`KeySchema` and `Projection` alone, so anything further on one is recorded the same way. A
`ProvisionedThroughput` there still fails the resource, because an index entry goes to `CreateTable`
as the template wrote it and real DynamoDB refuses capacity on a local index.

A CDK `Table` with `addGlobalSecondaryIndex` and `addLocalSecondaryIndex` synthesises a template
that deploys here without hand-editing.

## Deploying a table with a stream

A `StreamSpecification` on the resource deploys a table with a stream, and `Fn::GetAtt … StreamArn`
gives the stream's ARN. CloudFormation's `StreamSpecification` has no `StreamEnabled` field, unlike
the SDK's. Declaring the property is what asks for the stream, and `StreamViewType` is required.

```typescript sim-dynamodb-cloudformation-stream
/**
 * Deploying a table with a stream from a CloudFormation template.
 */

import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  DescribeStreamCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
} from "@aws-sdk/client-dynamodb-streams";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrdersTable: {
        Type: "AWS::DynamoDB::Table",
        Properties: {
          TableName: "orders",
          KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
          AttributeDefinitions: [
            { AttributeName: "orderId", AttributeType: "S" },
          ],
          BillingMode: "PAY_PER_REQUEST",
          StreamSpecification: { StreamViewType: "NEW_AND_OLD_IMAGES" },
        },
      },
    },
    Outputs: {
      OrdersStreamArn: {
        Value: { "Fn::GetAtt": ["OrdersTable", "StreamArn"] },
      },
    },
  },
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();

// The Output holds the ARN of the stream the deployed table captures on.
const streamArn = stack.output("OrdersStreamArn");

console.log(streamArn.includes("/stream/")); // true

await simAws.dynamoDb().putItem(
  new PutItemCommand({
    TableName: "orders",
    Item: { orderId: { S: "order-1" }, total: { N: "101" } },
  }),
);

// The write is on the stream, read the way any consumer reads it.
const dynamoDbStreams = simAws.dynamoDbStreams();

const described = await dynamoDbStreams.describeStream(
  new DescribeStreamCommand({ StreamArn: streamArn }),
);

const iterator = await dynamoDbStreams.getShardIterator(
  new GetShardIteratorCommand({
    StreamArn: streamArn,
    ShardId: described.StreamDescription?.Shards?.[0]?.ShardId,
    ShardIteratorType: "TRIM_HORIZON",
  }),
);

const read = await dynamoDbStreams.getRecords(
  new GetRecordsCommand({ ShardIterator: iterator.ShardIterator }),
);

console.log(read.Records?.[0]?.eventName); // "INSERT"
```

The specification goes to `CreateTable` with the rest of the table, and a template naming a view
type that is absent, or naming none at all, is refused in the words `CreateTable` refuses an SDK
caller in.

`StreamSpecification.ResourcePolicy` is a policy on the stream rather than on the table. It is
absent. The table is created without it and the whole property path is recorded in
[`stack.ignoredProperties`](https://yulinsim.dev/services/cloudformation/#properties-a-resource-was-created-without).

Changing `StreamViewType` in a deployed template is a different thing here to what it is on real
CloudFormation, which replaces the table. `UpdateTable` refuses the change in place, so switching
the stream off and on again is what gives a table a stream with a different view type.

## Deploying a global table from CloudFormation

An `AWS::DynamoDB::GlobalTable` naming one replica deploys an ordinary simulated table in that
region, because with one replica that is what it is. It is turned into the `AWS::DynamoDB::Table` it
is and created down the path above. It is the same table with the same rules behind it.

That is the resource CDK's `TableV2` synthesises for every table it makes, whether or not any
replica regions were asked for, since it always appends the stack's own region. So a `TableV2` stack
deploys here without hand-editing, the same way a `dynamodb.Table` one does.

```typescript sim-dynamodb-cloudformation-global-table
/**
 * Deploying a global table with one replica from a CloudFormation template.
 */

import { PutItemCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrdersTable: {
        Type: "AWS::DynamoDB::GlobalTable",
        Properties: {
          TableName: "orders",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
          BillingMode: "PAY_PER_REQUEST",
          // The replica carries what an ordinary table says about itself.
          Replicas: [
            {
              Region: "us-east-1",
              Tags: [{ Key: "Environment", Value: "test" }],
            },
          ],
        },
      },
    },
    Outputs: {
      OrdersTableName: { Value: { Ref: "OrdersTable" } },
    },
  },
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();

const tableName = stack.output("OrdersTableName");

console.log(tableName);
// "orders"

await simAws
  .dynamoDb()
  .putItem(
    new PutItemCommand({ TableName: tableName, Item: { id: { S: "1" } } }),
  );
```

`Ref` gives the table name, as it does for `AWS::DynamoDB::Table`. `Fn::GetAtt` answers for `Arn`,
`StreamArn` and `TableId`, which are the attributes the resource type documents. `TableId` is the
one an ordinary table has no attribute for at all.

The replica carries the settings an ordinary table carries itself. `TableClass`,
`DeletionProtectionEnabled` and `Tags` are read off it rather than off the table. Everything else a
global table states the same way an ordinary one does is handed on as it was written. That covers
`TableName`, `KeySchema`, `AttributeDefinitions`, `BillingMode`, `LocalSecondaryIndexes`,
`StreamSpecification` and `TimeToLiveSpecification`.

Capacity is the one thing a global table splits in two. Writes are the table's, in
`WriteProvisionedThroughputSettings`, since every replica takes the same writes, and reads belong to
the replica, in `ReadProvisionedThroughputSettings`. With one replica there is one of each, and they
go back together into the `ProvisionedThroughput` `CreateTable` takes. A global secondary index is
split the same way. The table declares the index and provisions its writes, and the replica's
`GlobalSecondaryIndexes` entry names that index and provisions its reads.

A global table naming two or more replica regions is created as an ordinary table in the region the
stack is deploying into, with `Replicas` recorded in
[`stack.ignoredProperties`](https://yulinsim.dev/services/cloudformation/#properties-a-resource-was-created-without)
naming the regions. Replication genuinely is absent, so everything the table does within one region
behaves as the template describes and nothing is copied to the others.

A global table with no `Replicas` at all fails the resource, since `Replicas` is required and real
CloudFormation refuses that template too. So does one whose single replica names a region outside
the stack's own, since the replica list has to include the region the table would be created in.

A property with behaviour that is absent skips the resource, in the same terms an
`AWS::DynamoDB::Table` one does. Those are `MultiRegionConsistency`, `SSESpecification`,
`WarmThroughput` and `WriteOnDemandThroughputSettings` on the table, and
`PointInTimeRecoverySpecification`, `KinesisStreamSpecification`,
`ContributorInsightsSpecification`, `ResourcePolicy`, `SSESpecification` and
`ReadOnDemandThroughputSettings` on the replica. Capacity that scales with load skips the resource
too, since no process here scales it, namely `WriteCapacityAutoScalingSettings` and
`ReadCapacityAutoScalingSettings`. A property `AWS::DynamoDB::GlobalTable` lacks fails the resource
instead.

## IAM authorization

`CreateTable` authorizes `dynamodb:CreateTable` against the ARN the table is about to have, before
it looks the name up. A caller with no permission is denied whether or not the name is free, and an
unauthorized caller cannot find out which names are taken.

`DescribeTable`, `PutItem`, `GetItem`, `DeleteItem` and `UpdateItem` authorize against the table ARN
in the same way, each against the `dynamodb:` action of its own name. `ListTables` names no table.
It authorizes against `*`.

A transaction is authorized as the operations it is made of rather than as itself. Each action of a
`TransactWriteItems` needs `dynamodb:PutItem`, `dynamodb:UpdateItem`, `dynamodb:DeleteItem` or
`dynamodb:ConditionCheckItem` against the table it names, and each `Get` of a `TransactGetItems`
needs `dynamodb:GetItem`. A caller refused any one of them is refused the whole transaction. No item
is written.

## Available functionality

- `CreateTable`, with table name, key schema, attribute definition, billing mode and throughput
  validation.
- `GlobalSecondaryIndexes` on `CreateTable`, with index name, key schema, projection and per-index
  throughput validation, `AttributeDefinitions` matched against every key schema in the request, and
  each index reported in the table description.
- `LocalSecondaryIndexes` on `CreateTable`, with the key schema rules that make an index local, the
  5 index cap, index names unique across both kinds, and each index reported in the table
  description.
- `IndexName` on `Query` and `Scan`, reading a sparse index of either kind by its own key schema,
  answering with the attributes it projects, and paging with a `LastEvaluatedKey` carrying the index
  key and the table key together. A local secondary index also answers a strongly consistent read,
  and fetches an unprojected attribute from the base table.
- `DescribeTable`, answering with the full table description, by table name or ARN.
- `ListTables`, ordered by UTF-8 bytes and paged with `Limit` and `ExclusiveStartTableName`.
- `DeleteTable`, following the table status DynamoDB moves a deleted table through, and refusing a
  table that is protected from deletion.
- `PutItem`, with the attribute value model behind it. Numbers keep their digits, sets compare by
  value, and key attributes are checked against what the table declared. It takes a table name or
  ARN and authorizes before the lookup.
- `GetItem`, answering with the item under a primary key, and with no `Item` at all when the key
  holds nothing.
- `ProjectionExpression` on `GetItem`, `Query` and `Scan`, with document paths, list indexing and
  `ExpressionAttributeNames` placeholders.
- `DeleteItem`, removing the item under a primary key and answering with it for `ALL_OLD`.
- `UpdateItem`, with `SET`, `REMOVE`, `ADD` and `DELETE` update expressions, `if_not_exists`,
  `list_append`, decimal arithmetic, list element paths, upserting when the key holds nothing, and
  all five `ReturnValues` modes. Every action reads the item as it stood before the update.
- `Query`, reading one item collection in sort key order, with the seven sort key conditions,
  `ScanIndexForward`, and `Limit`, `LastEvaluatedKey` and `ExclusiveStartKey` paging.
- `Scan`, reading every item in a table with the same paging, and `Segment` and `TotalSegments`
  dividing a table between parallel workers.
- `FilterExpression` on `Query` and `Scan`, applied after the `Limit` so that `ScannedCount` counts
  what was read and `Count` what survived, and refused on a `Query` when it names a key attribute.
- `Select` on `Query` and `Scan`, with `COUNT` answering with counts alone and the rules tying
  `SPECIFIC_ATTRIBUTES`, `ALL_PROJECTED_ATTRIBUTES` and a projection together.
- `ConditionExpression` on `PutItem`, `DeleteItem` and `UpdateItem`, with the six comparators,
  `BETWEEN`, `IN`, `AND`, `OR`, `NOT`, brackets, and the `attribute_exists`, `attribute_not_exists`,
  `attribute_type`, `begins_with`, `contains` and `size` functions.
- `BatchWriteItem`, putting and deleting items across tables in one call, with the 25 request cap,
  the whole batch refusals, and an empty `UnprocessedItems`.
- `BatchGetItem`, reading items across tables in one call, with `ConsistentRead` and
  `ProjectionExpression` per table, the 100 key cap, and an empty `UnprocessedKeys`.
- `TransactWriteItems`, applying up to 100 `Put`, `Update`, `Delete` and `ConditionCheck` actions in
  one step, with `TransactionCanceledException` carrying a cancellation reason per action, and
  `ClientRequestToken` making a retry idempotent for ten simulated minutes.
- `TransactGetItems`, reading up to 100 items in one step, with a positional `Responses` array in
  which a missing item is an entry with no `Item`.
- `UpdateTable`, doing one of a billing and throughput change, one global secondary index creation
  or one global secondary index deletion per call, with `TableClass` and `DeletionProtectionEnabled`
  riding along. The table moves through `UPDATING` while serving reads and writes, a new index
  reports `Backfilling` and refuses reads until it is `ACTIVE`, and a second update in flight gives
  `ResourceInUseException`.
- `Tags` on `CreateTable`, with `TagResource`, `UntagResource` and `ListTagsOfResource` addressing
  the table by ARN, the key, value and count rules DynamoDB applies, and `NextToken` paging.
- `UpdateTimeToLive` and `DescribeTimeToLive`, moving through `ENABLING` and `DISABLING` to settle,
  with the one update per hour rule measured on the simulated clock. Items expire as the clock moves
  past their deletion window, with no sweep for a test to call.
- `StreamSpecification` on `CreateTable` and `UpdateTable`, capturing every item change as a stream
  record with the images its `StreamViewType` selects, a time to live expiry carrying a `Service`
  `userIdentity`, and `StreamSpecification`, `LatestStreamArn` and `LatestStreamLabel` reported by
  `DescribeTable`.
- The DynamoDB Streams API through `simAws.dynamoDbStreams()`, with `ListStreams`, `DescribeStream`,
  `GetShardIterator` and `GetRecords`, all four shard iterator types, a `NextShardIterator` that is
  absent only for a closed and drained shard, and the 24 hour retention window with
  `TrimmedDataAccessException` past the trim point.
- `AWS::DynamoDB::Table` in CloudFormation, created through `CreateTable`, with `Ref` giving the
  table name, `Fn::GetAtt … Arn` the table ARN, `TimeToLiveSpecification` deploying a table that
  expires items, `Tags` deploying a tagged table, `GlobalSecondaryIndexes` and
  `LocalSecondaryIndexes` deploying a table whose indexes are then queried and scanned, and
  `StreamSpecification` deploying a table with a stream that `Fn::GetAtt … StreamArn` names.
- `AWS::DynamoDB::GlobalTable` in CloudFormation, where one replica deploys the same table the
  `AWS::DynamoDB::Table` path does, with the replica's `TableClass`, `DeletionProtectionEnabled` and
  `Tags` read off it, the table's writes and the replica's reads put back together into one
  provisioned capacity for the table and for each global secondary index, and `Ref`, `Fn::GetAtt …
Arn`, `Fn::GetAtt … StreamArn` and `Fn::GetAtt … TableId` answering. A CDK `TableV2` stack deploys
  through it without hand-editing.
- SDK interception, and an intercepted `DynamoDBClient` or `DynamoDBStreamsClient` reaches the
  simulation.
- The `@aws-sdk/lib-dynamodb` document client, with `PutCommand`, `GetCommand`, `DeleteCommand`,
  `UpdateCommand`, `QueryCommand`, `ScanCommand`, `BatchWriteCommand`, `BatchGetCommand`,
  `TransactWriteCommand` and `TransactGetCommand` converting native JavaScript values on the way in
  and out, and `paginateQuery` and `paginateScan` paging through a simulated table.

## Limitations

- The document client's PartiQL Commands go unconverted, because PartiQL is an operation this
  simulation lacks yet. `ExecuteStatementCommand`, `BatchExecuteStatementCommand` and
  `ExecuteTransactionCommand` are refused by name, never half converted.
- A document client's translate config goes unread. The marshalling options it was built with do not
  apply. See [the SDK docs](https://yulinsim.dev/sdk/#limitations).
- `Expected`, `ConditionalOperator`, `AttributeUpdates`, `KeyConditions`, `QueryFilter` and
  `ScanFilter` go unconverted for the document client, because simulated DynamoDB refuses all six
  anyway. A request carrying one is refused by the operation rather than by the conversion.
- A read of a global secondary index answers with the attributes the index projects, and no fetch
  fills in the rest. Real DynamoDB behaves the same way. It never reads the base table for an
  attribute a global secondary index omits. That is why `Select: ALL_ATTRIBUTES` against a partial
  projection is refused outright, and so is a `ProjectionExpression` naming an attribute the index
  omits. A local secondary index does fetch from the base table, and that is simulated, so a
  `ProjectionExpression` there may name any attribute of the item.
- The 10 GB limit on one item collection is left out, along with
  `ItemCollectionSizeLimitExceededException`. A table with a local secondary index can hold as much
  under one partition key here as memory allows. A write real DynamoDB would refuse for the size of
  the collection it lands in goes through. `ReturnItemCollectionMetrics` is refused by name, and a
  write cannot ask how large the collection it touched has grown either.
- An index key is one attribute, or two. Real DynamoDB now takes more than that, and a key schema of
  more than two elements is refused here.
- `ItemCount` and `IndexSizeBytes` are 0 for every index, the same way the table's own figures are.
- Per-index `ProvisionedThroughput` is read, validated and reported, and enforces no limit. No read
  or write against an index is throttled, since none against the table is either.
- A local secondary index cannot be added to or removed from a table after it has been created, and
  that is AWS behaviour rather than a limitation here. `CreateTable` is the only call that declares
  one. `UpdateTable` refuses a `LocalSecondaryIndexes` change by having no such parameter at all, as
  AWS does.
- There is no backfill to run when `UpdateTable` adds an index, since which items an index holds is
  worked out when the index is read. The `CREATING` window is a status the background scheduler
  advances rather than work being done. The index answers for the items already on the table the
  moment it goes `ACTIVE`. What a test observes matches AWS while the mechanism differs. No
  operation here takes longer to add an index to a large table than to an empty one.
- `Backfilling` is reported as true while a new index is `CREATING` and left out once it is
  `ACTIVE`. Real DynamoDB has a second phase in which the index is still `CREATING` with
  `Backfilling` false. After that point it can no longer be deleted mid-build. That phase is left
  out. An index here can be deleted at any point before it is `ACTIVE`.
- Changing the provisioned capacity of an existing global secondary index is refused outright. A
  per-index capacity is read and reported but enforces no limit, so changing one would move a number
  with no effect.
- Switching a table to `PROVISIONED` with `UpdateTable` has to state the capacity. Real DynamoDB
  estimates it from the table's consumption over the previous half hour, and no measurement of
  consumption happens here, and an estimate would be an invented number that a deployment then reads
  back.
- An `AttributeDefinition` for an index that has since been deleted stays on the table. No call
  removes a definition. A table can report one that no key now uses, which `CreateTable` would have
  refused on the way in.
- Tagging is immediate. AWS documents `TagResource` and `UntagResource` as eventually consistent. A
  real `ListTagsOfResource` issued straight after one of them may answer with the previous tags or
  with none. Here the change is there by the time the call returns, and a test cannot observe the
  window a retry would be written for.
- A `ListTagsOfResource` page carries 25 tags. The API has no page size parameter. The number is
  this simulator's own choice rather than DynamoDB's, and a real page may hold a different number.
- The 10 KB limit on the total size of a resource's tags goes unenforced. The 50 tag count and the
  key and value lengths are, and 50 tags of the greatest key and value length are over 10 KB. A set
  of tags real DynamoDB would refuse for its size is accepted here.
- Exceeding the 50 tag limit is a `ValidationException`. Real DynamoDB documents
  `LimitExceededException` for `TagResource`, but describes it entirely in terms of how many table
  operations are running at once, which is a different thing from how many tags a table carries.
- Tag based IAM condition keys are absent. `aws:RequestTag`, `aws:ResourceTag` and `aws:TagKeys` go
  unevaluated, and a policy that allows tagging only under a particular key allows all of it here.
- Tables are the only taggable DynamoDB resource here. Backups and global table replicas are absent.
  An ARN naming one of those resolves to no resource. Real DynamoDB also copies a table's tags onto
  its secondary indexes, which have no target to copy to yet.
- The time to live deletion window is a fixed 48 hours, where AWS promises only that an expired item
  is typically deleted within 48 hours. A simulation has to pick a point in that range, and this
  picks the far end, because that is the longest an expired item can still be readable and so is the
  behaviour an application has to cope with. A test can rely on an item surviving its TTL timestamp,
  and on it being gone once the window has passed. It should not assert that an expired item is
  still there partway through the window, since real DynamoDB may well have collected it by then.
- Time to live expiry is dispatched by moving the clock through `simAws.clock()`, not by real time
  elapsing. An item whose window goes by while a running-mode clock tracks the host stays where it
  is until something moves the clock. A simulated DynamoDB constructed standalone as `new
SimDynamoDb()` has no clock control at all. No item there ever expires.
- A Lambda event source mapping is the only simulated service integration that consumes a stream.
  Anything else reads one through the Streams API itself. A Kinesis Data Streams destination is
  absent.
- `Fn::GetAtt … StreamArn` on a table with no `StreamSpecification` is refused when the attribute is
  asked for, where real CloudFormation refuses the template while validating it. The timing differs,
  and the outcome matches.
- Changing a deployed table's `StreamViewType` falls short of the table replacement real
  CloudFormation performs. The change goes through `UpdateTable`, which refuses a view type change
  in place.
- An `AWS::DynamoDB::GlobalTable` naming two or more replica regions is created as an ordinary table
  in the region the stack is deploying into, with `Replicas` recorded in `stack.ignoredProperties`.
  Replication between regions is absent at all, so everything the table does within one region
  behaves as the template describes and no data is copied to the others. A replica list that leaves
  out the stack's own region is refused, as real CloudFormation refuses it.
- A global table's per-replica settings cannot differ from the primary's, because there is only ever
  one replica. Anything a second replica would have said differently cannot be reached.
- `WriteCapacityAutoScalingSettings` and `ReadCapacityAutoScalingSettings` are recorded, never
  applied, and the table is created at the `MinCapacity` each of them names, and that is where
  autoscaling starts it on AWS. No process here scales capacity afterwards.
- A shard iterator never expires. Real DynamoDB gives one 15 minutes and then answers
  `ExpiredIteratorException`, which a consumer handles by asking for another from the sequence
  number it last checkpointed. No check here refuses an iterator for being old.
- `DescribeStream` never reports a `LastEvaluatedShardId`, since a simulated stream has one shard
  and a page of shards is always all of them. `ShardFilter` is refused by name, never ignored, since
  there is no shard lineage for it to walk.
- A stream is never dropped once everything on it has been trimmed. Real DynamoDB eventually stops
  listing a disabled stream whose records have all aged out, where the ARN a test is holding goes on
  resolving here and reads as empty.
- The two readers per shard throughput limit and the `DescribeStream` rate limit go unapplied. Both
  are throughput protections a single-process simulation cannot produce honestly.
- The five year time to live eligibility rule counts 1825 days rather than five calendar years, and
  an item whose timestamp sits within a couple of days of the boundary may be treated differently
  here to how AWS treats it.
- A stream has one shard, which never splits. AWS documents an open shard as corresponding to one
  table partition, and a simulated table is always one partition. This is accurate. It does mean the
  records come out in one total order across every key, and that is stronger than the per-key order
  AWS guarantees. A consumer relying on it here would be relying on something real DynamoDB leaves
  unpromised.
- Stream sequence numbers are a counter rendered at a fixed 21 digits, where real AWS varies the
  width between 21 and 40. That makes comparing them as text always agree with comparing them as
  numbers, and that divergence is in a reader's favour. They are independent of the clock, because
  several items commonly change inside one millisecond and a clock cannot tell those apart.
- A stream record's `SizeBytes` counts the text of each value, summed over the keys and every image
  the record carries. That is the rule AWS's own published sample records follow, and it differs
  from the rule the 400 KB item limit uses, where a number costs about half its digits.
- `KinesisStreamSpecification` is absent. A table's changes go to its own stream or nowhere.
- Encryption at rest is absent. An `SSESpecification` with `Enabled` set on a CloudFormation
  Resource is recorded, and items are still held in the clear. `Enabled: false` asks for the AWS
  owned key real DynamoDB uses by default. It is accepted.
- Table resource policies are absent. `ResourcePolicy` on a CloudFormation Resource is recorded, and
  a table a policy was meant to keep callers out of is open here and closed on AWS.
- `OnDemandThroughput` and `WarmThroughput` are recorded, never applied. No process here applies a
  request-unit maximum or pre-warms capacity.
- `BillingModeSummary` and `TableClassSummary` are reported only when the request named a
  `BillingMode` or a `TableClass`. Real DynamoDB reports the effective values whichever way the
  table was created.
- `ItemCount` and `TableSizeBytes` are always 0. Real DynamoDB updates both about every six hours.
  They lag behind the items there too.
- Deletion happens as soon as the background work runs, where real DynamoDB may take a while over a
  large table. No call waits for a `DELETING` table to go. A test that needs it gone calls
  `simAws.backgroundTasksComplete()`.
- The segment a parallel scan puts an item in differs from the segment real DynamoDB would put it
  in. DynamoDB's partition key hash is unpublished, and a different one is used here. What matches
  is the shape. Whole item collections move together, and the segments come out uneven. A test
  asserting which segment a given key lands in is asserting something about this simulator in place
  of about DynamoDB.
- A table ARN naming another Account or Region is refused, never resolved to the local table of that
  name. Cross-account table access needs a resource policy, and that is absent here.
- A table in `UPDATING` refuses `DeleteTable` as well as a second `UpdateTable`, as AWS behaves,
  since a table has to be `ACTIVE` before either.
- No check enforces capacity. A provisioned table's throughput is stored and reported, and no
  request is ever throttled with `ProvisionedThroughputExceededException`.
- A query or scan page is never cut short by size. Real DynamoDB stops a page at 1 MB and hands out
  a `LastEvaluatedKey`, which is left out here. A page breaks only on a `Limit`. A test reading a
  large collection or a large table with no `Limit` gets all of it in one page where a real one
  would page.
- No part of this throttles or measures a query or a scan, so `ReturnConsumedCapacity` is refused
  unless it names `NONE`, and a `Limit` is the only thing that ends a page early.
- A key condition takes no brackets. `(customerId = :c) AND orderId > :o` is refused here, where
  real DynamoDB accepts it. The shape of a key condition is fixed. There is no sub-expression for
  brackets to group, and being stricter is the direction that fails safely. It is a puzzling refusal
  here rather than a query that means something different on AWS.
- `UnprocessedItems` and `UnprocessedKeys` are always empty. No request here is throttled and no
  response stops at a size, and the branch of a batch retry loop that resends what did not go
  through is never taken against the simulator.
- The 16 MB limit on a batch request goes unenforced. Real DynamoDB counts the request as the JSON
  it arrived as, and the JSON is larger than the items it carries. That inflation is left out. A
  batch of 25 items under 400 KB each is under 10 MB by the sizes counted here. No measurement this
  simulation takes ever reaches 16 MB.
- `TransactionConflictException` and `TransactionInProgressException` are left out. Every call here
  is serialised in one process. No transaction ever meets another one working on the same item, and
  both errors are out of reach.
- Only `None` and `ConditionalCheckFailed` appear as cancellation codes. No request here is
  throttled and no item collection is tracked, so `ProvisionedThroughputExceeded` and
  `ItemCollectionSizeLimitExceeded` never happen, and input DynamoDB would report as a
  `ValidationError` per action is refused up front as a `ValidationException` for the whole request.
- The 4 MB limit on a transactional write is counted from the items and keys the actions carry,
  rather than from the JSON the request arrived as, which is larger. A transaction near the limit
  here is near the limit there, but the byte counts differ.
- A `ClientRequestToken` is compared against the `TransactItems` as the JSON they arrived as, and a
  retry that names the same actions in a different order reads as a different request and is refused
  in place of replayed. A retry of the same call sends the same JSON. This shows up only in a test
  that rebuilds the request by hand.
- AWS creates one table with secondary indexes at a time in an account and region, and refuses a
  `CreateTable` that overlaps another one. Simulated CloudFormation creates each batch of resources
  whose dependencies are met at once. A template holding two indexed tables with no `DependsOn`
  between them deploys here and may not on AWS. That is the exact template shape that diverges. One
  indexed table, or several with `DependsOn` ordering them, behaves the same either way.
- A CloudFormation stack reaches `CREATE_COMPLETE` while the table it created is still `CREATING`.
  Real CloudFormation waits for the table to be `ACTIVE`, and a test reading the status after the
  stack deployed calls `simAws.backgroundTasksComplete()` first.
- A CloudFormation stack update replaces a changed table rather than updating it in place. The items
  in it are lost where real CloudFormation would keep them for a property it can change without
  replacement.
- `ProjectionExpression` is simulated on every read that takes one, which is `GetItem`,
  `BatchGetItem`, `TransactGetItems`, `Query` and `Scan`.
- The legacy `AttributesToGet` is refused outright, since an item that came back whole where part of
  it was asked for would hide an application reading an attribute it never requested.
  `ProjectionExpression` replaced it, and real DynamoDB has built no feature on it since.
- The 4 KB limit on an expression and the 255 byte limit on a placeholder go unenforced. No
  operation here is slower for a long expression. An expression real DynamoDB would refuse for its
  size is evaluated.
- Reads are always strongly consistent. `ConsistentRead` is accepted either way and changes nothing,
  whether a request sets it once for a read or per table for a batch read, and a test cannot observe
  a stale read here the way it might against a real table.
- Condition expressions are simulated on `PutItem`, `DeleteItem`, `UpdateItem` and the actions of
  `TransactWriteItems`, key conditions on `Query`, and filters on `Query` and `Scan`.
- Two update actions cannot write to overlapping paths, so `ADD tags :added DELETE tags :gone` in
  one expression is refused as it is on AWS. Taking members out of a set an expression also adds to
  is a second update.
- An update is applied in one go. No part of this shows the concurrency an atomic counter is for. A
  simulated `ADD` counts exactly once per call, where a real one is what makes two callers counting
  at the same time both count.
- The legacy `AttributeUpdates` is refused outright, for the same reason `Expected` is.
  `UpdateExpression` replaced it, and real DynamoDB has built no feature on it since.
- A `REMOVE` whose path reaches through an attribute that is missing, or that is something other
  than a map, changes nothing rather than being refused. `REMOVE` names a place in the item. There
  was nothing there to remove either way.
- The legacy `Expected` and `ConditionalOperator` are refused outright, since an expectation that is
  never evaluated would let a write or a delete through that DynamoDB would have turned away.
  `ConditionExpression` replaced them, and real DynamoDB has built no feature on them since.
- The 4 KB limit on an expression and the 300 operator limit go unenforced. No operation here is
  slower for a long expression, and an expression real DynamoDB would refuse for its size is
  evaluated.
- Capacity and item collection reporting are absent. `ReturnConsumedCapacity` and
  `ReturnItemCollectionMetrics` are refused unless they name `NONE`.
- A `Key` that fails to match the table's key schema is refused with the attribute named. Real
  DynamoDB answers `The provided key element fails to match the schema` without saying which
  attribute was at fault.
- A number comes back in plain decimal notation, whatever notation it was written in. A request
  carrying `1E5` reads back `100000`. The value is the one that was written either way, but the text
  is only sometimes character for character what real DynamoDB would answer with for a number at the
  extremes of its range.
- Item sizes follow the figures AWS documents for its 400 KB limit, which AWS itself describes as
  approximate. An item near the limit here is near the limit there, but the byte counts differ.
- PartiQL is absent, and stays off the roadmap for this service.
- `serveSimAws` serves no DynamoDB HTTP API.
