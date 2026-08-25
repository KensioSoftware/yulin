import { text } from "node:stream/consumers";
import { faker } from "@faker-js/faker";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";

const pageviewsSql = "SELECT cs_uri_stem, count(*) FROM access_logs GROUP BY 1";

/**
 * Let the background scheduler take one turn, which is one state change.
 *
 * A query is queued when StartQueryExecution answers and moves on the
 * simulator's background work, so a test watching it move has to let that work
 * run. Scheduled work is a macrotask, which is what makes each turn visible.
 */
async function aBackgroundTurn(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("simulated Athena query executions", () => {
  async function aWorkGroup(
    simAws: SimAws,
    configuration: Record<string, unknown> = {},
  ): Promise<string> {
    const name = `analytics-${faker.string.uuid()}`;

    await simAws.s3().createBucket({ input: { Bucket: "rainlytics-results" } });
    await simAws.athena().createWorkGroup({
      input: {
        Name: name,
        Configuration: {
          ResultConfiguration: { OutputLocation: "s3://rainlytics-results/q/" },
          ...configuration,
        },
      },
    });

    return name;
  }

  it("passes a query through queued and running to succeeded", async () => {
    // Given a workgroup, and a rollup a test says answers two rows.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    simAws
      .athena()
      .results()
      .onQuery(pageviewsSql, {
        columns: ["cs_uri_stem", "views"],
        rows: [
          ["/", "4213"],
          ["/about", "512"],
        ],
        bytesScanned: 2_000_000,
      });

    // When the query is started and polled between each turn of background
    // work, which is what a client waiting for a query does.
    const started = await simAws.athena().startQueryExecution({
      input: { QueryString: pageviewsSql, WorkGroup: workGroup },
    });
    const input = { QueryExecutionId: started.QueryExecutionId };
    const polled = async (): Promise<string | undefined> => {
      const execution = await simAws.athena().getQueryExecution({ input });

      return execution.QueryExecution?.Status?.State;
    };

    const queued = await polled();

    await aBackgroundTurn();

    const running = await polled();

    await aBackgroundTurn();

    const succeeded = await polled();

    // Then it was seen in each state rather than only the one it ended in.
    assertIdentical(queued, "QUEUED");
    assertIdentical(running, "RUNNING");
    assertIdentical(succeeded, "SUCCEEDED");
  });

  it("answers the rows a test declared, with the column names first", async () => {
    // Given a query that has run to completion.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    simAws
      .athena()
      .results()
      .onQuery(pageviewsSql, {
        columns: ["cs_uri_stem", "views"],
        rows: [["/", "4213"]],
      });

    const started = await simAws.athena().startQueryExecution({
      input: { QueryString: pageviewsSql, WorkGroup: workGroup },
    });

    await simAws.backgroundTasksComplete();

    // When the results are read.
    const results = await simAws.athena().getQueryResults({
      input: { QueryExecutionId: started.QueryExecutionId },
    });

    // Then the first row holds the column names and the second the values,
    // which is the shape real Athena answers a SELECT with.
    const rows = results.ResultSet?.Rows;

    assertNonNullable(rows);
    assertArrayLength(rows, 2);
    assertIdentical(rows.at(0)?.Data?.[0]?.VarCharValue, "cs_uri_stem");
    assertIdentical(rows.at(1)?.Data?.[0]?.VarCharValue, "/");
    assertIdentical(rows.at(1)?.Data?.[1]?.VarCharValue, "4213");
    assertIdentical(
      results.ResultSet?.ResultSetMetadata?.ColumnInfo?.[1]?.Name,
      "views",
    );
  });

  it("pages the rows of a long result set", async () => {
    // Given a query answering four rows, which with the header is five.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    simAws
      .athena()
      .results()
      .onWorkGroup(workGroup, {
        columns: ["path"],
        rows: [["/a"], ["/b"], ["/c"], ["/d"]],
      });

    const started = await simAws.athena().startQueryExecution({
      input: {
        QueryString: "SELECT path FROM access_logs",
        WorkGroup: workGroup,
      },
    });

    await simAws.backgroundTasksComplete();

    // When two rows are asked for and the token is followed.
    const id = started.QueryExecutionId;
    const first = await simAws
      .athena()
      .getQueryResults({ input: { QueryExecutionId: id, MaxResults: 2 } });
    const second = await simAws.athena().getQueryResults({
      input: { QueryExecutionId: id, NextToken: first.NextToken },
    });

    // Then the pages carry the header and the rows between them.
    assertArrayLength(first.ResultSet?.Rows ?? [], 2);
    assertArrayLength(second.ResultSet?.Rows ?? [], 3);
    assertIdentical(
      first.ResultSet?.Rows?.[0]?.Data?.[0]?.VarCharValue,
      "path",
    );
  });

  it("writes the result set to the workgroup's output location", async () => {
    // Given a workgroup whose results go to a Bucket, and a query that ran.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    simAws
      .athena()
      .results()
      .onWorkGroup(workGroup, {
        columns: ["path", "views"],
        rows: [["/", "4213"]],
      });

    const started = await simAws.athena().startQueryExecution({
      input: { QueryString: pageviewsSql, WorkGroup: workGroup },
    });

    await simAws.backgroundTasksComplete();

    // When the object at the reported location is read back.
    const execution = await simAws.athena().getQueryExecution({
      input: { QueryExecutionId: started.QueryExecutionId },
    });
    const location =
      execution.QueryExecution?.ResultConfiguration?.OutputLocation;
    const read = await simAws.s3().getObject({
      input: {
        Bucket: "rainlytics-results",
        Key: `q/${String(started.QueryExecutionId)}.csv`,
      },
    });

    // Then the CSV is there, header first, with every field quoted the way
    // Athena writes one.
    assertIdentical(
      location,
      `s3://rainlytics-results/q/${String(started.QueryExecutionId)}.csv`,
    );
    assertNonNullable(read.Body);
    assertIdentical(await text(read.Body), '"path","views"\n"/","4213"\n');
  });

  it("reports what a query scanned", async () => {
    // Given a query a test says scanned twelve megabytes.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    simAws
      .athena()
      .results()
      .onWorkGroup(workGroup, { rows: [["4213"]], bytesScanned: 12_000_000 });

    const started = await simAws.athena().startQueryExecution({
      input: { QueryString: pageviewsSql, WorkGroup: workGroup },
    });

    await simAws.backgroundTasksComplete();

    // When the execution is read.
    const execution = await simAws.athena().getQueryExecution({
      input: { QueryExecutionId: started.QueryExecutionId },
    });

    // Then the statistics carry it, which is what a caller costing a query
    // reads.
    assertIdentical(
      execution.QueryExecution?.Statistics?.DataScannedInBytes,
      12_000_000,
    );
    assertIdentical(execution.QueryExecution.Status?.State, "SUCCEEDED");
  });

  it("stops a query that has not finished", async () => {
    // Given a query that has been started and left queued.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    const started = await simAws.athena().startQueryExecution({
      input: { QueryString: pageviewsSql, WorkGroup: workGroup },
    });
    const input = { QueryExecutionId: started.QueryExecutionId };

    // When it is stopped before the background work reaches it.
    await simAws.athena().stopQueryExecution({ input });
    await simAws.backgroundTasksComplete();

    // Then it stayed cancelled rather than being carried on with.
    const execution = await simAws.athena().getQueryExecution({ input });

    assertIdentical(execution.QueryExecution?.Status?.State, "CANCELLED");
    assertStringIncludes(
      String(execution.QueryExecution.Status.StateChangeReason),
      "cancelled by user",
    );
  });

  it("stops a query that has already started running", async () => {
    // Given a query that has reached RUNNING but not finished.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    const started = await simAws.athena().startQueryExecution({
      input: { QueryString: pageviewsSql, WorkGroup: workGroup },
    });
    const input = { QueryExecutionId: started.QueryExecutionId };

    await aBackgroundTurn();

    const running = await simAws.athena().getQueryExecution({ input });

    // When it is stopped part way through.
    await simAws.athena().stopQueryExecution({ input });
    await simAws.backgroundTasksComplete();

    // Then the work that was already scheduled left it cancelled rather than
    // carrying it through to a result.
    const execution = await simAws.athena().getQueryExecution({ input });

    assertIdentical(running.QueryExecution?.Status?.State, "RUNNING");
    assertIdentical(execution.QueryExecution?.Status?.State, "CANCELLED");
  });

  it("leaves a query alone when the stop arrives too late", async () => {
    // Given a query that has already finished.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    const started = await simAws.athena().startQueryExecution({
      input: { QueryString: pageviewsSql, WorkGroup: workGroup },
    });
    const input = { QueryExecutionId: started.QueryExecutionId };

    await simAws.backgroundTasksComplete();

    // When it is stopped anyway.
    await simAws.athena().stopQueryExecution({ input });

    // Then it is still the success it was, as real Athena answers a stop that
    // arrived after the query was over.
    const execution = await simAws.athena().getQueryExecution({ input });

    assertIdentical(execution.QueryExecution?.Status?.State, "SUCCEEDED");
  });
});
