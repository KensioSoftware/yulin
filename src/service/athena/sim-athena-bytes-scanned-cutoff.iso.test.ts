import { faker } from "@faker-js/faker";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";

const unpartitioned = "SELECT * FROM rainlytics.access_logs";

describe("simulated Athena bytes scanned cutoff", () => {
  async function aGuardedWorkGroup(
    simAws: SimAws,
    bytesScannedCutoffPerQuery: number,
  ): Promise<string> {
    const name = `analytics-${faker.string.uuid()}`;

    await simAws.s3().createBucket({ input: { Bucket: "rainlytics-results" } });
    await simAws.athena().createWorkGroup({
      input: {
        Name: name,
        Configuration: {
          BytesScannedCutoffPerQuery: bytesScannedCutoffPerQuery,
          ResultConfiguration: { OutputLocation: "s3://rainlytics-results/q/" },
        },
      },
    });

    return name;
  }

  it("fails a query that scans past the workgroup's cutoff", async () => {
    // Given a workgroup guarding against a full scan, and a query with no
    // partition in it, which is the mistake the guardrail exists for.
    const simAws = new SimAws();
    const workGroup = await aGuardedWorkGroup(simAws, 10_000_000);

    simAws
      .athena()
      .results()
      .onQuery(unpartitioned, { rows: [["4213"]], bytesScanned: 40_000_000 });

    // When it is run.
    const started = await simAws.athena().startQueryExecution({
      input: { QueryString: unpartitioned, WorkGroup: workGroup },
    });

    await simAws.backgroundTasksComplete();

    // Then it failed at the point it ran, naming the limit and what it
    // scanned, rather than arriving at the end of the month as a bill.
    const execution = await simAws.athena().getQueryExecution({
      input: { QueryExecutionId: started.QueryExecutionId },
    });
    const status = execution.QueryExecution?.Status;

    assertNonNullable(status);

    const reason = String(status.StateChangeReason);

    assertIdentical(status.State, "FAILED");
    assertStringIncludes(reason, "Bytes scanned limit was exceeded");
    assertStringIncludes(reason, "40000000");
    assertStringIncludes(reason, "10000000");
  });

  it("reports what a refused query scanned", async () => {
    // Given the same query, refused by the cutoff.
    const simAws = new SimAws();
    const workGroup = await aGuardedWorkGroup(simAws, 1000);

    simAws
      .athena()
      .results()
      .onWorkGroup(workGroup, { bytesScanned: 40_000_000 });

    const started = await simAws.athena().startQueryExecution({
      input: { QueryString: unpartitioned, WorkGroup: workGroup },
    });

    await simAws.backgroundTasksComplete();

    // When the statistics are read.
    const execution = await simAws.athena().getQueryExecution({
      input: { QueryExecutionId: started.QueryExecutionId },
    });

    // Then the bytes are there for a query that failed as well as one that
    // succeeded, which is what a caller counting the cost of a mistake wants.
    assertIdentical(
      execution.QueryExecution?.Statistics?.DataScannedInBytes,
      40_000_000,
    );
  });

  it("writes no results for a query the cutoff refused", async () => {
    // Given a query refused by the cutoff.
    const simAws = new SimAws();
    const workGroup = await aGuardedWorkGroup(simAws, 1000);

    simAws
      .athena()
      .results()
      .onWorkGroup(workGroup, { rows: [["4213"]], bytesScanned: 40_000_000 });

    const started = await simAws.athena().startQueryExecution({
      input: { QueryString: unpartitioned, WorkGroup: workGroup },
    });

    await simAws.backgroundTasksComplete();

    // When its results are asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().getQueryResults({
        input: { QueryExecutionId: started.QueryExecutionId },
      });
    });

    // Then there are none, and nothing landed in the Bucket either.
    assertStringIncludes(error.message, "has not yet finished");

    const listing = await simAws
      .s3()
      .listObjectsV2({ input: { Bucket: "rainlytics-results" } });

    assertIdentical(listing.Contents?.length ?? 0, 0);
  });

  it("runs a query that stays inside the cutoff", async () => {
    // Given a query naming its partition, which scans a fraction of the data.
    const simAws = new SimAws();
    const workGroup = await aGuardedWorkGroup(simAws, 10_000_000);
    const partitioned =
      "SELECT count(*) FROM access_logs WHERE year = '2026' AND month = '08'";

    simAws
      .athena()
      .results()
      .onQuery(partitioned, { rows: [["4213"]], bytesScanned: 2_000_000 });

    // When it is run.
    const started = await simAws.athena().startQueryExecution({
      input: { QueryString: partitioned, WorkGroup: workGroup },
    });

    await simAws.backgroundTasksComplete();

    // Then it succeeded, so a test can show the guardrail lets real work
    // through as well as refusing a full scan.
    const execution = await simAws.athena().getQueryExecution({
      input: { QueryExecutionId: started.QueryExecutionId },
    });

    assertIdentical(execution.QueryExecution?.Status?.State, "SUCCEEDED");
  });

  it("lets every query through where the workgroup sets no cutoff", async () => {
    // Given a workgroup with no cutoff on it at all.
    const simAws = new SimAws();
    const name = `analytics-${faker.string.uuid()}`;

    await simAws.s3().createBucket({ input: { Bucket: "rainlytics-results" } });
    await simAws.athena().createWorkGroup({
      input: {
        Name: name,
        Configuration: {
          ResultConfiguration: { OutputLocation: "s3://rainlytics-results/q/" },
        },
      },
    });

    simAws
      .athena()
      .results()
      .onWorkGroup(name, { rows: [["4213"]], bytesScanned: 900_000_000 });

    // When a query scanning most of a terabyte runs.
    const started = await simAws.athena().startQueryExecution({
      input: { QueryString: unpartitioned, WorkGroup: name },
    });

    await simAws.backgroundTasksComplete();

    // Then nothing stopped it, which is the workgroup a stack should not have.
    const execution = await simAws.athena().getQueryExecution({
      input: { QueryExecutionId: started.QueryExecutionId },
    });

    assertIdentical(execution.QueryExecution?.Status?.State, "SUCCEEDED");
  });

  it("fails a query a test says fails", async () => {
    // Given a query a test wants to exercise a client's failure handling with.
    // Nothing here reads SQL, so a query that should fail cannot be
    // discovered, and a test says so instead.
    const simAws = new SimAws();
    const workGroup = await aGuardedWorkGroup(simAws, 10_000_000);

    simAws.athena().results().onQuery("SELCT * FRM nowhere", {
      failsWith: "line 1:1: mismatched input 'SELCT'",
    });

    // When it runs.
    const started = await simAws.athena().startQueryExecution({
      input: { QueryString: "SELCT * FRM nowhere", WorkGroup: workGroup },
    });

    await simAws.backgroundTasksComplete();

    // Then it failed carrying that reason.
    const execution = await simAws.athena().getQueryExecution({
      input: { QueryExecutionId: started.QueryExecutionId },
    });

    const status = execution.QueryExecution?.Status;

    assertNonNullable(status);
    assertIdentical(status.State, "FAILED");
    assertStringIncludes(String(status.StateChangeReason), "mismatched input");
  });
});
