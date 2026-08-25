import {
  AthenaClient,
  StartQueryExecutionCommand,
  BatchGetNamedQueryCommand,
  CreateNamedQueryCommand,
  CreateWorkGroupCommand,
  DeleteNamedQueryCommand,
  DeleteWorkGroupCommand,
  GetNamedQueryCommand,
  GetWorkGroupCommand,
  ListNamedQueriesCommand,
  ListWorkGroupsCommand,
  UpdateWorkGroupCommand,
} from "@aws-sdk/client-athena";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSdk } from "../../../sdk/index.js";

describe("Athena SDK interception", () => {
  it("routes an intercepted AthenaClient to simulated Athena", async () => {
    // Given an intercepted Athena SDK client.
    using simSdk = new SimSdk();
    simSdk.intercept(AthenaClient);

    const client = new AthenaClient({ region: "eu-west-2" });

    // When ordinary SDK code creates a workgroup and reads it back.
    await client.send(
      new CreateWorkGroupCommand({
        Name: "rainlytics",
        Configuration: {
          BytesScannedCutoffPerQuery: 10_000_000_000,
          EnforceWorkGroupConfiguration: true,
          ResultConfiguration: { OutputLocation: "s3://results/queries/" },
        },
      }),
    );

    const read = await client.send(
      new GetWorkGroupCommand({ WorkGroup: "rainlytics" }),
    );

    // Then it reached the simulation, with the cutoff the guardrail is for.
    const configuration = read.WorkGroup?.Configuration;

    assertNonNullable(configuration);
    assertIdentical(configuration.BytesScannedCutoffPerQuery, 10_000_000_000);
    assertIdentical(
      configuration.ResultConfiguration?.OutputLocation,
      "s3://results/queries/",
    );
  });

  it("routes every command simulated Athena handles", async () => {
    // Given an intercepted client with a workgroup already created.
    using simSdk = new SimSdk();
    simSdk.intercept(AthenaClient);

    const client = new AthenaClient({ region: "eu-west-2" });

    await client.send(new CreateWorkGroupCommand({ Name: "rainlytics" }));

    // When each of the remaining commands is sent.
    await client.send(
      new UpdateWorkGroupCommand({
        WorkGroup: "rainlytics",
        Description: "CloudFront access log queries",
      }),
    );

    const workGroups = await client.send(new ListWorkGroupsCommand({}));

    const created = await client.send(
      new CreateNamedQueryCommand({
        Name: "pageviews",
        Database: "rainlytics",
        QueryString: "SELECT 1",
        WorkGroup: "rainlytics",
      }),
    );

    const namedQuery = await client.send(
      new GetNamedQueryCommand({ NamedQueryId: created.NamedQueryId }),
    );
    const batch = await client.send(
      new BatchGetNamedQueryCommand({
        NamedQueryIds: [String(created.NamedQueryId)],
      }),
    );
    const listed = await client.send(
      new ListNamedQueriesCommand({ WorkGroup: "rainlytics" }),
    );

    await client.send(
      new DeleteNamedQueryCommand({ NamedQueryId: created.NamedQueryId }),
    );
    await client.send(new DeleteWorkGroupCommand({ WorkGroup: "rainlytics" }));

    // Then every one of them reached the simulation.
    assertArrayLength(workGroups.WorkGroups ?? [], 2);
    assertIdentical(namedQuery.NamedQuery?.Name, "pageviews");
    assertArrayLength(batch.NamedQueries ?? [], 1);
    assertArrayLength(listed.NamedQueryIds ?? [], 1);

    const gone = await assertThrowsErrorAsync(async () => {
      await client.send(new GetWorkGroupCommand({ WorkGroup: "rainlytics" }));
    });

    assertStringIncludes(gone.message, "is not found");
  });

  it("gives an intercepted client the error name Athena answers with", async () => {
    // Given an intercepted client asking for a workgroup nothing created.
    using simSdk = new SimSdk();
    simSdk.intercept(AthenaClient);

    const client = new AthenaClient({ region: "eu-west-2" });

    // When it is read.
    const error = await assertThrowsErrorAsync(async () => {
      await client.send(new GetWorkGroupCommand({ WorkGroup: "absent" }));
    });

    // Then the error matches by name, which is how SDK code catches it.
    assertIdentical(error.name, "InvalidRequestException");
  });

  it("says which commands it has when sent one it has not", async () => {
    // Given an intercepted client sending a query execution command, which
    // this simulation does not run.
    using simSdk = new SimSdk();
    simSdk.intercept(AthenaClient);

    const client = new AthenaClient({ region: "eu-west-2" });

    // When it is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await client.send(
        new StartQueryExecutionCommand({ QueryString: "SELECT 1" }),
      );
    });

    // Then the refusal lists the commands simulated Athena does handle, so a
    // caller can see how far it goes.
    assertStringIncludes(
      error.message,
      "does not support SDK Command StartQueryExecutionCommand",
    );
    assertStringIncludes(error.message, "GetWorkGroupCommand");
  });
});
