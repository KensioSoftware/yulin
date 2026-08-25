# Simulated Athena

Yulin includes a simulated Amazon Athena for tests and local development. It holds workgroups and
named queries, and hands both back through the SDK.

No SQL is evaluated. A workgroup here carries the settings a query would run under, and a named
query carries the text somebody saved. Everything stops there. A test can prove its stack
configured the bytes-scanned cutoff and registered its rollups. Whether the SQL is valid stays out
of reach. The [Limitations](#limitations) at the end say what that leaves out.

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

`UpdateWorkGroup` merges rather than replaces, as real Athena does. A field the update leaves out
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

- The query execution API is absent. `StartQueryExecution`, `GetQueryExecution`, `GetQueryResults`
  and `StopQueryExecution` all refuse as unsupported Commands, along with every command around an
  execution. Simulated Athena will therefore accept a query real Athena would reject, because the
  SQL goes unread.
- `BytesScannedCutoffPerQuery` is held and handed back, unmeasured. A test can prove the guardrail
  was configured, and proving that it refuses a query has to wait.
- Real Athena's own floor for that cutoff is 10MB. This simulation takes any whole number of bytes
  from 1 up, so a test can put the guardrail where the query it is exercising needs it. A cutoff of
  zero or a fraction is still refused.
- `ResultConfiguration` is stored and returned in full, and `OutputLocation` is the only field that
  means anything. The encryption configuration, the ACL configuration and the expected bucket owner
  come back as they were set, and stay unapplied.
- `EnforceWorkGroupConfiguration`, `PublishCloudWatchMetricsEnabled`, `RequesterPaysEnabled` and
  `EngineVersion` are stored and returned unacted on. With the query gone, so is every effect they
  would have had, from overriding a request to publishing a metric.
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
