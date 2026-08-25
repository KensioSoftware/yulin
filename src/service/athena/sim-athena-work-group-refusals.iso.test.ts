import { faker } from "@faker-js/faker";
import {
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";

describe("simulated Athena workgroup refusals", () => {
  const workGroupName = (): string => `analytics-${faker.string.uuid()}`;

  it("refuses a second workgroup of a name already taken", async () => {
    // Given a workgroup a stack already created.
    const simAws = new SimAws();
    const name = workGroupName();

    await simAws.athena().createWorkGroup({ input: { Name: name } });

    // When the same name is created again, which a redeploy of a renamed
    // stack does.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().createWorkGroup({ input: { Name: name } });
    });

    // Then it is refused rather than replacing the first, so the settings on
    // the existing workgroup survive.
    assertIdentical(error.name, "InvalidRequestException");
    assertStringIncludes(error.message, "is already created");
  });

  it("refuses a workgroup name outside the characters Athena takes", async () => {
    // Given a simulation, and a name carrying a character Athena will not
    // have.
    const simAws = new SimAws();

    // When it is created.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .athena()
        .createWorkGroup({ input: { Name: "analytics queries" } });
    });

    // Then it is refused, naming the characters that are allowed.
    assertStringIncludes(error.message, "is not valid");
  });

  it("refuses a workgroup name longer than Athena takes", async () => {
    // Given a name past the 128 characters Athena allows.
    const simAws = new SimAws();

    // When it is created.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .athena()
        .createWorkGroup({ input: { Name: "a".repeat(129) } });
    });

    // Then it is refused, saying how long the name actually is.
    assertStringIncludes(error.message, "at most 128 characters");
  });

  it("refuses a workgroup name a request left out", async () => {
    // Given a request carrying no name at all.
    const simAws = new SimAws();

    // When it is created.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().createWorkGroup({ input: {} });
    });

    // Then it is refused rather than named for us.
    assertStringIncludes(error.message, "Name is required");
  });

  it("refuses a request naming a workgroup that is not there", async () => {
    // Given a simulation whose only workgroup is primary.
    const simAws = new SimAws();

    // When a workgroup nothing created is read.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().getWorkGroup({ input: { WorkGroup: "absent" } });
    });

    // Then it is a not-found, which Athena reports as an invalid request.
    assertIdentical(error.name, "InvalidRequestException");
    assertStringIncludes(error.message, "WorkGroup absent is not found");
  });

  it("refuses an update to a workgroup that is not there", async () => {
    // Given a simulation whose only workgroup is primary.
    const simAws = new SimAws();

    // When a workgroup nothing created is updated.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .athena()
        .updateWorkGroup({ input: { WorkGroup: "absent", Description: "x" } });
    });

    // Then it is refused rather than creating one.
    assertStringIncludes(error.message, "is not found");
  });

  it("refuses a state that is neither ENABLED nor DISABLED", async () => {
    // Given a workgroup and an update carrying a state Athena has no meaning
    // for.
    const simAws = new SimAws();
    const name = workGroupName();

    await simAws.athena().createWorkGroup({ input: { Name: name } });

    // When the update is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .athena()
        .updateWorkGroup({ input: { WorkGroup: name, State: "PAUSED" } });
    });

    // Then it is refused, naming the two states a workgroup has.
    assertStringIncludes(error.message, "ENABLED or DISABLED");
  });

  it("refuses a cutoff that is not a whole number of bytes", async () => {
    // Given a cutoff nobody could measure a query against.
    const simAws = new SimAws();

    // When a workgroup is created with it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().createWorkGroup({
        input: {
          Name: workGroupName(),
          Configuration: { BytesScannedCutoffPerQuery: 0 },
        },
      });
    });

    // Then it is refused. Athena's own minimum is 10MB, and this simulation
    // takes anything from 1 byte up so a test can put the guardrail where the
    // query it is exercising needs it.
    assertStringIncludes(error.message, "BytesScannedCutoffPerQuery");
  });

  it("takes a cutoff far below the 10MB minimum real Athena enforces", async () => {
    // Given the cutoff a test exercising the guardrail wants, which is small
    // enough that an ordinary query passes it.
    const simAws = new SimAws();
    const name = workGroupName();

    // When a workgroup is created with it.
    await simAws.athena().createWorkGroup({
      input: {
        Name: name,
        Configuration: { BytesScannedCutoffPerQuery: 512 },
      },
    });

    // Then it is taken and read back, unlike on real Athena.
    const read = await simAws
      .athena()
      .getWorkGroup({ input: { WorkGroup: name } });

    assertIdentical(
      read.WorkGroup?.Configuration?.BytesScannedCutoffPerQuery,
      512,
    );
  });

  it("refuses deleting the primary workgroup", async () => {
    // Given the workgroup every Account has and none can be without.
    const simAws = new SimAws();

    // When something tries to delete it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .athena()
        .deleteWorkGroup({ input: { WorkGroup: "primary" } });
    });

    // Then it is refused.
    assertStringIncludes(error.message, "cannot be deleted");
  });

  it("refuses deleting a workgroup that still holds named queries", async () => {
    // Given a workgroup with a saved query in it.
    const simAws = new SimAws();
    const name = workGroupName();

    await simAws.athena().createWorkGroup({ input: { Name: name } });
    await simAws.athena().createNamedQuery({
      input: {
        Name: "pageviews",
        Database: "rainlytics",
        QueryString: "SELECT 1",
        WorkGroup: name,
      },
    });

    // When it is deleted without the recursive option.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().deleteWorkGroup({ input: { WorkGroup: name } });
    });

    // Then it is refused, naming the option that would take them with it.
    assertStringIncludes(error.message, "RecursiveDeleteOption");
  });

  it("takes a workgroup's named queries with it when told to", async () => {
    // Given the same workgroup with a saved query in it.
    const simAws = new SimAws();
    const name = workGroupName();

    await simAws.athena().createWorkGroup({ input: { Name: name } });
    await simAws.athena().createNamedQuery({
      input: {
        Name: "pageviews",
        Database: "rainlytics",
        QueryString: "SELECT 1",
        WorkGroup: name,
      },
    });

    // When it is deleted recursively.
    await simAws.athena().deleteWorkGroup({
      input: { WorkGroup: name, RecursiveDeleteOption: true },
    });

    // Then the named query went with it.
    assertArrayLength(simAws.athena().namedQueries(), 0);
  });

  it("refuses a page size outside the range Athena takes", async () => {
    // Given a listing asking for more than one page can carry.
    const simAws = new SimAws();

    // When it is listed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.athena().listWorkGroups({ input: { MaxResults: 51 } });
    });

    // Then it is refused, naming the range.
    assertStringIncludes(error.message, "outside the range 1 to 50");
  });

  it("refuses a continuation token no listing here issued", async () => {
    // Given a workgroup to list, and a token from somewhere other than a
    // previous page.
    const simAws = new SimAws();

    await simAws.athena().createWorkGroup({ input: { Name: workGroupName() } });

    // When it is followed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .athena()
        .listWorkGroups({ input: { NextToken: "not-a-token" } });
    });

    // Then it is refused rather than silently starting from the beginning.
    assertStringIncludes(error.message, "NextToken");
  });
});
