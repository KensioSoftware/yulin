import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { aRanQuery } from "./sim-athena-ran-query.fixture.js";
import {
  aScannedSimulation,
  aSeededObject,
  projectedDays,
} from "./sim-athena-scanned-bytes.fixture.js";

describe("measuring what an Athena query scans", () => {
  it("counts the objects under the table's own location", async () => {
    // Given a table with no projection and two objects under its location.
    const { simAws, workGroup } = await aScannedSimulation();

    await aSeededObject(simAws, "logs/part-0.json", 300);
    await aSeededObject(simAws, "logs/part-1.json", 700);

    // When a query runs against it.
    const ran = await aRanQuery(
      simAws,
      workGroup,
      "SELECT url FROM rainlytics.access_logs",
    );

    // Then it reports what those objects come to.
    assertIdentical(ran.state, "SUCCEEDED");
    assertIdentical(ran.scanned, 1000);
  });

  it("counts only the partitions a filter allows", async () => {
    // Given a table projecting three days, each holding an object.
    const { simAws, workGroup } = await aScannedSimulation(projectedDays);

    await aSeededObject(simAws, "logs/2026-08-24/part-0.json", 100);
    await aSeededObject(simAws, "logs/2026-08-25/part-0.json", 200);
    await aSeededObject(simAws, "logs/2026-08-26/part-0.json", 400);

    // When a query naming one day runs.
    const oneDay = await aRanQuery(
      simAws,
      workGroup,
      "SELECT url FROM rainlytics.access_logs WHERE day = '2026-08-25'",
    );

    // And when a query naming none of them runs.
    const everyDay = await aRanQuery(
      simAws,
      workGroup,
      "SELECT url FROM rainlytics.access_logs",
    );

    // Then the filtered query reads one partition and the other reads all
    // three. This is what partitioning a table is for.
    assertIdentical(oneDay.scanned, 200);
    assertIdentical(everyDay.scanned, 700);
  });

  it("scans nothing where the table points at a Bucket nobody made", async () => {
    // Given a table whose location names a Bucket this simulation never had.
    const { simAws, workGroup } = await aScannedSimulation();

    simAws.glue().createTable({
      input: {
        DatabaseName: "rainlytics",
        TableInput: {
          Name: "elsewhere",
          StorageDescriptor: { Location: "s3://somewhere-else/logs/" },
        },
      },
    });

    // When a query runs against it.
    const ran = await aRanQuery(
      simAws,
      workGroup,
      "SELECT url FROM rainlytics.elsewhere",
    );

    // Then it succeeds having scanned nothing. A table nobody put data behind
    // is one nobody set up to measure.
    assertIdentical(ran.state, "SUCCEEDED");
    assertIdentical(ran.scanned, 0);
  });

  it("counts a key once where two prefixes both reach it", async () => {
    // Given a table whose location sits above a second table's, and one
    // object under the deeper of the two.
    const { simAws, workGroup } = await aScannedSimulation();

    await aSeededObject(simAws, "logs/day=1/part-0.json", 250);

    simAws.glue().createTable({
      input: {
        DatabaseName: "rainlytics",
        TableInput: {
          Name: "one_day",
          StorageDescriptor: { Location: "s3://rainlytics-logs/logs/day=1/" },
        },
      },
    });

    // When a query reads both.
    const ran = await aRanQuery(
      simAws,
      workGroup,
      "SELECT url FROM rainlytics.access_logs, rainlytics.one_day",
    );

    // Then the object counts once. Athena bills a byte it read once, however
    // many prefixes reach it.
    assertIdentical(ran.scanned, 250);
  });

  it("counts every object where a listing runs past one page", async () => {
    // Given more objects under one prefix than a single S3 listing returns.
    const { simAws, workGroup } = await aScannedSimulation();

    await Promise.all(
      Array.from({ length: 1001 }, async (_unused, index) =>
        aSeededObject(simAws, `logs/part-${String(index)}.json`, 1),
      ),
    );

    // When a query reads them.
    const ran = await aRanQuery(
      simAws,
      workGroup,
      "SELECT url FROM rainlytics.access_logs",
    );

    // Then all of them count. A listing stops at 1000 keys and says so, and
    // the measurement follows the continuation token.
    assertIdentical(ran.scanned, 1001);
  });
});
