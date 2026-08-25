# Simulated Athena

Yulin includes a simulated Amazon Athena for tests and local development. It holds workgroups and
named queries, and hands both back through the SDK.

No SQL is evaluated. A test declares what a query answers with, and the simulation reads the query
text only as a key to match that declaration on. So a test can prove its bytes-scanned cutoff
refuses a query, that results land where the workgroup says, and that a client polls the lifecycle
correctly. Whether the SQL is valid stays out of reach. The [Limitations](#limitations) at the end
say what that leaves out.

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

const started = await simAws
  .athena()
  .startQueryExecution({
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

## The bytes scanned cutoff

A query whose declared bytes scanned passes the workgroup's `BytesScannedCutoffPerQuery` reaches
`FAILED`. This is the one guardrail this simulation enforces for real.

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

// "FAILED", with a StateChangeReason naming the limit and what was scanned.
console.log(execution.QueryExecution?.Status?.State);
```

`GetQueryExecution` reports the bytes scanned in `Statistics` whichever way the query ended. A
caller costing a mistake can still read it.

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
- `BytesScannedCutoffPerQuery` enforced against what a declaration says a query scanned
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

- No SQL is evaluated. Nothing parses, plans or runs a query, no Glue table or S3 object is read to
  answer one, and every row comes from a declaration a test wrote. Simulated Athena will therefore
  accept a query real Athena would reject.
- What a query scanned comes from that same declaration. The cutoff is enforced for real against
  that figure, which is a test's own statement about the query.
- A query that exceeds the cutoff reaches `FAILED` here. AWS documents the per-query data usage
  control as cancelling a query. A client matching on `CANCELLED` for this case would pass here
  and miss it on real Athena.
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
- A named query's `Database` is a string simulated Athena leaves unresolved. Yulin does simulate the
  [Glue Data Catalog](https://yulinsim.dev/services/glue/ "Simulated Glue usage docs"), and a saved
  query naming a database that catalog has never heard of is stored all the same.
- Workgroup tags, prepared statements, capacity reservations, query result reuse and Athena for
  Spark are all absent.
- A `WorkGroupConfiguration` setting this simulation has no answer for, such as `ExecutionRole`,
  `AdditionalConfiguration` or `IdentityCenterConfiguration`, is recorded on the stack's
  `ignoredProperties` and the workgroup deploys without it.
- Athena has no HTTP API under `serveSimAws`.
