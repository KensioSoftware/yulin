# Simulated Athena

Yulin includes a simulated Amazon Athena for tests and local development. It holds workgroups and
named queries, and hands both back through the SDK.

No SQL is evaluated. A test declares what a query answers with, and the simulation reads the query
text only as a key to match that declaration on. So a test can prove its bytes-scanned cutoff
refuses a query, that results land where the workgroup says, and that a client polls the lifecycle
correctly. Whether the SQL is valid stays out of reach. The [Limitations](#limitations) at the end
say what that leaves out.

One part of the SQL is read. The tables a query names are looked for in the simulated
[Glue Data Catalog](https://yulinsim.dev/services/glue/ "Simulated Glue usage docs"), and a query
naming one that is absent fails the way real Athena fails it.

Athena-specific types are imported from the `@kensio/yulin/athena` subpath.

## Workgroups from a template

`AWS::Athena::WorkGroup` deploys like any other supported Resource type. `Ref` answers with the
workgroup name and `Fn::GetAtt CreationTime` with when it was made.

```typescript sim-athena-cloudformation-work-group
/**
 * An AWS::Athena::WorkGroup deployed from a template and read back.
 */

import { AthenaClient, GetWorkGroupCommand } from "@aws-sdk/client-athena";

import { SimAws } from "@kensio/yulin";
import { SimSdk } from "@kensio/yulin/sdk";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "rainlytics",
  template: {
    Resources: {
      Queries: {
        Type: "AWS::Athena::WorkGroup",
        Properties: {
          Name: "rainlytics",
          Description: "CloudFront access log queries",
          WorkGroupConfiguration: {
            BytesScannedCutoffPerQuery: 10_000_000_000,
            EnforceWorkGroupConfiguration: true,
            ResultConfiguration: {
              OutputLocation: "s3://rainlytics-results/queries/",
            },
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

using simSdk = new SimSdk({ simAws });
simSdk.intercept(AthenaClient);

const athena = new AthenaClient({});
const read = await athena.send(
  new GetWorkGroupCommand({ WorkGroup: "rainlytics" }),
);

// 10000000000
console.log(read.WorkGroup?.Configuration?.BytesScannedCutoffPerQuery);
```

The properties this simulation reads are `Name`, `Description`, `State` and, under
`WorkGroupConfiguration`, `BytesScannedCutoffPerQuery`, `EnforceWorkGroupConfiguration`,
`PublishCloudWatchMetricsEnabled`, `RequesterPaysEnabled`, `ResultConfiguration` and `EngineVersion`.

`CreateWorkGroup` has no state field. A workgroup a template disables is created and then updated,
and the state reads back either way.

## Named queries from a template

`AWS::Athena::NamedQuery` saves SQL under a name. A named query belongs to a workgroup, and one
naming no workgroup goes in `primary`.

```typescript sim-athena-cloudformation-named-query
/**
 * An AWS::Athena::NamedQuery registering a rollup against a workgroup.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "rainlytics",
  template: {
    Resources: {
      Queries: {
        Type: "AWS::Athena::WorkGroup",
        Properties: { Name: "rainlytics" },
      },
      Pageviews: {
        Type: "AWS::Athena::NamedQuery",
        Properties: {
          Name: "pageviews",
          Database: "rainlytics",
          QueryString:
            "SELECT cs_uri_stem, count(*) FROM access_logs GROUP BY 1",
          WorkGroup: { Ref: "Queries" },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

const listed = await simAws
  .athena()
  .listNamedQueries({ input: { WorkGroup: "rainlytics" } });

// 1
console.log(listed.NamedQueryIds?.length);
```

A named query naming a workgroup the stack never made fails its Resource. Registering it would
leave it unreachable, because a listing finds a named query through its workgroup.

## Running a query

`StartQueryExecution` queues a query and answers with an id. The execution reaches `RUNNING` and
then `SUCCEEDED` or `FAILED` on the simulator's background work. A client polling
`GetQueryExecution` sees each state on the way through.

```typescript sim-athena-query-execution
/**
 * Declaring what a query answers, running it, and reading the rows back.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.s3().createBucket({ input: { Bucket: "rainlytics-results" } });
await simAws.athena().createWorkGroup({
  input: {
    Name: "rainlytics",
    Configuration: {
      ResultConfiguration: { OutputLocation: "s3://rainlytics-results/q/" },
    },
  },
});

const sql = "SELECT cs_uri_stem, count(*) FROM access_logs GROUP BY 1";

simAws
  .athena()
  .results()
  .onQuery(sql, {
    columns: ["cs_uri_stem", "views"],
    rows: [["/", "4213"]],
    bytesScanned: 2_000_000,
  });

const started = await simAws.athena().startQueryExecution({
  input: { QueryString: sql, WorkGroup: "rainlytics" },
});

await simAws.backgroundTasksComplete();

const results = await simAws.athena().getQueryResults({
  input: { QueryExecutionId: started.QueryExecutionId },
});

// "4213". The first row holds the column names, as it does on real Athena.
console.log(results.ResultSet?.Rows?.[1]?.Data?.[1]?.VarCharValue);
```

A rule for an exact query wins, then a rule for a workgroup, then the default. `onWorkGroup` covers
every query a stack's rollups run, and `byDefault` covers everything else. Matching is exact, and
the SQL is never parsed, so two queries differing only in whitespace are two different keys.

`failsWith` fails a query instead of answering it. Nothing here reads SQL, so a query that should
fail cannot be discovered on its own. Saying so is what makes a client's failure handling
reachable.

## Tables a query names

A query's `FROM` and `JOIN` clauses are read, and each table they name is looked for in the Glue
Data Catalog for the same account and region. A query naming a table the catalog has no entry for
reaches `FAILED`, carrying Athena's own reason.

That catches a stack whose table never deployed, a database renamed on one side only, and a typo.
Each of them answers a declared result otherwise, and the test written to catch it passes.

```typescript sim-athena-table-resolution
/**
 * A query naming a table the Data Catalog has never heard of.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.s3().createBucket({ input: { Bucket: "rainlytics-results" } });
await simAws.athena().createWorkGroup({
  input: {
    Name: "rainlytics",
    Configuration: {
      ResultConfiguration: { OutputLocation: "s3://rainlytics-results/q/" },
    },
  },
});

simAws
  .glue()
  .createDatabase({ input: { DatabaseInput: { Name: "rainlytics" } } });
simAws.glue().createTable({
  input: {
    DatabaseName: "rainlytics",
    TableInput: { Name: "access_logs" },
  },
});

const started = await simAws.athena().startQueryExecution({
  input: {
    QueryString: "SELECT cs_uri_stem FROM rainlytics.acess_logs",
    WorkGroup: "rainlytics",
  },
});

await simAws.backgroundTasksComplete();

const execution = await simAws.athena().getQueryExecution({
  input: { QueryExecutionId: started.QueryExecutionId },
});

// "FAILED"
console.log(execution.QueryExecution?.Status?.State);
// names awsdatacatalog.rainlytics.acess_logs
console.log(execution.QueryExecution?.Status?.StateChangeReason);
```

An unqualified name resolves against `QueryExecutionContext.Database`. A query naming neither fails
saying a schema has to be specified, as Athena does.

Resolution starts once the catalog holds a database. A simulation where nothing created one answers
every query from its declaration. That is how simulated Athena behaved before this existed.

A name a `WITH` clause defined is left alone, and so are a table alias, a subquery and whatever
`UNNEST` produces. `information_schema` resolves without a catalog entry, because Athena serves that
schema itself.

Nothing here plans the query. Reading the table names is a scan, and a statement
it cannot follow runs the way it always did. That covers a statement writing data, a query against a
federated catalog, and anything the scan gets lost in.

## Partition projection

A table configuring [partition projection](https://docs.aws.amazon.com/athena/latest/ug/partition-projection.html "AWS partition projection docs") has that configuration read when a query runs against it. The four projection types are `enum`, `integer`, `date` and `injected`, and all four are expanded into the partition values the table projects.

Projection lives entirely in a Glue table's `Parameters`, which Glue accepts whatever they say. Athena is what reads them, so a mistake in one shows up as a failed query rather than a failed deploy. That is where it shows up here too.

```typescript sim-athena-partition-projection
/**
 * A table whose projected date range names a month that does not exist.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.s3().createBucket({ input: { Bucket: "rainlytics-results" } });
await simAws.athena().createWorkGroup({
  input: {
    Name: "rainlytics",
    Configuration: {
      ResultConfiguration: { OutputLocation: "s3://rainlytics-results/q/" },
    },
  },
});

simAws.glue().createDatabase({
  input: { DatabaseInput: { Name: "rainlytics" } },
});
simAws.glue().createTable({
  input: {
    DatabaseName: "rainlytics",
    TableInput: {
      Name: "access_logs",
      PartitionKeys: [{ Name: "day", Type: "string" }],
      StorageDescriptor: { Location: "s3://rainlytics-logs/cloudfront/" },
      Parameters: {
        "projection.enabled": "true",
        "projection.day.type": "date",
        "projection.day.format": "yyyy-MM-dd",
        "projection.day.range": "2026-13-01,NOW",
        // eslint-disable-next-line no-template-curly-in-string
        "storage.location.template": "s3://rainlytics-logs/logs/${day}/",
      },
    },
  },
});

const started = await simAws.athena().startQueryExecution({
  input: {
    QueryString: "SELECT cs_uri_stem FROM rainlytics.access_logs",
    WorkGroup: "rainlytics",
  },
});

await simAws.backgroundTasksComplete();

const execution = await simAws.athena().getQueryExecution({
  input: { QueryExecutionId: started.QueryExecutionId },
});

// "FAILED"
console.log(execution.QueryExecution?.Status?.State);
// INVALID_TABLE_PROPERTY, naming day and the bound it could not read
console.log(execution.QueryExecution?.Status?.StateChangeReason);
```

A query fails where a partition key carries no `projection.<key>.type`, where a range fails to read, where an `integer` range carries `NOW`, where `storage.location.template` leaves out one of the projected keys, and where an `injected` column goes unconstrained.

`NOW` is read against the simulated clock, along with an offset such as `NOW-3YEARS`. A test that froze time projects the same partitions on every run.

The `WHERE` clause narrows what is projected. `day = '2026-08-25'` and `day IN ('a', 'b')` are the two forms read, and a query carrying `OR` anywhere is left unnarrowed. A filter left unread keeps every projected partition in. That is always the safe answer.

A table with `projection.enabled` absent or false reads the location in its storage descriptor. A table with projection on and no `storage.location.template` gets the Hive layout under that same location, as `<location>/day=2026-08-25/`.

## What a query scans

A query's bytes scanned are measured from the objects it reads. The prefixes come from the table's
partition projection, or from the location in its storage descriptor where a table projects nothing,
and every object under each one counts.

```typescript sim-athena-scanned-bytes
/**
 * A query measured against the objects a test seeded.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.s3().createBucket({ input: { Bucket: "rainlytics-results" } });
await simAws.s3().createBucket({ input: { Bucket: "rainlytics-logs" } });
await simAws.athena().createWorkGroup({
  input: {
    Name: "rainlytics",
    Configuration: {
      ResultConfiguration: { OutputLocation: "s3://rainlytics-results/q/" },
    },
  },
});

simAws.glue().createDatabase({
  input: { DatabaseInput: { Name: "rainlytics" } },
});
simAws.glue().createTable({
  input: {
    DatabaseName: "rainlytics",
    TableInput: {
      Name: "access_logs",
      StorageDescriptor: { Location: "s3://rainlytics-logs/logs/" },
    },
  },
});

await simAws.s3().putObject({
  input: {
    Bucket: "rainlytics-logs",
    Key: "logs/part-0.json",
    Body: "x".repeat(1200),
  },
});

const started = await simAws.athena().startQueryExecution({
  input: {
    QueryString: "SELECT cs_uri_stem FROM rainlytics.access_logs",
    WorkGroup: "rainlytics",
  },
});

await simAws.backgroundTasksComplete();

const execution = await simAws.athena().getQueryExecution({
  input: { QueryExecutionId: started.QueryExecutionId },
});

// 1200
console.log(execution.QueryExecution?.Statistics?.DataScannedInBytes);
```

A query filtering on a projected partition key reads only the prefixes that filter allows. A
partitioned table then scans less than an unpartitioned one, and a test can prove it.

The listing goes through simulated S3 under the caller that started the query, as Athena reads a
table's data under the identity that asked for it. A caller who cannot read the Bucket fails the
query, and the reason names it. A table pointing at a Bucket the simulation never made scans
nothing. A table nobody put data behind is one nobody set up to measure.

A declared `bytesScanned` wins where a test writes one down. That keeps a test able to drive the
guardrail without seeding an object.

## The bytes scanned cutoff

A query whose bytes scanned pass the workgroup's `BytesScannedCutoffPerQuery` reaches `FAILED`. This
is the one guardrail this simulation enforces for real, and it is enforced against what the objects
under the query's prefixes come to.

```typescript sim-athena-bytes-scanned-cutoff
/**
 * A workgroup's cost guardrail refusing a query that scans too much.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.s3().createBucket({ input: { Bucket: "rainlytics-results" } });
await simAws.athena().createWorkGroup({
  input: {
    Name: "rainlytics",
    Configuration: {
      BytesScannedCutoffPerQuery: 10_000_000,
      ResultConfiguration: { OutputLocation: "s3://rainlytics-results/q/" },
    },
  },
});

const unpartitioned = "SELECT * FROM rainlytics.access_logs";

simAws
  .athena()
  .results()
  .onQuery(unpartitioned, { rows: [["4213"]], bytesScanned: 40_000_000 });

const started = await simAws.athena().startQueryExecution({
  input: { QueryString: unpartitioned, WorkGroup: "rainlytics" },
});

await simAws.backgroundTasksComplete();

const execution = await simAws.athena().getQueryExecution({
  input: { QueryExecutionId: started.QueryExecutionId },
});

// "FAILED"
console.log(execution.QueryExecution?.Status?.State);

// Names the limit and what the query scanned.
console.log(execution.QueryExecution?.Status?.StateChangeReason);
```

`GetQueryExecution` reports the bytes scanned in `Statistics` whichever way the query ended. A
caller costing a mistake can still read it.

A repeated `ClientRequestToken` answers with the execution it started the first time. A client
retrying after a timeout is charged once.

## Where results go

Results are written to the output location as a CSV object named for the execution,
`<prefix>/<QueryExecutionId>.csv`. `GetQueryExecution` reports the object itself, not the prefix
it sits under.

A workgroup with `EnforceWorkGroupConfiguration` set sends results to its own location whatever the
request asked for. Without it, a request naming a `ResultConfiguration.OutputLocation` wins and a
request naming none falls back to the workgroup's. A query with neither is refused before it is
queued.

The write goes through simulated S3 as the caller that started the query, since Athena writes a
result under the identity that asked for it. A caller who cannot write to the Bucket gets a `FAILED`
execution saying so.

## Reading a workgroup back

`GetWorkGroup`, `ListWorkGroups`, `CreateWorkGroup`, `UpdateWorkGroup` and `DeleteWorkGroup` all
work through the SDK, and `simAws.athena().findWorkGroup(name)` reads one back without going through
a command and its authorization.

```typescript sim-athena-work-group-accessor
/**
 * Reading a simulated workgroup's cutoff without an SDK command.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.athena().createWorkGroup({
  input: {
    Name: "rainlytics",
    Configuration: { BytesScannedCutoffPerQuery: 512 },
  },
});

// 512
console.log(
  simAws.athena().findWorkGroup("rainlytics")?.bytesScannedCutoffPerQuery,
);
```

`UpdateWorkGroup` merges field by field, as real Athena does. A field the update leaves out
keeps what the workgroup already had, and clearing one takes its own removal flag:
`RemoveBytesScannedCutoffPerQuery`, or `RemoveOutputLocation` and its siblings inside
`ResultConfigurationUpdates`.

## The primary workgroup

Every account and region scope starts with `primary`, which real Athena makes with the account. A
`CreateNamedQuery` or `ListNamedQueries` naming no workgroup lands there, and `primary` cannot be
deleted.

Deleting any other workgroup that still holds named queries needs `RecursiveDeleteOption`, which
takes them with it. A stack teardown always deletes recursively. A stack that made both goes down
in one go.

## Authorization

Every command is authorized against the workgroup ARN,
`arn:aws:athena:<region>:<account>:workgroup/<name>`. Real Athena gives a named query no ARN of its
own and authorizes work on one against the workgroup it belongs to. This asks the same question.
`ListWorkGroups` names no workgroup, so IAM evaluates it against `*`.

## Available functionality

- Query executions, moving through `QUEUED` and `RUNNING` to `SUCCEEDED`, `FAILED` or `CANCELLED`
- `StartQueryExecution`, `GetQueryExecution`, `GetQueryResults` and `StopQueryExecution`
- Table names in `FROM` and `JOIN` resolved against the simulated Glue Data Catalog
- Partition projection evaluated, covering `enum`, `integer`, `date` and `injected`
- Bytes scanned measured from the objects under the prefixes a query reads
- `BytesScannedCutoffPerQuery` enforced against that measurement, or against a declared figure
- Result sets written to the workgroup's output location as CSV, under the caller's own identity
- Workgroups, scoped by account and region, with `primary` there from the start
- `CreateWorkGroup`, `GetWorkGroup`, `UpdateWorkGroup`, `DeleteWorkGroup` and `ListWorkGroups`
- Named queries, with `CreateNamedQuery`, `GetNamedQuery`, `BatchGetNamedQuery`, `ListNamedQueries`
  and `DeleteNamedQuery`
- `AWS::Athena::WorkGroup`, answering `Ref` with the name and `Fn::GetAtt` with `CreationTime`
- `AWS::Athena::NamedQuery`, answering `Ref` and `Fn::GetAtt NamedQueryId` with the query id
- IAM authorization against the workgroup ARN
- Paging on both listings, by `MaxResults` and `NextToken`

## Limitations

Current documented limitations:

- No SQL is evaluated. Nothing plans or runs a query, no S3 object is read to answer one, and every
  row comes from a declaration a test wrote. Simulated Athena will therefore accept a query real
  Athena would reject.
- The table names in `FROM` and `JOIN` are the one part of a query that is read, and they are found
  by a scan. A statement the scan cannot follow runs with its tables never
  looked for, which covers `CREATE TABLE AS SELECT`, `INSERT INTO`, `MSCK REPAIR TABLE`, `SHOW` and
  `DESCRIBE`. Only the table is resolved. Columns, types and everything else a planner checks stay
  out of reach.
- Table resolution starts once the Data Catalog holds a database. Every query in a simulation
  holding none is answered from its declaration.
- Partition projection is expanded and checked. The objects under the prefixes it comes to are
  listed for their sizes and never opened. A projection naming partitions the Bucket never held
  scans nothing and passes.
- A projected date's format understands `y`, `M`, `d`, `H`, `m` and `s`, which covers the patterns a
  partition path is written in. The wider `SimpleDateFormat` grammar stays out of reach.
- The `WHERE` clause is read for `column = 'value'` and `column IN ('a', 'b')` only, and a query
  carrying `OR` anywhere is left unnarrowed. A partition narrowed less than real Athena would narrow
  it costs a wider scan here, and the answer stays the same.
- A table projecting more than 20,000 partitions fails the query. Real Athena has a limit of its own
  and this one is the simulation's.
- An `enum` projection has the spaces around each of its values trimmed, so `a, b` is two values
  rather than `a` and ` b`. Whether real Athena trims them is unverified.
- An `integer` projection takes bounds inside JavaScript's safe integer range, and a bound beyond it
  is refused. Athena's own range runs to the signed 64 bit limit.
- `MILLISECONDS` is absent from the interval units, and a pattern carrying `S` is read as literal
  text. A partition path written to the millisecond falls outside this.
- Partitions registered through the Glue Partitions API are absent, along with `MSCK REPAIR TABLE`
  and `ALTER TABLE ADD PARTITION`. A table without projection reads its storage descriptor location
  as the one prefix it has.
- A query naming a catalog other than `awsdatacatalog` runs with its tables never looked for.
  Federated catalogs and `AWS::Athena::DataCatalog` fall outside this simulation.
- Bytes scanned are the total size of every object under the prefixes a query reads. Real Athena
  reads only the columns a query asks for and counts compressed bytes, so it reports a smaller
  figure for the same data in a columnar format. A cutoff test written here therefore fires on less
  data than production would need.
- A declared `bytesScanned` overrides the measurement entirely.
- A query that exceeds the cutoff reaches `FAILED` here. AWS documents the per-query data usage
  control as cancelling a query. So a client matching on `FAILED` passes here and misses the
  cancellation in production, and one matching on `CANCELLED` fails here while being right in
  production. Match on the state being terminal, and read `StateChangeReason` for the why.
- `GetQueryResults` pages up to 1000 rows, as Athena does. The listings of workgroups and named
  queries stop at 50, which is their own documented maximum.
- `ListQueryExecutions`, `BatchGetQueryExecution` and `GetQueryRuntimeStatistics` are absent, along
  with query result reuse, result encryption, `CREATE TABLE AS SELECT` and `INSERT INTO`.
- Real Athena's own floor for the bytes scanned cutoff is 10MB. This simulation takes any whole
  number of bytes from 1 up, putting the guardrail wherever the query a test is exercising needs
  it. A cutoff of zero or a fraction is still refused.
- `ResultConfiguration` is stored and returned in full, and `OutputLocation` is the only field that
  means anything. The encryption configuration, the ACL configuration and the expected bucket owner
  come back as they were set, and stay unapplied.
- `EnforceWorkGroupConfiguration` decides the output location and nothing else. Real Athena's
  override rules are per field and cover the encryption configuration, the expected bucket owner
  and the ACL as well, and a request naming one of those has it taken whatever the workgroup says.
- `PublishCloudWatchMetricsEnabled`, `RequesterPaysEnabled` and `EngineVersion` are stored and
  returned unacted on. No metric is published, no requester is billed and no engine is chosen.
- A query's `EngineExecutionTimeInMillis` is measured on the simulated clock. A query that ran
  between two ticks of a frozen clock took no time at all.
- A named query's SQL goes unparsed. Text an engine would reject is stored and handed back exactly
  as it was sent.
- `AWS::Athena::DataCatalog`, `AWS::Athena::PreparedStatement` and
  `AWS::Athena::CapacityReservation` fall outside this simulation. A template declaring one is
  recorded on the stack's `skippedResources` and the rest of the stack deploys.
- A named query's `Database` is a string simulated Athena leaves unresolved. A saved query naming a
  database the Data Catalog has never heard of is stored all the same. Resolution happens when a
  query runs rather than when one is saved.
- Workgroup tags, prepared statements, capacity reservations, query result reuse and Athena for
  Spark are all absent.
- A `WorkGroupConfiguration` setting this simulation has no answer for, such as `ExecutionRole`,
  `AdditionalConfiguration` or `IdentityCenterConfiguration`, is recorded on the stack's
  `ignoredProperties` and the workgroup deploys without it.
- Athena has no HTTP API under `serveSimAws`.
