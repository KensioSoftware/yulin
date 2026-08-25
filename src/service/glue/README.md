# Simulated Glue

The Glue Data Catalog, holding databases and the table definitions inside them.

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

- `sim-glue.ts` is the facade. It holds the two stores, delegates each SDK Command to a command
  class, and hands out the SDK router and the CloudFormation factory.
- `database/` and `table/` hold the stored shapes and their stores. Tables are keyed by database
  name and then by table name. A database's tables go with it when it is deleted, and two databases
  may each hold a table of the same name.
- `command/` is one directory per resource kind, holding the local structural command types, the
  handler class, and the detail mapper deciding what a `Get` reports.
- `cfn/` reads `AWS::Glue::Database` and `AWS::Glue::Table` properties and creates from them.
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

**`Fn::GetAtt Id` on a table is refused.** CloudFormation documents the attribute and documents
nothing about the value behind it. Answering with a plausible string would put a value in a template
that a real deploy then disagrees with.

**A `CatalogId` naming another account is refused.** Creating the resource in this account's catalog
would give a template that deploys and a catalog holding something the template never asked for.

## What is deliberately absent

Crawlers, partition registration, table versions, column statistics, Lake Formation, connections,
jobs, triggers, workflows and the Schema Registry. Every one of them needs something outside the
catalog, and most need data read back. The Limitations list in the usage docs is the full account.
