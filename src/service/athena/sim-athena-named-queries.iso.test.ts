import { faker } from "@faker-js/faker";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
  assertUuidV4,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";

const pageviewsSql = `SELECT cs_uri_stem, count(*) AS views
FROM rainlytics.access_logs
WHERE year = '2026' AND month = '08'
GROUP BY 1 ORDER BY 2 DESC`;

describe("simulated Athena named queries", () => {
  const workGroupName = (): string => `analytics-${faker.string.uuid()}`;

  async function aWorkGroup(simAws: SimAws): Promise<string> {
    const name = workGroupName();

    await simAws.athena().createWorkGroup({ input: { Name: name } });

    return name;
  }

  it("hands back the SQL a named query was saved with", async () => {
    // Given a rollup registered as a named query, so the console shows what
    // the CLI runs.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    const created = await simAws.athena().createNamedQuery({
      input: {
        Name: "pageviews",
        Description: "Pageviews by path",
        Database: "rainlytics",
        QueryString: pageviewsSql,
        WorkGroup: workGroup,
      },
    });

    // When it is read back by the id creation answered with.
    const read = await simAws
      .athena()
      .getNamedQuery({ input: { NamedQueryId: created.NamedQueryId } });

    // Then the SQL comes back exactly as it went in.
    const namedQuery = read.NamedQuery;

    assertNonNullable(namedQuery);
    assertUuidV4(String(created.NamedQueryId));
    assertIdentical(namedQuery.Name, "pageviews");
    assertIdentical(namedQuery.Description, "Pageviews by path");
    assertIdentical(namedQuery.Database, "rainlytics");
    assertIdentical(namedQuery.QueryString, pageviewsSql);
    assertIdentical(namedQuery.WorkGroup, workGroup);
  });

  it("saves SQL no query engine would accept", async () => {
    // Given SQL that is not SQL, which nothing here parses.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    // When it is saved as a named query.
    const created = await simAws.athena().createNamedQuery({
      input: {
        Name: "broken",
        Database: "rainlytics",
        QueryString: "SELCT * FRM nowhere",
        WorkGroup: workGroup,
      },
    });

    // Then it is stored and handed back unchanged. Simulated Athena reads no
    // SQL, so it cannot tell a caller their query is wrong.
    const read = await simAws
      .athena()
      .getNamedQuery({ input: { NamedQueryId: created.NamedQueryId } });

    assertIdentical(read.NamedQuery?.QueryString, "SELCT * FRM nowhere");
  });

  it("lists the ids of one workgroup's named queries", async () => {
    // Given two workgroups, each with a saved query, as a stack that keeps its
    // ad-hoc queries apart from its rollups has.
    const simAws = new SimAws();
    const rollups = await aWorkGroup(simAws);
    const adhoc = await aWorkGroup(simAws);

    const inRollups = await simAws.athena().createNamedQuery({
      input: {
        Name: "pageviews",
        Database: "rainlytics",
        QueryString: pageviewsSql,
        WorkGroup: rollups,
      },
    });

    await simAws.athena().createNamedQuery({
      input: {
        Name: "scratch",
        Database: "rainlytics",
        QueryString: "SELECT 1",
        WorkGroup: adhoc,
      },
    });

    // When one workgroup's named queries are listed.
    const listed = await simAws
      .athena()
      .listNamedQueries({ input: { WorkGroup: rollups } });

    // Then the other workgroup's query stays out of it.
    assertArrayLength(listed.NamedQueryIds ?? [], 1);
    assertIdentical(listed.NamedQueryIds?.[0], inRollups.NamedQueryId);
  });

  it("pages a long list of named queries", async () => {
    // Given more saved queries in one workgroup than a page carries.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    const save = async (name: string): Promise<void> => {
      await simAws.athena().createNamedQuery({
        input: {
          Name: name,
          Database: "rainlytics",
          QueryString: `SELECT 1 -- ${name}`,
          WorkGroup: workGroup,
        },
      });
    };

    await save("pageviews");
    await save("referrers");
    await save("status-codes");

    // When the first two are listed and the token is followed.
    const first = await simAws
      .athena()
      .listNamedQueries({ input: { WorkGroup: workGroup, MaxResults: 2 } });
    const second = await simAws.athena().listNamedQueries({
      input: { WorkGroup: workGroup, NextToken: first.NextToken },
    });

    // Then the pages together hold all three.
    assertArrayLength(first.NamedQueryIds ?? [], 2);
    assertArrayLength(second.NamedQueryIds ?? [], 1);
    assertUndefined(second.NextToken);
  });

  it("reads several named queries at once, reporting the ids it has none for", async () => {
    // Given one saved query, and an id nothing here ever issued.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    const created = await simAws.athena().createNamedQuery({
      input: {
        Name: "referrers",
        Database: "rainlytics",
        QueryString: "SELECT 1",
        WorkGroup: workGroup,
      },
    });

    // When both are asked for in one batch, which is what the console does
    // after listing.
    const batch = await simAws.athena().batchGetNamedQuery({
      input: {
        NamedQueryIds: [String(created.NamedQueryId), faker.string.uuid()],
      },
    });

    // Then the known one comes back and the unknown one is reported rather
    // than failing the whole batch.
    assertArrayLength(batch.NamedQueries ?? [], 1);
    assertArrayLength(batch.UnprocessedNamedQueryIds ?? [], 1);
    assertIdentical(batch.NamedQueries?.[0]?.Name, "referrers");
    assertIdentical(
      batch.UnprocessedNamedQueryIds?.[0]?.ErrorCode,
      "INVALID_INPUT",
    );
  });

  it("answers an empty batch with nothing", async () => {
    // Given a batch request carrying no ids at all.
    const simAws = new SimAws();

    // When it is sent.
    const batch = await simAws.athena().batchGetNamedQuery({ input: {} });

    // Then nothing comes back, and nothing fails.
    assertArrayLength(batch.NamedQueries ?? [], 0);
    assertArrayLength(batch.UnprocessedNamedQueryIds ?? [], 0);
  });

  it("forgets a deleted named query", async () => {
    // Given a saved query a stack is about to take down.
    const simAws = new SimAws();
    const workGroup = await aWorkGroup(simAws);

    const created = await simAws.athena().createNamedQuery({
      input: {
        Name: "status-codes",
        Database: "rainlytics",
        QueryString: "SELECT 1",
        WorkGroup: workGroup,
      },
    });

    // When it is deleted.
    await simAws
      .athena()
      .deleteNamedQuery({ input: { NamedQueryId: created.NamedQueryId } });

    // Then reading it back is a not-found.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .athena()
        .getNamedQuery({ input: { NamedQueryId: created.NamedQueryId } });
    });

    assertStringIncludes(error.message, "is not found");
  });
});
