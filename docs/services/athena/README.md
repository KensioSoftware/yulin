# Simulated Athena

Yulin includes a simulated Amazon Athena for tests and local development. It holds workgroups and
named queries, and hands both back through the SDK.

A query is answered one of two ways. A test declares what it answers with, and the simulation
matches that declaration on the query text. Or the
[query engine](#running-a-query-for-real) runs the SQL for real over the objects a test seeded into
simulated S3. The engine is off until a test turns it on, and it needs one package added to the
project.

Either way the lifecycle around the query is real. A test can prove its bytes-scanned cutoff
refuses a query, that results land where the workgroup says, and that a client polls the lifecycle
correctly. The tables a query names are looked for in the simulated
[Glue Data Catalog](https://yulinsim.dev/services/glue/ "Simulated Glue usage docs"), and a query
naming one that is absent fails the way real Athena fails it. The
[Limitations](#limitations) at the end say what this leaves out.

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
every query a stack's rollups run, and `byDefault` covers everything else. Matching is exact, on the
query text as it was sent, so two queries differing only in whitespace are two different keys.

The query engine sits between the two tiers. A rule for an exact query is ahead of it and the
workgroup rule and the default are behind it.

`failsWith` fails a query instead of answering it. Nothing here reads SQL, so a query that should
fail cannot be discovered on its own. Saying so is what makes a client's failure handling
reachable.

## Running a query for real

The query engine answers a `SELECT` from the objects a test seeded into simulated S3. It reads the
table's schema out of the Glue Data Catalog, decodes each object with the SerDe the table declares,
loads the rows into an in-memory SQLite database, and answers the statement from them. Roughly
nineteen queries in twenty of the shapes a test writes run this way.

The engine is off until a test turns it on, and it needs `node-sql-parser` in the project. The
parser is an optional peer dependency, so a project that never runs a query never installs it.

```bash
pnpm add -D node-sql-parser
```

`engine().enable()` turns the engine on and loads the parser. It raises where the package is absent,
naming what to add.

```typescript sim-athena-query-engine
/**
 * A query answered from the objects a test seeded, rather than from a
 * declaration.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.s3().createBucket({ input: { Bucket: "rainlytics-logs" } });
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
      StorageDescriptor: {
        Columns: [
          { Name: "url", Type: "string" },
          { Name: "status", Type: "int" },
          { Name: "bytes", Type: "bigint" },
        ],
        Location: "s3://rainlytics-logs/cloudfront/",
        SerdeInfo: {
          SerializationLibrary: "org.openx.data.jsonserde.JsonSerDe",
        },
      },
    },
  },
});

await simAws.s3().putObject({
  input: {
    Bucket: "rainlytics-logs",
    Key: "cloudfront/day=2026-08-01/part-0.json",
    Body: [
      '{"url":"/","status":200,"bytes":1200}',
      '{"url":"/pricing","status":404,"bytes":310}',
      '{"url":"/pricing","status":404,"bytes":305}',
    ].join("\n"),
  },
});

// node-sql-parser has to be in the project for this line to work.
await simAws.athena().engine().enable();

const started = await simAws.athena().startQueryExecution({
  input: {
    QueryString:
      "SELECT url, count(*) AS hits, sum(bytes) AS total " +
      "FROM rainlytics.access_logs WHERE status >= 400 AND day = '2026-08-01' " +
      "GROUP BY url ORDER BY hits DESC",
    WorkGroup: "rainlytics",
  },
});

await simAws.backgroundTasksComplete();

const results = await simAws.athena().getQueryResults({
  input: { QueryExecutionId: started.QueryExecutionId },
});

// ["/pricing", "2", "615"], computed from the objects.
console.log(
  results.ResultSet?.Rows?.[1]?.Data?.map((cell) => cell.VarCharValue),
);

// "engine", which is how a test proves the rows came from the data.
console.log(simAws.athena().queryExecutions()[0]?.answeredBy);
```

A declaration written against one exact query text still wins. That is the escape hatch for a
statement the engine gets wrong, and it is why `results()` is unchanged. Everything the engine turns
down falls back to the declarations, where a workgroup rule or the default answers it. `answeredBy`
on the execution says which of the two answered, and a test that wants the engine can assert on it.

The engine turns a query down where the parser refuses the statement, where SQLite refuses to run
it, where a table declares a format it has no reader for, and where an object it needs cannot be
opened. Every one of those ends the same way, with the declared result answering.

### The objects it reads

The SerDe class name in the table's storage descriptor says how its objects are decoded.

- `org.openx.data.jsonserde.JsonSerDe`, `org.apache.hive.hcatalog.data.JsonSerDe` and
  `org.apache.hadoop.hive.serde2.JsonSerDe` read JSON lines, one record per line.
- `org.apache.hadoop.hive.serde2.OpenCSVSerde` reads comma separated text with `"` around a field
  that needs it.
- `org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe` reads the delimiter `field.delim` names,
  which defaults to the control character Hive uses.

`separatorChar`, `quoteChar` and `escapeChar` in the SerDe's parameters override those defaults, and
`skip.header.line.count` on the table drops the first lines of every object. An empty field reads as
null, along with Hive's `\N`. A boolean column reads `true`, `false`, `1` and `0`, and any other
text in one reads as null.

A nested object or array is kept as its JSON text, and `json_extract_scalar`, `cardinality` and
`element_at` reach into it.

An object's key says how it is compressed. A key ending `.gz`, `.zst` or `.deflate` is decompressed
before the SerDe reads it. A CloudFront standard logging table needs that, since every object
delivered under one is gzipped. Node's own zlib covers those three codecs. A key ending `.bz2`,
`.bzip2`, `.lz4`, `.lzo` or `.snappy` turns the query down, and the declaration a test wrote answers
it. Any other key is read as text.

A `mapping.<column>` parameter on the OpenX JSON SerDe reads that column from the key it names. A
CloudFront access log table needs it, since a record arrives keyed by `cs(Referer)` and no Athena
column can be called that. The key matches a record's key of any case until the table sets
`case.insensitive` to `FALSE`, and after that it matches as written. A mapped column reads null
where the record holds no such key, including where the record holds a key of the column's own
name. The Hive JSON SerDes have no `mapping` property, and their columns read by name.

A partition column's value comes from the partition the object sits in. A table projecting its
partitions takes it from the projection, and a table laid out Hive style under its own location
takes it from the `key=value` segments of the object's key. Either way the column reads on every
row, though no object holds it.

### What it answers with

Column types come from the Glue schema, written the way Athena writes them, so Hive's `string`
reports as `varchar` and its `int` as `integer`. A boolean column reads as `true` and `false`. A
computed column has no schema entry behind it, and its type is read off the first value that is not
null.

Two rewrites keep an answer the same as Athena's. `PRAGMA case_sensitive_like` is set on the
database, because SQLite matches `LIKE` without regard to case for ASCII and Athena matches it with.
Every ascending sort is emitted carrying `NULLS LAST`, because Trino orders nulls last whichever
direction it sorts and SQLite orders them first ascending. Both were cases where a query answered
differently while still succeeding, which is the failure that costs the most to find.

### Flattening an array or a map

`UNNEST` runs. An array or a map column is held as its JSON text, and SQLite reads that with
`json_each`, so a statement flattening one returns a row per element the way Athena does.

```sql
SELECT e.id, t.tag
FROM rainlytics.events e
CROSS JOIN UNNEST(e.tags) AS t(tag)
```

An array flattens to one column and a map flattens to two, the key beside the value, as
`UNNEST(e.attrs) AS t(attribute, value)`. `WITH ORDINALITY` adds the position, counted from one.
The Glue schema is what says which of the two a column holds, and a column it calls anything else
falls back rather than reading a scalar as a collection.

One flattening per statement is what this covers, joined with `CROSS JOIN`. A second `UNNEST`, a
`LEFT JOIN UNNEST`, a `SELECT *` beside one, and a position taken from a map all fall back.

### The functions a statement can call

SQLite carries a much smaller function library than Trino, and the engine fills the gap for the ones
a test reaches for. SQLite refuses a function absent from this list, and the query then falls back to
its declared result.

| Family        | Functions                                                                                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date and time | `current_date`, `current_timestamp`, `date_add`, `date_diff`, `date_trunc`, `date_format`, `at_timezone`, `from_unixtime`, `to_unixtime`, `from_iso8601_timestamp`, `from_iso8601_date`, `to_iso8601` |
| JSON          | `json_extract`, `json_extract_scalar`, `json_parse`, `json_size`                                                                                                                                      |
| Array and map | `array_agg`, `cardinality`, `contains`, `element_at`, `array_join`, `slice`                                                                                                                           |
| String        | `regexp_like`, `regexp_extract`, `regexp_replace`, `split_part`, `strpos`                                                                                                                             |
| URL           | `url_extract_host`, `url_extract_path`, `url_extract_protocol`, `url_extract_port`, `url_extract_query`, `url_extract_fragment`, `url_extract_parameter`, `url_decode`, `url_encode`                  |
| Approximate   | `approx_distinct`, `approx_percentile`                                                                                                                                                                |

`substr` and `format` are SQLite's own. Both count from one and take the same `%s` and `%d` a
statement writes, so shadowing either would replace something that works.

`current_date` and `current_timestamp` read the simulator's clock. A test that froze time gets the
instant it froze, and the same test answers the same way on every machine. Athena reads both at the
instant the query started, which is what the execution records.

A function that cannot answer faithfully raises rather than guessing, and the query falls back.
`date_add` with a unit Trino does not name, `slice` starting at zero, `array_join` over an array of
objects, and `regexp_extract` naming a capture group the pattern has not got all land there. A null
answer would be a wrong answer wearing the shape of a right one.

A function answers null where any argument is null, the way Trino's do. An argument left out takes
its default and an argument written as `NULL` does not, so `regexp_extract(url, 'a', NULL)` answers
null where `regexp_extract(url, 'a')` reads the whole match.

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

A table with projection on and no `storage.location.template` gets the Hive layout under its own location, as `<location>/day=2026-08-25/`.

## Names are folded to lower case

Athena accepts mixed case in a query and lower cases the names when it executes it. A query naming `Rainlytics.Access_Logs` resolves against the table the catalog holds as `rainlytics.access_logs`, and so does one naming `"Rainlytics"."Access_Logs"`. Quoting an identifier says what characters it may hold rather than what case it keeps.

The database in a query's execution context folds the same way, and a refusal names the table the way Athena went looking for it. Simulated [Glue](https://yulinsim.dev/services/glue/ "Simulated Glue usage docs") folds a database and a table name when it stores one, so both ends of the lookup agree.

Column names are left alone here. Real Athena folds those too, and nothing in this simulation resolves a column by name.

## Registered partitions

A table that registers its partitions rather than projecting them is read from the catalog. A query against one reads a prefix per registered partition, taken from that partition's own storage descriptor location, and the `WHERE` clause narrows them the way it narrows projected ones.

```typescript sim-athena-registered-partitions
/**
 * A query over a table whose partitions the catalog holds.
 */

import {
  CreateDatabaseCommand,
  CreatePartitionCommand,
  CreateTableCommand,
} from "@aws-sdk/client-glue";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const glue = simAws.glue();

await simAws.s3().createBucket({ input: { Bucket: "rainlytics-logs" } });
await simAws.s3().createBucket({ input: { Bucket: "rainlytics-results" } });

glue.createDatabase(
  new CreateDatabaseCommand({ DatabaseInput: { Name: "rainlytics" } }),
);
glue.createTable(
  new CreateTableCommand({
    DatabaseName: "rainlytics",
    TableInput: {
      Name: "access_logs",
      PartitionKeys: [{ Name: "day", Type: "string" }],
      StorageDescriptor: { Location: "s3://rainlytics-logs/logs/" },
    },
  }),
);

for (const day of ["2026-08-25", "2026-08-26"]) {
  glue.createPartition(
    new CreatePartitionCommand({
      DatabaseName: "rainlytics",
      TableName: "access_logs",
      PartitionInput: {
        Values: [day],
        StorageDescriptor: { Location: `s3://rainlytics-logs/logs/${day}/` },
      },
    }),
  );

  await simAws.s3().putObject({
    input: {
      Bucket: "rainlytics-logs",
      Key: `logs/${day}/part-0.json`,
      Body: "x".repeat(1000),
    },
  });
}

