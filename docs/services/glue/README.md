# Simulated Glue

Yulin includes a simulated Glue Data Catalog for tests and local development. It holds databases,
tables and the partitions registered against them, deploys databases and tables from
`AWS::Glue::Database` and `AWS::Glue::Table`, and hands them back through `GetDatabase` and
`GetTable`. A test can assert that a stack declared the table definition it meant to, including the
Athena partition projection its parameters configure.

A table here is a definition. The data it describes stays in S3, unread, and the catalog answers
with what it was told to hold.

Simulated [Athena](https://yulinsim.dev/services/athena/ "Simulated Athena usage docs") reads this
catalog. A query naming a table no database here holds fails the way real Athena fails it, and a
table's partition projection is evaluated when a query runs against it. All four projection types
are covered, `enum`, `integer`, `date` and `injected`. A projection with a mistake in its parameters
fails the query that reads it.

Glue-specific types are imported from the `@kensio/yulin/glue` subpath.

## Deploying a database and a table

A stack declares the database, and the table names it through `Ref`. Both read back through the SDK
once the deploy finishes.

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

Partition projection lives entirely in `TableInput.Parameters`. Those parameters are read into the
table, and never recorded as ignored. A table whose parameters were dropped on the way in deploys
green while projecting none of them. Simulated Athena reads those same parameters when a query runs.
A broken projection fails that query.

`Ref` answers with the database name and with the table name.

## Reading the catalog back

`GetDatabase`, `GetDatabases`, `GetTable` and `GetTables` answer through the SDK. A `SimGlue` also
carries `findDatabase`, `findTable`, `allDatabases`, `tablesInDatabase`, `findPartition` and
`partitionsInTable`. Those read the same state without going through a Command or its
authorization.

The storage descriptor keeps its columns in the order they were declared, and the partition keys
keep theirs. The two stay apart, the way real Glue keeps them. A partition key repeated among the
storage descriptor's columns gives a table Athena refuses to query.

## Registering partitions

A crawler, `MSCK REPAIR TABLE` or `ALTER TABLE ADD PARTITION` fills a real catalog's partition list.
Here the six partition commands do it. A partition is keyed by its values in the order the table's
`PartitionKeys` declares them, and carries a storage descriptor saying where its own data sits.

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

`CreatePartition` registers one partition and `BatchCreatePartition` registers a list of them.
`GetPartition` reads one back by its values, and `GetPartitions` answers with a table's partitions in
registration order. `DeletePartition` and `BatchDeletePartition` remove them.

A batch reports what it could not do in `Errors` and carries on with the rest, the way real Glue
does. Each entry there carries the values it was given and an `ErrorCode` naming the refusal, so a
job re-run over a week of days learns which days were already registered and registers the others.

Values are positional. A `Values` list of a different length from the table's `PartitionKeys` lines
up with the wrong keys, and is refused with `InvalidInputException` naming both counts. Registering
one day twice is an `AlreadyExistsException`, since registration is not idempotent on real Glue.
Deleting a table removes the partitions registered against it, the way deleting a database removes
its tables.

## Intercepting a GlueClient

An intercepted `GlueClient` reaches the simulated catalog, so code under test builds its own client
and sends its own Commands.

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

Every Command authorizes through simulated IAM. Data Catalog resources are a hierarchy with the
catalog at the root, and an operation on one needs permission on that resource and on every ancestor
of it. Reading a table needs the table, the database and the catalog, and a policy naming only the
table ARN is denied. Deleting a database needs permission on every table in it as well, since the
tables go with it.

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

A policy listing only the table ARN is refused here, and refused by real Glue for the same reason.

## Available functionality

- `CreateDatabase`, `GetDatabase`, `GetDatabases` and `DeleteDatabase`.
- `CreateTable`, `GetTable`, `GetTables` and `DeleteTable`.
- `CreatePartition`, `BatchCreatePartition`, `GetPartition`, `GetPartitions`, `DeletePartition` and
  `BatchDeletePartition`.
- `AWS::Glue::Database` and `AWS::Glue::Table`, deployed and deleted with the stack.
- `TableInput.Parameters`, `PartitionKeys` and `StorageDescriptor`, held and read back as declared.
- IAM authorization on every Command, over the resource and its ancestors.

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
- **Athena ignores a registered partition.** A query expands the table's projection parameters and
  reads nothing the partition commands wrote. Registering partitions changes what the catalog
  reports and leaves query planning alone.
- **`GetPartitions` takes no `Expression`.** A filter is refused with `InvalidInputException`. An
  ignored filter would answer with the partitions the caller asked to leave out.
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
- **Names keep the case they were given.** Real Glue lowercases a database or table name for Hive
  compatibility. A name that differs only by case is a different name here.
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
