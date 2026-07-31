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

## IAM authorization

`CreateTable` authorizes `dynamodb:CreateTable` against the ARN the table is about to have, before
it looks the name up. A caller with no permission is denied whether or not the name is free, so an
unauthorized caller cannot find out which names are taken.

`DescribeTable`, `PutItem`, `GetItem` and `DeleteItem` authorize against the table ARN in the same
way, each against the `dynamodb:` action of its own name. `ListTables` names no table, so it
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
- `GetItem`, answering with the whole item under a primary key, and with no `Item` at all when the
  key holds nothing.
- `DeleteItem`, removing the item under a primary key and answering with it for `ALL_OLD`.
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
- `UpdateTable`, `UpdateItem`, `Query`, `Scan` and the batch item commands are not implemented yet,
  and neither is `AWS::DynamoDB::Table` in CloudFormation.
- Projection is not simulated. `ProjectionExpression` and `AttributesToGet` are refused rather than
  ignored, since an item that came back whole where part of it was asked for would hide an
  application reading an attribute it never requested.
- Reads are always strongly consistent. `ConsistentRead` is accepted either way and changes nothing,
  so a test cannot observe a stale read here the way it might against a real table.
- Condition expressions are not simulated. `ConditionExpression`, `ExpressionAttributeNames`,
  `ExpressionAttributeValues`, `Expected` and `ConditionalOperator` are refused rather than ignored,
  since a condition that is never evaluated would let a write or a delete through that DynamoDB would
  have turned away.
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
