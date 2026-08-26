import { faker } from "@faker-js/faker";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";

interface RanQuery {
  readonly state: string | undefined;
  readonly reason: string | undefined;
}

describe("resolving an Athena query's tables against the Glue catalog", () => {
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

  function aCatalogTable(
    simAws: SimAws,
    databaseName: string,
    tableName: string,
  ): void {
    simAws.glue().createDatabase({
      input: { DatabaseInput: { Name: databaseName } },
    });
    simAws.glue().createTable({
      input: {
        DatabaseName: databaseName,
        TableInput: {
          Name: tableName,
          StorageDescriptor: { Location: "s3://rainlytics-logs/cloudfront/" },
        },
      },
    });
  }

  async function runQuery(
    simAws: SimAws,
    input: Record<string, unknown>,
  ): Promise<RanQuery> {
    const workGroup = await aWorkGroup(simAws);
    const started = await simAws
      .athena()
      .startQueryExecution({ input: { WorkGroup: workGroup, ...input } });

    await simAws.backgroundTasksComplete();

    const execution = await simAws.athena().getQueryExecution({
      input: { QueryExecutionId: started.QueryExecutionId },
    });

    return {
      state: execution.QueryExecution?.Status?.State,
      reason: execution.QueryExecution?.Status?.StateChangeReason,
    };
  }

  it("answers a query naming a table the catalog holds", async () => {
    // Given a catalog holding one table, and a query naming it.
    const simAws = new SimAws();
    aCatalogTable(simAws, "rainlytics", "access_logs");

    simAws
      .athena()
      .results()
      .byDefault({ columns: ["url"], rows: [["/"]] });

    // When the query runs.
    const ran = await runQuery(simAws, {
      QueryString: "SELECT url FROM rainlytics.access_logs",
    });

    // Then it succeeds, the way it did before any table was looked for.
    assertIdentical(ran.state, "SUCCEEDED");
  });

  it("fails a query naming a table the catalog has never heard of", async () => {
    // Given a catalog holding one table, and a query with a typo in the name.
    const simAws = new SimAws();
    aCatalogTable(simAws, "rainlytics", "access_logs");

    // When the query runs.
    const ran = await runQuery(simAws, {
      QueryString: "SELECT url FROM rainlytics.acess_logs",
    });

    // Then it fails, and the reason names the table the way Athena qualifies
    // one, so a reader can see which part is wrong.
    assertIdentical(ran.state, "FAILED");
    assertNonNullable(ran.reason);
    assertStringIncludes(
      ran.reason,
      "Table awsdatacatalog.rainlytics.acess_logs does not exist",
    );
  });

  it("resolves an unqualified name against the request's database", async () => {
    // Given a catalog holding one table, and a query naming it bare.
    const simAws = new SimAws();
    aCatalogTable(simAws, "rainlytics", "access_logs");

    simAws
      .athena()
      .results()
      .byDefault({ rows: [["1"]] });

    // When the query runs carrying that database in its context.
    const ran = await runQuery(simAws, {
      QueryString: "SELECT url FROM access_logs",
      QueryExecutionContext: { Database: "rainlytics" },
    });

    // Then the bare name resolves against it.
    assertIdentical(ran.state, "SUCCEEDED");
  });

  it("fails a bare name where the request names no database", async () => {
    // Given a catalog holding one table, and a query naming it bare with no
    // database in its context.
    const simAws = new SimAws();
    aCatalogTable(simAws, "rainlytics", "access_logs");

    // When the query runs.
    const ran = await runQuery(simAws, {
      QueryString: "SELECT url FROM access_logs",
    });

    // Then it fails saying so. There is nothing to resolve the name against.
    assertIdentical(ran.state, "FAILED");
    assertNonNullable(ran.reason);
    assertStringIncludes(ran.reason, "Schema must be specified");
  });

  it("answers a query against information_schema with no catalog entry", async () => {
    // Given a catalog holding one table, and a query reading Athena's own
    // metadata schema.
    const simAws = new SimAws();
    aCatalogTable(simAws, "rainlytics", "access_logs");

    simAws
      .athena()
      .results()
      .byDefault({ rows: [["access_logs"]] });

    // When the query runs.
    const ran = await runQuery(simAws, {
      QueryString: "SELECT table_name FROM information_schema.tables",
    });

    // Then it succeeds. Athena serves that schema rather than the catalog.
    assertIdentical(ran.state, "SUCCEEDED");
  });

  it("leaves every query alone while the catalog holds nothing", async () => {
    // Given a simulation where no database was ever created.
    const simAws = new SimAws();

    simAws
      .athena()
      .results()
      .byDefault({ rows: [["4213"]] });

    // When a query naming a table nothing declared runs.
    const ran = await runQuery(simAws, {
      QueryString: "SELECT count(*) FROM access_logs",
    });

    // Then it is answered from the declaration. A simulation holding no
    // catalog is one where nothing asked for a table to be looked for.
    assertIdentical(ran.state, "SUCCEEDED");
  });

  it("leaves a query against another catalog alone", async () => {
    // Given a Data Catalog holding one table, and a query against a federated
    // catalog this simulation has never seen.
    const simAws = new SimAws();
    aCatalogTable(simAws, "rainlytics", "access_logs");

    simAws
      .athena()
      .results()
      .byDefault({ rows: [["1"]] });

    // When the query runs against that catalog.
    const ran = await runQuery(simAws, {
      QueryString: "SELECT id FROM postgres_source.public.orders",
      QueryExecutionContext: { Catalog: "postgres_source" },
    });

    // Then it is answered from the declaration.
    assertIdentical(ran.state, "SUCCEEDED");
  });

  it("lets a declared failure win over an absent table", async () => {
    // Given a catalog holding one table, and a test saying a query against a
    // different table fails for a reason of its own.
    const simAws = new SimAws();
    aCatalogTable(simAws, "rainlytics", "access_logs");

    const sql = "SELECT url FROM rainlytics.sessions";
    simAws
      .athena()
      .results()
      .onQuery(sql, { failsWith: "Insufficient rights" });

    // When the query runs.
    const ran = await runQuery(simAws, { QueryString: sql });

    // Then the declaration answers. It is a test's own statement about the
    // query, and it stays the way out of anything decided here.
    assertIdentical(ran.state, "FAILED");
    assertIdentical(ran.reason, "Insufficient rights");
  });
});
