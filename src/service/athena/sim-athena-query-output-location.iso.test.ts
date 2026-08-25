import { faker } from "@faker-js/faker";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";

const query = "SELECT count(*) FROM access_logs";

describe("simulated Athena query output locations", () => {
  async function aSimulation(): Promise<SimAws> {
    const simAws = new SimAws();

    await simAws.s3().createBucket({ input: { Bucket: "workgroup-results" } });
    await simAws.s3().createBucket({ input: { Bucket: "caller-results" } });

    return simAws;
  }

  async function aWorkGroup(simAws: SimAws, enforce: boolean): Promise<string> {
    const name = `analytics-${faker.string.uuid()}`;

    await simAws.athena().createWorkGroup({
      input: {
        Name: name,
        Configuration: {
          EnforceWorkGroupConfiguration: enforce,
          ResultConfiguration: { OutputLocation: "s3://workgroup-results/q/" },
        },
      },
    });

    return name;
  }

  async function ranIn(simAws: SimAws, workGroup: string): Promise<string> {
    const started = await simAws.athena().startQueryExecution({
      input: {
        QueryString: query,
        WorkGroup: workGroup,
        ResultConfiguration: { OutputLocation: "s3://caller-results/mine/" },
      },
    });

    await simAws.backgroundTasksComplete();

    const execution = await simAws.athena().getQueryExecution({
      input: { QueryExecutionId: started.QueryExecutionId },
    });

    return String(
      execution.QueryExecution?.ResultConfiguration?.OutputLocation,
    );
  }

  it("sends results where the workgroup says when it enforces its settings", async () => {
    // Given a workgroup that enforces its configuration, as a stack pinning a
    // results Bucket sets it.
    const simAws = await aSimulation();
    const workGroup = await aWorkGroup(simAws, true);

    // When a query names its own output location anyway.
    const location = await ranIn(simAws, workGroup);

    // Then the workgroup's location won, which is the whole point of the flag.
    assertStringIncludes(location, "s3://workgroup-results/q/");
  });

  it("lets a request choose where results go when the workgroup does not enforce", async () => {
    // Given the same workgroup with enforcement off.
    const simAws = await aSimulation();
    const workGroup = await aWorkGroup(simAws, false);

    // When a query names its own output location.
    const location = await ranIn(simAws, workGroup);

    // Then the request's location won.
    assertStringIncludes(location, "s3://caller-results/mine/");
  });

  it("falls back to the workgroup where a request names no location", async () => {
    // Given a workgroup that does not enforce, and a query that asks for
    // nothing in particular.
    const simAws = await aSimulation();
    const workGroup = await aWorkGroup(simAws, false);

    const started = await simAws.athena().startQueryExecution({
      input: { QueryString: query, WorkGroup: workGroup },
    });

    await simAws.backgroundTasksComplete();

    // When the execution is read.
    const execution = await simAws.athena().getQueryExecution({
      input: { QueryExecutionId: started.QueryExecutionId },
    });

    // Then the workgroup's location is where the results went.
    assertStringIncludes(
      String(execution.QueryExecution?.ResultConfiguration?.OutputLocation),
      "s3://workgroup-results/q/",
    );
  });

  it("refuses a query with nowhere to put its results", async () => {
    // Given a workgroup with no results location, and a query naming none
    // either.
    const simAws = await aSimulation();
    const name = `analytics-${faker.string.uuid()}`;

    await simAws.athena().createWorkGroup({ input: { Name: name } });

    // When it is started.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().startQueryExecution({
        input: { QueryString: query, WorkGroup: name },
      });
    });

    // Then it is refused rather than queued, since a query that succeeded
    // would name an object nothing ever wrote.
    assertStringIncludes(error.message, "No output location provided");
  });

  it("refuses an output location that is not an S3 URI", async () => {
    // Given a query naming somewhere Athena could not write to.
    const simAws = await aSimulation();
    const workGroup = await aWorkGroup(simAws, false);

    // When it is started.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().startQueryExecution({
        input: {
          QueryString: query,
          WorkGroup: workGroup,
          ResultConfiguration: { OutputLocation: "/tmp/results" },
        },
      });
    });

    // Then it is refused at the point the query is asked for.
    assertStringIncludes(error.message, "is not an S3 URI");
  });

  it("fails a query whose results cannot be written", async () => {
    // Given a workgroup pointing at a Bucket nothing created.
    const simAws = await aSimulation();
    const name = `analytics-${faker.string.uuid()}`;

    await simAws.athena().createWorkGroup({
      input: {
        Name: name,
        Configuration: {
          ResultConfiguration: { OutputLocation: "s3://absent-bucket/q/" },
        },
      },
    });

    // When a query runs.
    const started = await simAws
      .athena()
      .startQueryExecution({ input: { QueryString: query, WorkGroup: name } });

    await simAws.backgroundTasksComplete();

    // Then the execution failed saying so, rather than succeeding while
    // nothing was written.
    const execution = await simAws.athena().getQueryExecution({
      input: { QueryExecutionId: started.QueryExecutionId },
    });

    assertIdentical(execution.QueryExecution?.Status?.State, "FAILED");
    assertStringIncludes(
      String(execution.QueryExecution.Status.StateChangeReason),
      "could not be written",
    );
  });
});