const { QueryExecutionId } = await simAws.athena().startQueryExecution({
  input: {
    QueryString:
      "SELECT url FROM rainlytics.access_logs WHERE day = '2026-08-26'",
    ResultConfiguration: { OutputLocation: "s3://rainlytics-results/q/" },
  },
});

await simAws.backgroundTasksComplete();

const execution = await simAws
  .athena()
  .getQueryExecution({ input: { QueryExecutionId } });

// 1000
console.log(execution.QueryExecution?.Statistics?.DataScannedInBytes);
```

A partition registered with no location of its own falls back to the Hive layout under the table's location, as `<location>/day=2026-08-26/`. A partition registered somewhere else entirely is read there, which is something a table location alone could never reach.

Projection wins where a table carries both. Real Athena stops reading the catalog's partitions once `projection.enabled` is true, and that is the whole reason for turning it on.

A table with neither reads the location in its storage descriptor, and the query reads everything under it.

## What a query scans

A query's bytes scanned are measured from the objects it reads. The prefixes come from the table's
partition projection, from the partitions the catalog holds against it, or from the location in its
storage descriptor where a table has neither. Every object under each one counts.

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

A query filtering on a partition key reads only the prefixes that filter allows, whether the
partitions were projected or registered. A partitioned table then scans less than an unpartitioned
one, and a test can prove it.

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
- A `SELECT` run for real over JSON lines and CSV objects in simulated S3, answered by SQLite
- `UNNEST` over an array or a map column, with `WITH ORDINALITY` where a query wants the position
- Trino's date, JSON, array, string and URL functions, with `current_timestamp` reading the
  simulated clock
- Declared results, matched on the query text, ahead of the engine for one statement and behind it
  for everything else
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

- With the engine off, no SQL is evaluated. Nothing plans or runs a query, no S3 object is read to
  answer one, and every row comes from a declaration a test wrote. Simulated Athena will therefore
  accept a query real Athena would reject.
- With the engine on, the statement is read as Athena by `node-sql-parser`, written back out for
  SQLite and run there. Around one query in twenty is turned down at one of those two steps and
  falls back to its declared result. `GROUPING SETS` is the measured case, which the parser's
  Athena grammar refuses outright.
- One `UNNEST` per statement is rewritten onto `json_each`, and it has to be a `CROSS JOIN`. A
  statement carrying two, one under a `LEFT JOIN`, one whose alias names no columns, and one
  selecting every column all fall back. So does `WITH ORDINALITY` over a map, since `json_each`
  gives a map's keys rather than its positions.
- `UNNEST` over a `ROW` or a struct array falls back. The element needs field access and the
  flattened column is JSON text here.
- The Trino function library reaches as far as the table under
  [the functions a statement can call](#the-functions-a-statement-can-call). A query reaching for
  anything else Trino has and SQLite lacks falls back.
- `filter` and the other functions taking a lambda are absent, and deliberately unshimmed. SQLite
  reads `->` as its own JSON operator. A name registered for one of them would leave the lambda to
  be read as that operator and answer something, where an absent name fails and falls back.
- `date_add` and `date_diff` count a calendar month by whether moving the first instant reached the
  second. That is how `java.time` counts and so how Trino does. The thirty-first of January to the
  twenty-eighth of February is a whole month.
- `at_timezone` answers with the wall clock of the zone and no zone on it, since a timestamp here
  carries none. Trino answers with a timestamp carrying the zone.
- `json_parse`, `regexp_extract`, `regexp_replace` and the `url_extract` family answer null over
  text they cannot read. Trino fails the query.
- `json_extract` answers with JSON, so a string comes back quoted. SQLite's own unwraps it, and a
  statement comparing the answer against a bare string matches on one and not the other.
- A timestamp carrying a numeric UTC offset falls outside the date functions, and so does one
  written finer than the millisecond. A value written with a `Z` or with no zone at all reads as
  UTC, and a value the date functions cannot read turns the query down.
- A JSON number beyond about fifteen significant digits loses the digits past that, wherever the
  engine reads JSON. An identifier of that size in a JSON lines object comes back rounded, and a
  filter on it can then match the wrong row.
- The `url_extract` family reads a URL the way a browser does, so a percent escape in the path, the
  query or the fragment comes back still escaped and a parameter name is matched decoded. Trino
  reads a URL the way Java does and decodes each of those.
- `url_decode` answers null over text it cannot read back. Trino raises over an escape that names
  no byte, such as `%zz`, and writes a replacement character where the escapes name bytes that are
  no UTF-8, such as `%C3%28`. `url_extract_parameter` decodes its own answer, the way Trino's does.
  A `url_decode` written after it reads the escapes a second time.
- `regexp_replace` takes Trino's own spelling for a named group and an escaped dollar, `${name}`
  and `\$`. The rest of Java's replacement syntax is not translated.
- The date and time functions work on the ISO-8601 text a JSON or CSV object carries. A column
  written any other way gets whatever slicing that text comes to.
- `approx_distinct` and `approx_percentile` are computed exactly. The simulation is more accurate
  than AWS here, and at the scale a test seeds the difference cannot show.
- Three classes of expression the engine accepts are ones real Athena refuses. `1 / 0` answers
  null, `CAST('abc' AS INTEGER)` answers 0, and `1 || 'x'` answers `'1x'`. Each of them fails a
  real query.
- `try_cast` runs as a plain cast. `try_cast('abc' AS integer)` therefore answers 0 where real
  Athena answers null, which is the same forgiving direction as the cast above. Reading the
  statement without the rewrite would turn the whole query down.
- A `decimal` column is held as a double. A value carrying more than about fifteen significant
  digits loses the ones past that, and a filter, a sum or a group on it can then answer
  differently from Athena's exact arithmetic.
- A declaration that fails the query wins from any tier, the engine included. `failsWith` is a
  statement about the query rather than about its rows, so a workgroup rule or a default carrying
  one fails every query it covers whether or not the engine could have answered.
- Parquet and ORC are absent. A table declaring either falls back to its declared result, and so
  does a table declaring no SerDe at all.
- A null in a result row reads as an empty string. Real Athena leaves the value out of the row.
- A computed boolean reads as `1` and `0`. The Glue column type is what makes a boolean column read
  as `true` and `false`, and an expression has no column type behind it.
- An expression nobody named is called `_col0` upward, as Athena calls one. An alias that needed
  quotes around it is renamed the same way.
- The engine reads every object under the prefixes a query reaches and holds the rows in memory.
  That suits the fixture-sized data a test seeds and nothing larger.
- A caller who can list a Bucket and cannot read its objects gets the declared result. A listing
  refused by IAM fails the query, and that is what the bytes scanned measurement exposes.
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
- Partitions registered through the Glue Partitions API are read. Registering one from Athena is
  absent, so `MSCK REPAIR TABLE` and `ALTER TABLE ADD PARTITION` register nothing and a test that
  wants partitions puts them in the catalog through Glue.
- A registered partition's own columns are ignored. The table's schema is what every partition is
  read with, so a table whose schema changed part way through its life reads the newer columns for
  the older partitions too.
- A partition registered with no location, against a table with none either, is read as having
  nowhere to look and contributes no prefix.
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
  with query result reuse, result encryption, `CREATE TABLE AS SELECT` and `INSERT INTO`. A
  statement that writes data runs with its tables never looked for and answers from a declaration.
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
