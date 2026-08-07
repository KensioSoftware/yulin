import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  ListUserPoolClientsCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

interface SimCognitoWithClients {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
}

async function simCognitoWithClients(
  ...clientNames: readonly string[]
): Promise<SimCognitoWithClients> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(created.UserPool?.Id);

  const userPoolId = created.UserPool.Id;

  for (const clientName of clientNames) {
    // oxlint-disable-next-line no-await-in-loop -- clients are created in order
    await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: clientName,
      }),
    );
  }

  return { cognito, userPoolId };
}

describe("sim Cognito ListUserPoolClients", () => {
  it("lists the app clients of one pool in creation order", async () => {
    // Given a pool with three clients.
    const { cognito, userPoolId } = await simCognitoWithClients(
      "web",
      "mobile",
      "server",
    );

    // When they are listed.
    const listed = await cognito.listUserPoolClients(
      new ListUserPoolClientsCommand({ UserPoolId: userPoolId }),
    );

    // Then each comes back, with no secret, as real Cognito leaves the secret
    // out of a listing.
    assertArrayEquals(
      listed.UserPoolClients?.map((client) => client.ClientName),
      ["web", "mobile", "server"],
    );
    assertIdentical(listed.UserPoolClients[0]?.UserPoolId, userPoolId);
    assertUndefined(listed.NextToken);
  });

  it("pages the listing with a token", async () => {
    // Given a pool with three clients.
    const { cognito, userPoolId } = await simCognitoWithClients(
      "web",
      "mobile",
      "server",
    );

    // When they are asked for two at a time.
    const firstPage = await cognito.listUserPoolClients(
      new ListUserPoolClientsCommand({ UserPoolId: userPoolId, MaxResults: 2 }),
    );
    const secondPage = await cognito.listUserPoolClients(
      new ListUserPoolClientsCommand({
        UserPoolId: userPoolId,
        MaxResults: 2,
        NextToken: firstPage.NextToken,
      }),
    );

    // Then the token reaches the rest of them.
    assertArrayEquals(
      firstPage.UserPoolClients?.map((client) => client.ClientName),
      ["web", "mobile"],
    );
    assertArrayEquals(
      secondPage.UserPoolClients?.map((client) => client.ClientName),
      ["server"],
    );
  });

  it("refuses to list the clients of a pool that does not exist", async () => {
    // Given simulated Cognito with one pool.
    const { cognito } = await simCognitoWithClients("web");

    // When another pool's clients are listed.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.listUserPoolClients(
        new ListUserPoolClientsCommand({ UserPoolId: "eu-west-2_aBcDeFgHi" }),
      );
    });

    // Then the pool is missing.
    assertStringIncludes(error.message, "does not exist");
  });
});
