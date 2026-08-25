import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

const pageviewsSql = `SELECT cs_uri_stem, count(*) AS views
FROM rainlytics.access_logs
GROUP BY 1 ORDER BY 2 DESC`;

const rollupsTemplate = {
  Resources: {
    RainlyticsQueries: {
      Type: "AWS::Athena::WorkGroup",
      Properties: { Name: "rainlytics" },
    },
    PageviewsQuery: {
      Type: "AWS::Athena::NamedQuery",
      Properties: {
        Name: "pageviews",
        Description: "Pageviews by path",
        Database: "rainlytics",
        QueryString: pageviewsSql,
        WorkGroup: { Ref: "RainlyticsQueries" },
      },
    },
  },
  Outputs: {
    QueryRef: { Value: { Ref: "PageviewsQuery" } },
    QueryId: { Value: { "Fn::GetAtt": ["PageviewsQuery", "NamedQueryId"] } },
  },
};

describe("AWS::Athena::NamedQuery", () => {
  it("registers the named query a template declares", async () => {
    // Given a template registering a rollup as a named query, so the console
    // shows what the CLI runs.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rainlytics-stack",
      template: rollupsTemplate,
    });

    await stack.waitForDeployComplete();

    // Then nothing was skipped, and the query is readable through the SDK in
    // the workgroup the Ref resolved to.
    assertArrayLength(stack.skippedResources, 0);

    const namedQueryId = stack.outputs.get("QueryRef")?.value;

    assertTypeString(namedQueryId);

    const read = await simAws
      .athena()
      .getNamedQuery({ input: { NamedQueryId: namedQueryId } });
    const namedQuery = read.NamedQuery;

    assertNonNullable(namedQuery);
    assertIdentical(namedQuery.Name, "pageviews");
    assertIdentical(namedQuery.Description, "Pageviews by path");
    assertIdentical(namedQuery.Database, "rainlytics");
    assertIdentical(namedQuery.QueryString, pageviewsSql);
    assertIdentical(namedQuery.WorkGroup, "rainlytics");
    assertIdentical(stack.outputs.get("QueryId")?.value, namedQueryId);

    await simAws.backgroundTasksComplete();
  });

  it("finds a deployed named query through its workgroup", async () => {
    // Given the same stack deployed.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rainlytics-stack",
      template: rollupsTemplate,
    });

    await stack.waitForDeployComplete();

    // When the workgroup's named queries are listed, which is what the console
    // does.
    const listed = await simAws
      .athena()
      .listNamedQueries({ input: { WorkGroup: "rainlytics" } });

    // Then the deployed query is in it.
    assertArrayLength(listed.NamedQueryIds ?? [], 1);
    assertIdentical(
      listed.NamedQueryIds?.[0],
      stack.outputs.get("QueryRef")?.value,
    );

    await simAws.backgroundTasksComplete();
  });

  it("puts a named query naming no workgroup in primary", async () => {
    // Given a template leaving the workgroup out, which real Athena reads as
    // primary.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rainlytics-stack",
      template: {
        Resources: {
          AdHoc: {
            Type: "AWS::Athena::NamedQuery",
            Properties: {
              Name: "adhoc",
              Database: "rainlytics",
              QueryString: "SELECT 1",
            },
          },
        },
      },
    });

    // When it is deployed.
    await stack.waitForDeployComplete();

    // Then the query is in primary, which every scope has without creating it.
    assertIdentical(
      simAws.athena().namedQueries()[0]?.workGroupName,
      "primary",
    );

    await simAws.backgroundTasksComplete();
  });

  it("records a named query property Athena has no such thing as", async () => {
    // Given a template carrying a property nothing in Athena defines.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rainlytics-stack",
      template: {
        Resources: {
          AdHoc: {
            Type: "AWS::Athena::NamedQuery",
            Properties: {
              Name: "adhoc",
              Database: "rainlytics",
              QueryString: "SELECT 1",
              Nonsense: "value",
            },
          },
        },
      },
    });

    // When it is deployed.
    await stack.waitForDeployComplete();

    // Then the query is still registered, and the property is recorded.
    assertArrayLength(simAws.athena().namedQueries(), 1);
    assertTrue(
      stack.ignoredProperties.some((ignored) => ignored.path === "Nonsense"),
    );

    await simAws.backgroundTasksComplete();
  });

  it("deletes the named query with the stack that made it", async () => {
    // Given a deployed stack holding a workgroup and a query in it.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rainlytics-stack",
      template: rollupsTemplate,
    });

    await stack.waitForDeployComplete();

    // When the stack is deleted.
    await simAws
      .cloudFormation()
      .deleteStack({ input: { StackName: "rainlytics-stack" } });
    await simAws.backgroundTasksComplete();

    // Then both went with it, and the workgroup deleted without the stack
    // having to ask for a recursive delete.
    assertArrayLength(simAws.athena().namedQueries(), 0);
    assertUndefined(simAws.athena().findWorkGroup("rainlytics"));
  });

  it("fails a named query naming a workgroup the stack never created", async () => {
    // Given a template pointing a query at a workgroup nothing makes, which a
    // stack that lost its workgroup in a refactor does.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "rainlytics-stack",
        template: {
          Resources: {
            Pageviews: {
              Type: "AWS::Athena::NamedQuery",
              Properties: {
                Name: "pageviews",
                Database: "rainlytics",
                QueryString: pageviewsSql,
                WorkGroup: "gone",
              },
            },
          },
        },
      });
    });

    // And it names the Resource, rather than registering a query nothing
    // could ever list.
    assertStringIncludes(
      error.message,
      "Invalid AWS::Athena::NamedQuery Resource Pageviews",
    );
    assertStringIncludes(error.message, "WorkGroup gone is not found");

    await simAws.backgroundTasksComplete();
  });

  it("fails a named query property of the wrong type", async () => {
    // Given a template whose query text is a number.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "rainlytics-stack",
        template: {
          Resources: {
            Pageviews: {
              Type: "AWS::Athena::NamedQuery",
              Properties: {
                Name: "pageviews",
                Database: "rainlytics",
                QueryString: 42,
              },
            },
          },
        },
      });
    });

    // And it says which property was wrong.
    assertStringIncludes(error.message, "QueryString must be a string");

    await simAws.backgroundTasksComplete();
  });

  it("refuses an Athena Resource type this simulation does not create", async () => {
    // Given a template declaring a data catalog, which needs machinery this
    // simulation has none of.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rainlytics-stack",
      template: {
        Resources: {
          Catalog: {
            Type: "AWS::Athena::DataCatalog",
            Properties: { Name: "rainlytics", Type: "GLUE" },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the Resource is recorded as skipped and the stack still deploys,
    // rather than a catalog that does nothing standing in for one.
    const skipped = stack.skippedResources[0];

    assertNonNullable(skipped);
    assertIdentical(skipped.logicalId, "Catalog");
    assertStringIncludes(
      String(skipped.skippedReason),
      "Unsupported sim Athena CloudFormation Resource DataCatalog",
    );

    await simAws.backgroundTasksComplete();
  });
});
