import { faker } from "@faker-js/faker";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";

describe("simulated Athena named query refusals", () => {
  it("refuses a named query against a workgroup that is not there", async () => {
    // Given a simulation whose only workgroup is primary.
    const simAws = new SimAws();

    // When a query is saved against a workgroup nothing created, which is
    // what a template gets wrong when the two resources are ordered badly.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().createNamedQuery({
        input: {
          Name: "pageviews",
          Database: "rainlytics",
          QueryString: "SELECT 1",
          WorkGroup: "absent",
        },
      });
    });

    // Then it is refused. Storing it would leave it unreachable, because a
    // listing finds a named query through its workgroup.
    assertIdentical(error.name, "InvalidRequestException");
    assertStringIncludes(error.message, "WorkGroup absent is not found");
  });

  it("refuses a named query missing the fields it cannot do without", async () => {
    // Given a request carrying a name and nothing else.
    const simAws = new SimAws();

    // When it is saved.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().createNamedQuery({ input: { Name: "pageviews" } });
    });

    // Then it is refused, naming the field that is missing.
    assertStringIncludes(error.message, "Database is required");
  });

  it("refuses a named query with no SQL in it", async () => {
    // Given a request naming a database but carrying no query text.
    const simAws = new SimAws();

    // When it is saved.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().createNamedQuery({
        input: { Name: "pageviews", Database: "rainlytics", QueryString: "" },
      });
    });

    // Then it is refused rather than saved empty.
    assertStringIncludes(error.message, "QueryString is required");
  });

  it("refuses reading a named query id nothing here issued", async () => {
    // Given an id from somewhere other than this simulation.
    const simAws = new SimAws();

    // When it is read.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .athena()
        .getNamedQuery({ input: { NamedQueryId: faker.string.uuid() } });
    });

    // Then it is a not-found.
    assertStringIncludes(error.message, "is not found");
  });

  it("refuses a read carrying no named query id", async () => {
    // Given a request with the id left out.
    const simAws = new SimAws();

    // When it is read.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().getNamedQuery({ input: {} });
    });

    // Then it is refused.
    assertStringIncludes(error.message, "NamedQueryId is required");
  });

  it("refuses deleting a named query id nothing here issued", async () => {
    // Given an id from somewhere other than this simulation.
    const simAws = new SimAws();

    // When it is deleted.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .athena()
        .deleteNamedQuery({ input: { NamedQueryId: faker.string.uuid() } });
    });

    // Then it is a not-found rather than a silent success.
    assertStringIncludes(error.message, "is not found");
  });

  it("refuses listing the named queries of a workgroup that is not there", async () => {
    // Given a simulation whose only workgroup is primary.
    const simAws = new SimAws();

    // When another workgroup's named queries are listed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .athena()
        .listNamedQueries({ input: { WorkGroup: "absent" } });
    });

    // Then it is a not-found rather than an empty listing, which would read as
    // "this workgroup has no saved queries".
    assertStringIncludes(error.message, "is not found");
  });
});
