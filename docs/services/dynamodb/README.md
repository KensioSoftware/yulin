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

A key attribute is one of `S`, `N` or `B`.

A table with a binary key can be created, but no item can be written to it yet. `PutItem` only
computes an item key from string and number key values.

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

`DescribeTable` and `PutItem` authorize against the table ARN in the same way. `ListTables` names no
table, so it authorizes against `*`.

## Available functionality

- `CreateTable`, with table name, key schema, attribute definition, billing mode and throughput
  validation.
- `DescribeTable`, answering with the full table description, by table name or ARN.
- `ListTables`, ordered by UTF-8 bytes and paged with `Limit` and `ExclusiveStartTableName`.
- `DeleteTable`, following the table status DynamoDB moves a deleted table through, and refusing a
  table that is protected from deletion.
- `PutItem`, in an earlier form than the table commands. It reaches its table the same way
  they do, so it takes a table name or ARN and authorizes before the lookup.
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
- A binary key attribute is accepted by `CreateTable`, since real DynamoDB accepts one, but
  `PutItem` refuses an item whose key value is binary. Item keys are computed from string and
  number values only.
- Deletion happens as soon as the background work runs, where real DynamoDB may take a while over a
  large table. Nothing waits for a `DELETING` table to go, so a test that needs it gone calls
  `simAws.backgroundTasksComplete()`.
- A table ARN naming another Account or Region is refused rather than resolved to the local table of
  that name. Cross-account table access needs a resource policy, which is not simulated.
- `UpdateTable` is not implemented, so a table never reaches `UPDATING` on its own. `DeleteTable`
  refuses that status anyway, for when it can.
- Nothing enforces capacity. A provisioned table's throughput is stored and reported, and no request
  is ever throttled with `ProvisionedThroughputExceededException`.
- `UpdateTable` and the item commands other than `PutItem` are not implemented yet, and neither is
  `AWS::DynamoDB::Table` in CloudFormation.
- DynamoDB is not served as an HTTP API by `serveSimAws`.
