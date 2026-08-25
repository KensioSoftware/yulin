import { faker } from "@faker-js/faker";
import {
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";

const pageviewsSql = "SELECT cs_uri_stem, count(*) FROM access_logs GROUP BY 1";

describe("simulated Athena query idempotency and paging", () => {
  async function aWorkGroup(simAws: SimAws): Promise<string> {
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

    return name;
  }

  it("answers a repeated request token with the query it already started", async () => {
    // Given a query started under a request token, as a client that means to
    // be able to retry sends one.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);
    const input = {
      QueryString: pageviewsSql,
      WorkGroup: workGroup,
      ClientRequestToken: "retry-me",
    };

    const first = await simAws.athena().startQueryExecution({ input });

    // When the client retries after a timeout with the same token.
    const second = await simAws.athena().startQueryExecution({ input });

    await simAws.backgroundTasksComplete();

    // Then it got the same execution back rather than a second query, which
    // is what stops a retry costing twice.
    assertIdentical(second.QueryExecutionId, first.QueryExecutionId);
    assertArrayLength(simAws.athena().queryExecutions(), 1);
  });

  it("refuses a request token reused for a different query", async () => {
    // Given a token that already started one query.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    await simAws.athena().startQueryExecution({
      input: {
        QueryString: pageviewsSql,
        WorkGroup: workGroup,
        ClientRequestToken: "one-request",
      },
    });

    // When another query is sent under it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().startQueryExecution({
        input: {
          QueryString: "SELECT something else",
          WorkGroup: workGroup,
          ClientRequestToken: "one-request",
        },
      });
    });

    // Then it is refused, since the token no longer names one request.
    assertStringIncludes(error.message, "already been used for a different");

    await simAws.backgroundTasksComplete();
  });

  it("pages results up to the thousand rows Athena allows", async () => {
    // Given a query answering more rows than a listing of resources may carry.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    simAws
      .athena()
      .results()
      .onWorkGroup(workGroup, {
        columns: ["path"],
        rows: Array.from({ length: 200 }, (_row, index) => [String(index)]),
      });

    const started = await simAws.athena().startQueryExecution({
      input: { QueryString: pageviewsSql, WorkGroup: workGroup },
    });

    await simAws.backgroundTasksComplete();

    // When a hundred rows are asked for, which no listing of workgroups or
    // named queries would take.
    const results = await simAws.athena().getQueryResults({
      input: { QueryExecutionId: started.QueryExecutionId, MaxResults: 100 },
    });

    // Then the page carries them.
    assertArrayLength(results.ResultSet?.Rows ?? [], 100);
  });

  it("refuses a page of results past the thousand Athena allows", async () => {
    // Given a query that has finished.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    const started = await simAws.athena().startQueryExecution({
      input: { QueryString: pageviewsSql, WorkGroup: workGroup },
    });

    await simAws.backgroundTasksComplete();

    // When more rows than Athena pages are asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().getQueryResults({
        input: { QueryExecutionId: started.QueryExecutionId, MaxResults: 1001 },
      });
    });

    // Then it is refused, naming this listing's own range.
    assertStringIncludes(error.message, "outside the range 0 to 1000");
  });
});
