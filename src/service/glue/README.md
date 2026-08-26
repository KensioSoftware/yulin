# Simulated Glue

The Glue Data Catalog, holding databases, the table definitions inside them, and the partitions
registered against those tables.

Usage docs are at [docs/services/glue/](../../../docs/services/glue/README.md).

## What this service is for

A table is metadata about a dataset. The dataset stays in S3, unread, and no SQL is parsed or
planned here. The whole of the observable behaviour is what the catalog was told to hold and what it
hands back.

That puts the weight on `TableInput.Parameters`. Athena partition projection is configured entirely
through table parameters. A table created without them looks deployed while configuring none of it,
and a projection with a mistake in it then passes the test written to catch it. The CloudFormation
property reader treats those parameters as behaviour, alongside the storage descriptor and the
partition keys.

## Layout

- `sim-glue.ts` is the facade. It holds the three stores, delegates each SDK Command to a command
  class, and hands out the SDK router and the CloudFormation factory.
- `database/` and `table/` hold the stored shapes and their stores. Tables are keyed by database
  name and then by table name. A database's tables go with it when it is deleted, and two databases
  may each hold a table of the same name.
- `partition/` follows that a level further down. `SimGluePartitionStore` is keyed by database name
  and then table name, and each entry is a `SimGlueTablePartitions` holding one table's partitions
  under their own values. A table's partitions go with it, and a database's go with the database.
- `command/` is one directory per resource kind, holding the local structural command types, the
  handler class, and the detail mapper deciding what a `Get` reports.
- `cfn/` reads `AWS::Glue::Database` and `AWS::Glue::Table` properties and creates from them.
  `AWS::Glue::Crawler` and `AWS::Glue::Partition` are real resource types with no creator here. A
  template declaring either records that Resource as skipped.
- `write/sim-glue-catalog-writer.ts` is how CloudFormation writes to the catalog. A deploy happens
  as CloudFormation, and never as the caller a later request carries, so a Resource creator goes
  through here and skips the IAM authorization an SDK Command applies. The store refusals still
  apply. A stack declaring two tables of one name in one database fails the way two `CreateTable`
  calls would.
- `arn/sim-glue-arn.ts` builds the three ARN forms IAM policies are written against.

## Decisions worth knowing

**A response leaves absent fields out.** The command detail mappers run their result through
`definedEntries`. A table created without a description then carries no `Description` key at all.
Real AWS responses are that shape, and an assertion comparing a response against what a caller
declared trips over keys nobody set otherwise.

**Unknown properties are recorded, malformed ones are refused.** A property this simulation has no
behaviour for is reported through `ignoreProperty` and the resource is created anyway, which is the
argument in issue #273. A property of the wrong type fails the deploy. A template declaring
`TableInput` as a string is broken, and being ahead of the simulation is a different thing.

**`Fn::GetAtt Id` on a table is a guess, and the only guess here.** CloudFormation documents the
attribute and documents nothing about the value behind it, so `simGlueTableCfnId` joins the catalog
id, the database name and the table name and says in its own comment that nothing has checked that
against AWS. The format lives in that one function, so correcting it is that function and the test
naming the value.

**A partition is keyed by its values as JSON.** `simGluePartitionKey` runs the values through
`JSON.stringify`. Joining them on a separator character gives one key for two different partitions
whenever a value holds that character, and `["a", "b"]` then collides with `["a/b"]`.

**A batch reports its refusals and keeps going.** `BatchCreatePartition` and `BatchDeletePartition`
run each entry through the same path a single request takes, and collect the `SimGlueError` an entry
raises into the `Errors` list. Any other error comes out of the batch. A fault in the simulation
reported as a partition error would read as though the caller had asked for something invalid.

**`Errors` is always there, and empty when a batch had everything to do.** The response mappers
leave an absent field out, and this is the one exception. A caller checking a batch has one thing to
check, and an optional empty list makes them reach through it first.

**`GetPartitions` refuses an `Expression`.** Filtering is a separate issue. Ignoring the filter until
it lands would answer with the partitions the caller asked to leave out, and the refusal names what
is missing.

**A partition authorizes against its table's ARN.** Partitions have no ARN of their own on real
Glue, and a real policy grants `glue:CreatePartition` on the table. `SimGluePartitionRegistry`
resolves the table first and every partition command goes through it.

**A `CatalogId` naming another account is refused.** Creating the resource in this account's catalog
would give a template that deploys and a catalog holding something the template never asked for.

## What is deliberately absent

Crawlers, partition updates, partition indexes, `BatchGetPartition`, table versions, column
statistics, Lake Formation, connections, jobs, triggers, workflows and the Schema Registry. Every
one of them needs something outside the catalog, or reads data back. Simulated Athena reads a
table's projection parameters and none of its registered partitions, which is its own issue. The
Limitations list in the usage docs is the full account.
