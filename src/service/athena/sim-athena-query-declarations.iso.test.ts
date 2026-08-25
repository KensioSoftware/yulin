import { faker } from "@faker-js/faker";
import { assertArrayLength, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";

describe("simulated Athena result declarations", () => {
  async function aWorkGroup(simAws: SimAws): Promise<string> {
    const name = `analytics-${faker.string.uuid()}`;

    await simAws.s3().createBucket({ input: { Bucket: "results" } });
    await simAws.athena().createWorkGroup({
      input: {
        Name: name,
        Configuration: {
          ResultConfiguration: { OutputLocation: "s3://results/q/" },
        },
      },
    });

    return name;
  }

  async function rowsOf(
    simAws: SimAws,
    workGroup: string,
    queryString: string,
  ): Promise<readonly string[]> {
    const started = await simAws.athena().startQueryExecution({
      input: { QueryString: queryString, WorkGroup: workGroup },
    });

    await simAws.backgroundTasksComplete();

    const results = await simAws.athena().getQueryResults({
      input: { QueryExecutionId: started.QueryExecutionId },
    });

    return (results.ResultSet?.Rows ?? []).map((row) =>
      String(row.Data?.[0]?.VarCharValue),
    );
  }

  it("answers any query with the default a test declared", async () => {
    // Given a default result and no rule for the query being run, which is
    // what a test asserting on the code around a query wants.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    simAws
      .athena()
      .results()
      .byDefault({
        columns: ["total"],
        rows: [["7"]],
      });

    // When a query nothing declared runs.
    const rows = await rowsOf(simAws, workGroup, "SELECT anything at all");

    // Then the default answered it.
    assertArrayLength(rows, 2);
    assertIdentical(rows[1], "7");
  });

  it("prefers a query rule to a workgroup rule", async () => {
    // Given a workgroup rule covering everything, and a query rule for one
    // statement.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    simAws
      .athena()
      .results()
      .onWorkGroup(workGroup, { rows: [["broad"]] });
    simAws
      .athena()
      .results()
      .onQuery("SELECT one", { rows: [["specific"]] });

    // When each is run.
    const specific = await rowsOf(simAws, workGroup, "SELECT one");
    const broad = await rowsOf(simAws, workGroup, "SELECT another");

    // Then the query rule won where it matched, and the workgroup rule
    // covered the rest.
    assertIdentical(specific[1], "specific");
    assertIdentical(broad[1], "broad");
  });

  it("reads back every execution a scope has run", async () => {
    // Given two queries that have run in one scope.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    await rowsOf(simAws, workGroup, "SELECT one");
    await rowsOf(simAws, workGroup, "SELECT another");

    // When the executions are read without polling for them.
    const executions = simAws.athena().queryExecutions();

    // Then both are there, oldest first, which is the simulator's own
    // accessor rather than an Athena operation.
    assertArrayLength(executions, 2);
    assertIdentical(executions.at(0)?.queryString, "SELECT one");
    assertIdentical(executions.at(1)?.state, "SUCCEEDED");
  });
});
