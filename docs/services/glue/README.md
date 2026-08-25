# Simulated Glue

Yulin includes a simulated Glue Data Catalog for tests and local development. It holds databases and
tables, deploys them from `AWS::Glue::Database` and `AWS::Glue::Table`, and hands them back through
`GetDatabase` and `GetTable`. A test can assert that a stack declared the table definition it meant
to, including the Athena partition projection its parameters configure.

A table here is a definition. The data it describes stays in S3, unread, and the catalog answers
with what it was told to hold.

Glue specific types are imported from the `@kensio/yulin/glue` subpath.

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
green while projecting none of them, and a broken projection then passes the test written to catch
it.

`Ref` answers with the database name and with the table name.

## Reading the catalog back

`GetDatabase`, `GetDatabases`, `GetTable` and `GetTables` answer through the SDK. A `SimGlue` also
carries `findDatabase`, `findTable`, `allDatabases` and `tablesInDatabase`, which read the same
state without going through a Command or its authorization.

The storage descriptor keeps its columns in the order they were declared, and the partition keys
keep theirs. The two stay apart, the way real Glue keeps them. A partition key repeated among the
storage descriptor's columns gives a table Athena refuses to query.

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

Every Command authorizes through simulated IAM. A database operation authorizes against the database
ARN, a table operation against the table ARN, and an operation naming no database against the
catalog ARN.

```typescript sim-glue-permissions
/**
 * A Role that may read one table and nothing else in the catalog.
 */

import { GetTableCommand } from "@aws-sdk/client-glue";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "111111111111" });

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
          Resource:
            "arn:aws:glue:us-east-1:111111111111:table/site_logs/access_logs",
        },
      ],
    }),
  }),
);

simAws
  .glue()
  .getTable(
    new GetTableCommand({ DatabaseName: "site_logs", Name: "access_logs" }),
    {
      caller: {
        kind: "arn",
        arn: "arn:aws:iam::111111111111:role/ReportingRole",
      },
    },
  );
```

## Available functionality

- `CreateDatabase`, `GetDatabase`, `GetDatabases` and `DeleteDatabase`.
- `CreateTable`, `GetTable`, `GetTables` and `DeleteTable`.
- `AWS::Glue::Database` and `AWS::Glue::Table`, deployed and deleted with the stack.
- `TableInput.Parameters`, `PartitionKeys` and `StorageDescriptor`, held and read back as declared.
- IAM authorization on every Command.

## Limitations

- **Partition projection is held, never evaluated.** The parameters read back as they were declared,
  and no partition follows from a value range.
- **No query reads a table.** SQL goes unparsed, no S3 prefix is listed, and no object is opened.
- **`AWS::Glue::Crawler` is absent.** A crawler fills a catalog by reading objects, and every object
  stays unread here. A template declaring one deploys, with the crawler recorded on the stack's
  `skippedResources`.
- **Partitions are described by projection alone.** `CreatePartition`, `GetPartitions` and
  `BatchCreatePartition` have no counterpart here.
- **A table keeps the definition it was created with.** `UpdateTable` and `UpdateDatabase` are
  absent, and `GetTable` reports the creation time as the update time.
- **`Fn::GetAtt Id` on a table is refused.** CloudFormation documents the attribute without
  documenting what its value contains. A stand-in would differ from the value a real deploy
  resolves.
- **Names keep the case they were given.** Real Glue lowercases a database or table name for Hive
  compatibility. A name that differs only by case is a different name here.
- **Cross-account catalogs are refused.** A `CatalogId` naming another account is refused, in a
  Command and in a template.
- **Versions, statistics and Lake Formation are absent.** A table has no version history and no
  column statistics, and IAM is the whole of the permission model.
- **Iceberg and other open table formats are recorded, never built.** `OpenTableFormatInput` is
  reported as ignored and the table is created as an ordinary one.
- **Listings come back whole.** `GetDatabases` and `GetTables` answer with everything in creation
  order. `MaxResults` and `NextToken` are absent.
- **Connections, jobs, triggers, workflows and the Schema Registry are absent.** The Data Catalog is
  the whole of the simulated surface.
