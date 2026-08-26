import { faker } from "@faker-js/faker";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";

describe("evaluating an Athena table's partition projection", () => {
  async function aQueryOver(
    parameters: Record<string, string>,
    queryString = "SELECT url FROM rainlytics.access_logs",
  ): Promise<{ state: string | undefined; reason: string | undefined }> {
    const simAws = new SimAws();
    const workGroup = `analytics-${faker.string.uuid()}`;

    await simAws.s3().createBucket({ input: { Bucket: "rainlytics-results" } });
    await simAws.athena().createWorkGroup({
      input: {
        Name: workGroup,
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
          Parameters: parameters,
        },
      },
    });

    simAws
      .athena()
      .results()
      .byDefault({ rows: [["/"]] });

    const started = await simAws.athena().startQueryExecution({
      input: { QueryString: queryString, WorkGroup: workGroup },
    });

    await simAws.backgroundTasksComplete();

    const execution = await simAws.athena().getQueryExecution({
      input: { QueryExecutionId: started.QueryExecutionId },
    });

    return {
      state: execution.QueryExecution?.Status?.State,
      reason: execution.QueryExecution?.Status?.StateChangeReason,
    };
  }

  it("answers a query against a table whose projection reads", async () => {
    // Given a table projecting a range of days.
    // When a query runs against it.
    const ran = await aQueryOver({
      "projection.enabled": "true",
      "projection.day.type": "date",
      "projection.day.format": "yyyy-MM-dd",
      "projection.day.range": "2026-08-01,NOW",
      "storage.location.template": `s3://rainlytics-logs/logs/\${day}/`,
    });

    // Then it succeeds.
    assertIdentical(ran.state, "SUCCEEDED");
  });

  it("answers a query against a table projecting nothing", async () => {
    // Given a table with partition keys and no projection.
    // When a query runs against it.
    const ran = await aQueryOver({});

    // Then it succeeds. A table without projection reads its own location.
    assertIdentical(ran.state, "SUCCEEDED");
  });

  it("fails a query where a partition key has no projection type", async () => {
    // Given a table with projection on and nothing said about its one key.
    // When a query runs against it.
    const ran = await aQueryOver({ "projection.enabled": "true" });

    // Then it fails, naming the parameter the table is missing.
    assertIdentical(ran.state, "FAILED");
    assertNonNullable(ran.reason);
    assertStringIncludes(ran.reason, "INVALID_TABLE_PROPERTY");
    assertStringIncludes(ran.reason, "projection.day.type");
  });

  it("fails a query where a date range does not read", async () => {
    // Given a table whose range names a month that does not exist.
    // When a query runs against it.
    const ran = await aQueryOver({
      "projection.enabled": "true",
      "projection.day.type": "date",
      "projection.day.format": "yyyy-MM-dd",
      "projection.day.range": "2026-13-01,NOW",
      "storage.location.template": `s3://rainlytics-logs/logs/\${day}/`,
    });

    // Then it fails, naming the column and the bound it could not read.
    assertIdentical(ran.state, "FAILED");
    assertNonNullable(ran.reason);
    assertStringIncludes(ran.reason, "day");
    assertStringIncludes(ran.reason, "2026-13-01");
  });

  it("fails a query where an integer range carries NOW", async () => {
    // Given a table projecting an integer with a date's bound.
    // When a query runs against it.
    const ran = await aQueryOver({
      "projection.enabled": "true",
      "projection.day.type": "integer",
      "projection.day.range": "1,NOW",
      "storage.location.template": `s3://rainlytics-logs/logs/\${day}/`,
    });

    // Then it fails. NOW belongs to a date projection.
    assertIdentical(ran.state, "FAILED");
    assertNonNullable(ran.reason);
    assertStringIncludes(ran.reason, "NOW");
  });

  it("fails a query where the location template omits a projected key", async () => {
    // Given a table whose template never names its projected column.
    // When a query runs against it.
    const ran = await aQueryOver({
      "projection.enabled": "true",
      "projection.day.type": "enum",
      "projection.day.values": "2026-08-26",
      "storage.location.template": "s3://rainlytics-logs/logs/",
    });

    // Then it fails, naming the placeholder that is missing.
    assertIdentical(ran.state, "FAILED");
    assertNonNullable(ran.reason);
    assertStringIncludes(ran.reason, `\${day}`);
  });

  it("fails a query leaving an injected column unconstrained", async () => {
    // Given a table with an injected partition column.
    // When a query naming nothing about it runs.
    const ran = await aQueryOver({
      "projection.enabled": "true",
      "projection.day.type": "injected",
      "storage.location.template": `s3://rainlytics-logs/logs/\${day}/`,
    });

    // Then it fails. The query has to say which values it wants.
    assertIdentical(ran.state, "FAILED");
    assertNonNullable(ran.reason);
    assertStringIncludes(ran.reason, "injected");
  });

  it("answers a query constraining an injected column", async () => {
    // Given the same table, and a query naming the value it wants.
    // When it runs.
    const ran = await aQueryOver(
      {
        "projection.enabled": "true",
        "projection.day.type": "injected",
        "storage.location.template": `s3://rainlytics-logs/logs/\${day}/`,
      },
      "SELECT url FROM rainlytics.access_logs WHERE day = '2026-08-26'",
    );

    // Then it succeeds.
    assertIdentical(ran.state, "SUCCEEDED");
  });
});
