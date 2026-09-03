# Simulated Glue

Yulin simulates Glue Data Catalog databases, tables and partitions. The catalog stores metadata. It
does not read the data in S3.

Simulated [Athena](https://yulinsim.dev/services/athena/ "Simulated Athena usage docs") reads the
catalog and evaluates partition projection when it runs a query.

Glue-specific types are imported from the `@kensio/yulin/glue` subpath.

## Deploying a database and a table

Simulated CloudFormation deploys `AWS::Glue::Database` and `AWS::Glue::Table`. A table can name its
database through `Ref`.

```typescript sim-glue-cloudformation
/**
 * Deploying a Glue database and a table, then reading the table back.
 */

import { GetTableCommand } from "@aws-sdk/client-glue";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "analytics-stack",
  template: {
    Resources: {
      LogDatabase: {
        Type: "AWS::Glue::Database",
        Properties: {
          CatalogId: { Ref: "AWS::AccountId" },
          DatabaseInput: { Name: "site_logs" },
        },
      },
      LogTable: {
        Type: "AWS::Glue::Table",
        Properties: {
          CatalogId: { Ref: "AWS::AccountId" },
          DatabaseName: { Ref: "LogDatabase" },
          TableInput: {
            Name: "access_logs",
            TableType: "EXTERNAL_TABLE",
            PartitionKeys: [{ Name: "year", Type: "string" }],
            StorageDescriptor: {
              Columns: [{ Name: "status", Type: "int" }],
              Location: "s3://site-logs/cloudfront/",
            },
            Parameters: {
              "projection.enabled": "true",
              "projection.year.type": "date",
              "projection.year.format": "yyyy",
              "projection.year.range": "2026,NOW",
              // eslint-disable-next-line no-template-curly-in-string
              "storage.location.template": "s3://site-logs/cloudfront/${year}/",
            },
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

const { Table } = simAws
  .glue()
  .getTable(
    new GetTableCommand({ DatabaseName: "site_logs", Name: "access_logs" }),
  );

// true
console.log(Table.Parameters["projection.enabled"]);
```

Partition projection configuration is stored in `TableInput.Parameters`. Athena reads these
parameters when a query runs and rejects invalid projection configuration.

`Ref` answers with the database name and with the table name.

## Names are folded to lower case

Database and table names are stored in lower case. A database created as `Rainlytics` is reported as
`rainlytics`.

```typescript sim-glue-name-folding
/**
 * A catalog name folded on its way in.
 */

import {
  CreateDatabaseCommand,
  GetDatabaseCommand,
} from "@aws-sdk/client-glue";

import { SimAws } from "@kensio/yulin";

const glue = new SimAws().glue();

glue.createDatabase(
  new CreateDatabaseCommand({ DatabaseInput: { Name: "Rainlytics" } }),
);

const { Database } = glue.getDatabase(
  new GetDatabaseCommand({ Name: "Rainlytics" }),
);

// rainlytics
console.log(Database.Name);
```

Names that differ only by case refer to the same database or table. Creating the second one raises
`AlreadyExistsException`.

Column and partition key names keep their original case.

CloudFormation generates a lower-case name when the template omits one. See
[generated resource names](https://yulinsim.dev/services/cloudformation/#names-cloudformation-generates "Names CloudFormation generates").

## Reading the catalog back

Use the SDK commands to read the catalog through IAM authorization. The `findDatabase`, `findTable`,
`allDatabases`, `tablesInDatabase`, `findPartition` and `partitionsInTable` accessors read the same
state directly.

Storage descriptor columns and partition keys keep their declared order. Athena rejects a table
that repeats a partition key in the storage descriptor columns.

## Registering partitions

Register partitions with the Glue partition commands. Values follow the order of the table's
`PartitionKeys`. Each partition may provide its own storage descriptor.

```typescript sim-glue-partitions
/**
 * Registering two days of partitions against a table, then listing them.
 */

import {
  BatchCreatePartitionCommand,
  CreateDatabaseCommand,
  CreateTableCommand,
  GetPartitionsCommand,
} from "@aws-sdk/client-glue";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const glue = simAws.glue();

glue.createDatabase(
  new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
);
glue.createTable(
  new CreateTableCommand({
    DatabaseName: "site_logs",
    TableInput: {
      Name: "access_logs",
      PartitionKeys: [{ Name: "day", Type: "string" }],
      StorageDescriptor: { Location: "s3://site-logs/cloudfront/" },
    },
  }),
);

const { Errors } = glue.batchCreatePartition(
  new BatchCreatePartitionCommand({
    DatabaseName: "site_logs",
    TableName: "access_logs",
    PartitionInputList: [
      {
        Values: ["2026-08-25"],
        StorageDescriptor: {
          Location: "s3://site-logs/cloudfront/day=2026-08-25/",
        },
      },
      {
        Values: ["2026-08-26"],
        StorageDescriptor: {
          Location: "s3://site-logs/cloudfront/day=2026-08-26/",
        },
      },
    ],
  }),
);

const { Partitions } = glue.getPartitions(
  new GetPartitionsCommand({
    DatabaseName: "site_logs",
    TableName: "access_logs",
  }),
);

// 0
console.log(Errors.length);
// s3://site-logs/cloudfront/day=2026-08-26/
console.log(Partitions[1]?.StorageDescriptor?.Location);
```

`CreatePartition` and `BatchCreatePartition` register partitions. `GetPartition` reads one by its
values. `GetPartitions` returns them in registration order. The delete commands remove them.

A batch continues after an individual partition fails. Its `Errors` list contains the supplied
values and an `ErrorCode` for each failure.

The number of values must match the number of partition keys. A mismatch raises
`InvalidInputException`. Registering the same values twice raises `AlreadyExistsException`. Deleting
a table removes its partitions, and deleting a database removes its tables.

## Filtering partitions

Pass `Expression` to `GetPartitions` to filter the result. Omitting it returns every partition.

```typescript sim-glue-partition-expressions
/**
 * Reading back the partitions an expression matches.
 */

import {
  BatchCreatePartitionCommand,
  CreateDatabaseCommand,
  CreateTableCommand,
  GetPartitionsCommand,
} from "@aws-sdk/client-glue";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const glue = simAws.glue();

glue.createDatabase(
  new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
);
glue.createTable(
  new CreateTableCommand({
    DatabaseName: "site_logs",
    TableInput: {
      Name: "access_logs",
      PartitionKeys: [
        { Name: "day", Type: "string" },
        { Name: "region", Type: "string" },
      ],
    },
  }),
);

glue.batchCreatePartition(
  new BatchCreatePartitionCommand({
    DatabaseName: "site_logs",
    TableName: "access_logs",
    PartitionInputList: [
      { Values: ["2026-07-31", "eu-west-2"] },
      { Values: ["2026-08-01", "eu-west-2"] },
      { Values: ["2026-08-02", "us-east-1"] },
    ],
  }),
);

const { Partitions } = glue.getPartitions(
  new GetPartitionsCommand({
    DatabaseName: "site_logs",
    TableName: "access_logs",
    Expression: "day >= '2026-08-01' AND region IN ('eu-west-2', 'us-east-1')",
  }),
);

// [["2026-08-01","eu-west-2"],["2026-08-02","us-east-1"]]
console.log(JSON.stringify(Partitions.map((partition) => partition.Values)));
```

Expressions support `=`, `<>`, `!=`, `>`, `<`, `>=`, `<=`, `LIKE`, `IN` and `BETWEEN`. Combine terms
with `AND`, `OR`, `NOT` and parentheses. Operator precedence is `NOT`, then `AND`, then `OR`.

Numeric partition key types use numeric comparison. Other types use text comparison. A numeric key
requires a numeric literal.

`LIKE` treats the value as text. `%` matches any sequence and `_` matches one character.

An unknown partition key or invalid expression is rejected with a position-aware error.

## Intercepting a GlueClient

Intercept a `GlueClient` when application code constructs the client itself.

```typescript sim-glue-sdk-interception
/**
 * Ordinary Glue SDK code reaching the simulated catalog.
 */

import {
  CreateDatabaseCommand,
  CreateTableCommand,
  GetTablesCommand,
  GlueClient,
} from "@aws-sdk/client-glue";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();
simSdk.intercept(GlueClient);

const client = new GlueClient({ region: "eu-west-2" });

await client.send(
  new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
);
await client.send(
  new CreateTableCommand({
    DatabaseName: "site_logs",
    TableInput: { Name: "access_logs" },
  }),
);

const { TableList } = await client.send(
  new GetTablesCommand({ DatabaseName: "site_logs" }),
);

// access_logs
console.log(TableList?.[0]?.Name);
```

## Permissions

Every command uses simulated IAM. Catalog resources form a hierarchy. A table operation needs
permission on the table, database and catalog. Deleting a database also needs permission on its
tables.

```typescript sim-glue-permissions
/**
 * A Role that may read one table and nothing else in the catalog.
 */

import {
  CreateDatabaseCommand,
  CreateTableCommand,
  GetTableCommand,
} from "@aws-sdk/client-glue";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "111111111111" });
const glue = simAws.glue();

glue.createDatabase(
  new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
);
glue.createTable(
  new CreateTableCommand({
    DatabaseName: "site_logs",
    TableInput: { Name: "access_logs" },
  }),
);

await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "ReportingRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ReportingRole",
    PolicyName: "ReadAccessLogs",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "glue:GetTable",
          Resource: [
            "arn:aws:glue:us-east-1:111111111111:catalog",
            "arn:aws:glue:us-east-1:111111111111:database/site_logs",
            "arn:aws:glue:us-east-1:111111111111:table/site_logs/access_logs",
          ],
        },
      ],
    }),
  }),
);

const { Table } = glue.getTable(
  new GetTableCommand({ DatabaseName: "site_logs", Name: "access_logs" }),
  {
    caller: {
      kind: "arn",
      arn: "arn:aws:iam::111111111111:role/ReportingRole",
    },
  },
);

// access_logs
console.log(Table.Name);
```

A policy that grants only the table ARN is insufficient.

## Available functionality

- `CreateDatabase`, `GetDatabase`, `GetDatabases` and `DeleteDatabase`.
- `CreateTable`, `GetTable`, `GetTables` and `DeleteTable`.
- `CreatePartition`, `BatchCreatePartition`, `GetPartition`, `GetPartitions`, `DeletePartition` and
  `BatchDeletePartition`.
- `GetPartitions` `Expression` filtering, over the SQL operators, `AND`, `OR`, `NOT` and brackets.
- `AWS::Glue::Database` and `AWS::Glue::Table`, deployed and deleted with the stack.
- `TableInput.Parameters`, `PartitionKeys` and `StorageDescriptor`, held and read back as declared.
- IAM authorization on every Command, over the resource and its ancestors.
- Database and table names folded to lower case, as the Data Catalog folds them.

## Limitations

- **Partition projection is held here and evaluated by Athena.** The catalog stores the parameters
  as they were declared and materializes no partition from them. Simulated
  [Athena](https://yulinsim.dev/services/athena/ "Simulated Athena usage docs") expands them when a
  query runs, which is where a broken projection is refused.
- **The catalog reads no query and no object.** SQL reaches Athena rather than the catalog, no S3
  prefix is listed here, and no object is opened.
- **`AWS::Glue::Crawler` is absent.** A crawler fills a catalog by reading objects, and every object
  stays unread here. A template declaring one deploys, with the crawler recorded on the stack's
  `skippedResources`.
- **A registered partition is read by Athena, and a projected one wins over it.** Simulated
  [Athena](https://yulinsim.dev/services/athena/ "Simulated Athena usage docs") reads a table's
  registered partitions when a query runs, unless `projection.enabled` is true. Real Athena stops
  reading the catalog's partitions once projection is on.
- **A `GetPartitions` `Expression` is the whole of the filtering.** `Segment` and parallel listing,
  `ExcludeColumnSchema` and `TransactionId` are absent, and so are partition indexes, which change
  which expressions real Glue will serve rather than what any of them mean.
- **An expression compares a partition key against a literal.** That is the whole grammar.
  Functions, arithmetic and comparing one column against another sit outside it, and a column name
  is written unquoted.
- **A partition keeps what it was registered with.** `UpdatePartition` and `BatchUpdatePartition`
  are absent, along with `BatchGetPartition` and partition indexes.
- **`AWS::Glue::Partition` is absent.** Real CloudFormation has the resource type, and a template
  declaring one deploys here with the partition recorded on the stack's `skippedResources`. A stack
  that needs its partitions registered does it through the SDK once the deploy finishes.
- **A table keeps the definition it was created with.** `UpdateTable` and `UpdateDatabase` are
  absent, and `GetTable` reports the creation time as the update time.
- **`Fn::GetAtt Id` on a table answers with a guess.** It resolves to the catalog id, the database
  name and the table name joined with `|`, as in `111111111111|site_logs|access_logs`. This is the
  one piece of behaviour here that nothing has checked against AWS. CloudFormation documents that
  the attribute exists and documents nothing about its value, so a template asserting on it agrees
  with this simulation and may disagree with a real deploy. Confirming it takes one stack deployed
  to an account with `!GetAtt Table.Id` as an output.
- **A lookup finds a name under any spelling.** Real Glue documents the fold on the way in and asks
  the caller to pass lower case on the way back out. `GetDatabase` and `GetTable` fold the name they
  are given here, so a request naming `Rainlytics` reaches the database stored as `rainlytics`. This
  is the one piece of the fold nothing has checked against AWS. A test relying on it agrees with
  this simulation and may disagree with a real call, and passing the name in lower case avoids the
  question.
- **Cross-account catalogs are refused.** A `CatalogId` naming another account is refused, in a
  Command and in a template.
- **Versions, statistics and Lake Formation are absent.** A table has no version history and no
  column statistics, and IAM is the whole of the permission model.
- **Iceberg and other open table formats are recorded, never built.** `OpenTableFormatInput` is
  reported as ignored and the table is created as an ordinary one.
- **Listings come back whole.** `GetDatabases`, `GetTables` and `GetPartitions` answer with
  everything in creation order. `MaxResults` and `NextToken` are absent.
- **Connections, jobs, triggers, workflows and the Schema Registry are absent.** The Data Catalog is
  the whole of the simulated surface.
