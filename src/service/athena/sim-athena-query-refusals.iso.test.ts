import { faker } from "@faker-js/faker";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { SimAthena } from "./sim-athena.js";

describe("simulated Athena query refusals", () => {
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

  it("refuses a query carrying no SQL", async () => {
    // Given a request with nothing but whitespace in it.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    // When it is started.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().startQueryExecution({
        input: { QueryString: "  ", WorkGroup: workGroup },
      });
    });

    // Then it is refused.
    assertStringIncludes(error.message, "QueryString is required");
  });

  it("refuses a query in a workgroup that is disabled", async () => {
    // Given a workgroup turned off, which is how a stack stops one costing
    // anything.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    await simAws
      .athena()
      .updateWorkGroup({ input: { WorkGroup: workGroup, State: "DISABLED" } });

    // When a query is started in it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().startQueryExecution({
        input: { QueryString: "SELECT 1", WorkGroup: workGroup },
      });
    });

    // Then it is refused, so a test can prove the workgroup is really off.
    assertStringIncludes(error.message, "is disabled, and takes no queries");
  });

  it("refuses a query in a workgroup that is not there", async () => {
    // Given a simulation whose only workgroup is primary.
    const simAws = new SimAws();

    // When a query names another.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().startQueryExecution({
        input: { QueryString: "SELECT 1", WorkGroup: "absent" },
      });
    });

    // Then it is a not-found.
    assertStringIncludes(error.message, "WorkGroup absent is not found");
  });

  it("refuses reading an execution nothing here started", async () => {
    // Given an id from somewhere other than this simulation.
    const simAws = new SimAws();

    // When it is read.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().getQueryExecution({
        input: { QueryExecutionId: faker.string.uuid() },
      });
    });

    // Then it is a not-found.
    assertStringIncludes(error.message, "was not found");
  });

  it("refuses a read carrying no execution id", async () => {
    // Given a request with the id left out.
    const simAws = new SimAws();

    // When results are read.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().getQueryResults({ input: {} });
    });

    // Then it is refused.
    assertStringIncludes(error.message, "QueryExecutionId is required");
  });

  it("refuses a stop carrying no execution id", async () => {
    // Given a request with the id left out.
    const simAws = new SimAws();

    // When a stop is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().stopQueryExecution({ input: {} });
    });

    // Then it is refused.
    assertStringIncludes(error.message, "QueryExecutionId is required");
  });

  it("refuses a result rule declared against nothing", async () => {
    // Given a rule with an empty query for its key, which would match every
    // query that carried no text and none that did.
    const simAws = new SimAws();

    // When it is declared.
    const error = await assertThrowsErrorAsync(async () => {
      simAws.athena().results().onQuery("", { rows: [] });
      await Promise.resolve();
    });

    // Then it is refused at the point the test wrote it.
    assertStringIncludes(error.message, "needs a query to match");
  });

  it("fails a query in a standalone Athena, which has no Bucket to write to", async () => {
    // Given simulated Athena built on its own rather than inside a SimAws, so
    // there is no simulated S3 in its scope.
    const athena = new SimAthena();

    await athena.createWorkGroup({
      input: {
        Name: "standalone",
        Configuration: {
          ResultConfiguration: { OutputLocation: "s3://results/q/" },
        },
      },
    });

    // When a query runs.
    const started = await athena.startQueryExecution({
      input: { QueryString: "SELECT 1", WorkGroup: "standalone" },
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    // Then it failed saying so, rather than reporting a result object that
    // was never written.
    const execution = await athena.getQueryExecution({
      input: { QueryExecutionId: started.QueryExecutionId },
    });

    assertIdentical(execution.QueryExecution?.Status?.State, "FAILED");
    assertStringIncludes(
      String(execution.QueryExecution.Status.StateChangeReason),
      "has no simulated S3",
    );
  });
});
