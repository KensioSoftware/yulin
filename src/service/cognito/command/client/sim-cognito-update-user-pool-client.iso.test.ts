import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DescribeUserPoolClientCommand,
  UpdateUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCognitoResourceNotFoundException } from "../../error/sim-cognito.error.js";

describe("sim Cognito UpdateUserPoolClient", () => {
  it("applies the settings the request names", async () => {
    // Given a pool with an app client created with nothing but a name.
    const cognito = new SimAws().cognitoIdentityProvider();
    const pool = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const userPoolId = pool.UserPool?.Id;
    const created = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
      }),
    );
    const clientId = created.UserPoolClient?.ClientId;

    // When the client is updated with new settings.
    const updated = await cognito.updateUserPoolClient(
      new UpdateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        ClientName: "web-app",
        ExplicitAuthFlows: [
          "ALLOW_USER_PASSWORD_AUTH",
          "ALLOW_REFRESH_TOKEN_AUTH",
        ],
        PreventUserExistenceErrors: "ENABLED",
        AccessTokenValidity: 5,
        TokenValidityUnits: { AccessToken: "minutes" },
      }),
    );

    // Then the update reports them, and so does the client from then on.
    assertIdentical(updated.UserPoolClient?.ClientName, "web-app");
    assertArrayEquals(updated.UserPoolClient.ExplicitAuthFlows, [
      "ALLOW_USER_PASSWORD_AUTH",
      "ALLOW_REFRESH_TOKEN_AUTH",
    ]);
    assertIdentical(
      updated.UserPoolClient.PreventUserExistenceErrors,
      "ENABLED",
    );
    assertIdentical(updated.UserPoolClient.AccessTokenValidity, 5);

    const described = await cognito.describeUserPoolClient(
      new DescribeUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
      }),
    );

    assertIdentical(described.UserPoolClient?.ClientName, "web-app");
    assertIdentical(
      described.UserPoolClient.TokenValidityUnits?.AccessToken,
      "minutes",
    );

    const client = cognito
      .findUserPool(userPoolId ?? "")
      ?.findClient(clientId ?? "");

    assertNonNullable(client);
    assertIdentical(client.tokenValidity.accessToken.seconds, 5 * 60);
  });

  it("resets the settings the request leaves out to their defaults", async () => {
    // Given a client created with flows, token lifetimes and a
    // PreventUserExistenceErrors of its own.
    const cognito = new SimAws().cognitoIdentityProvider();
    const pool = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const userPoolId = pool.UserPool?.Id;
    const created = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
        ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
        PreventUserExistenceErrors: "ENABLED",
        AccessTokenValidity: 5,
        IdTokenValidity: 5,
        RefreshTokenValidity: 1,
        TokenValidityUnits: {
          AccessToken: "minutes",
          IdToken: "minutes",
          RefreshToken: "days",
        },
      }),
    );

    // When an update names only the client's name.
    const updated = await cognito.updateUserPoolClient(
      new UpdateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: created.UserPoolClient?.ClientId,
        ClientName: "web",
      }),
    );

    // Then everything the request left out is back to the default
    // CreateUserPoolClient would have applied, as real Cognito replaces a
    // client's configuration rather than merging into it.
    assertArrayEquals(updated.UserPoolClient?.ExplicitAuthFlows, [
      "ALLOW_REFRESH_TOKEN_AUTH",
      "ALLOW_USER_SRP_AUTH",
      "ALLOW_CUSTOM_AUTH",
    ]);
    assertIdentical(
      updated.UserPoolClient.PreventUserExistenceErrors,
      "LEGACY",
    );
    assertUndefined(updated.UserPoolClient.AccessTokenValidity);
    assertUndefined(updated.UserPoolClient.IdTokenValidity);
    assertUndefined(updated.UserPoolClient.TokenValidityUnits);
    assertIdentical(updated.UserPoolClient.RefreshTokenValidity, 30);
  });

  it("keeps the client's name when the request names no other", async () => {
    // Given a client called web.
    const cognito = new SimAws().cognitoIdentityProvider();
    const pool = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const userPoolId = pool.UserPool?.Id;
    const created = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
      }),
    );

    // When an update says nothing about the name.
    const updated = await cognito.updateUserPoolClient(
      new UpdateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: created.UserPoolClient?.ClientId,
        AccessTokenValidity: 30,
        TokenValidityUnits: { AccessToken: "minutes" },
      }),
    );

    // Then it is still called web. A client has to have a name, and
    // CreateUserPoolClient requires one, so there is no default to reset to.
    assertIdentical(updated.UserPoolClient?.ClientName, "web");
    assertIdentical(updated.UserPoolClient.AccessTokenValidity, 30);
  });

  it("leaves the client's secret untouched", async () => {
    // Given one client with a secret and one without.
    const cognito = new SimAws().cognitoIdentityProvider();
    const pool = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const userPoolId = pool.UserPool?.Id;
    const withSecret = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "server",
        GenerateSecret: true,
      }),
    );
    const withoutSecret = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
      }),
    );

    // When both are updated.
    const updatedWithSecret = await cognito.updateUserPoolClient(
      new UpdateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: withSecret.UserPoolClient?.ClientId,
        ClientName: "server",
      }),
    );
    const updatedWithoutSecret = await cognito.updateUserPoolClient(
      new UpdateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: withoutSecret.UserPoolClient?.ClientId,
        ClientName: "web",
      }),
    );

    // Then the first keeps the same secret and the second still has none.
    // UpdateUserPoolClient has no GenerateSecret input on real Cognito.
    assertNonNullable(withSecret.UserPoolClient?.ClientSecret);
    assertIdentical(
      updatedWithSecret.UserPoolClient?.ClientSecret,
      withSecret.UserPoolClient.ClientSecret,
    );
    assertUndefined(updatedWithoutSecret.UserPoolClient?.ClientSecret);
  });

  it("reports when the client was last updated", async () => {
    // Given a simulation whose clock is stopped, and a client created on it.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const createdAt = new Date("2026-03-01T09:00:00.000Z");

    await simAws.clock().setTo(createdAt);

    const pool = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const userPoolId = pool.UserPool?.Id;
    const created = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
      }),
    );

    // Then a client nothing has changed reports its creation date.
    assertIdentical(
      created.UserPoolClient?.LastModifiedDate?.getTime(),
      createdAt.getTime(),
    );

    // When an hour passes and the client is updated.
    await simAws.clock().advanceBy({ hours: 1 });

    const updated = await cognito.updateUserPoolClient(
      new UpdateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: created.UserPoolClient.ClientId,
        ClientName: "web-app",
      }),
    );

    // Then it reports when the update happened, and its creation date is
    // where it was.
    assertIdentical(
      updated.UserPoolClient?.LastModifiedDate?.getTime(),
      createdAt.getTime() + 60 * 60 * 1000,
    );
    assertIdentical(
      updated.UserPoolClient.CreationDate?.getTime(),
      createdAt.getTime(),
    );
  });

  it("refuses an update naming a client the pool does not hold", async () => {
    // Given a pool with no app clients.
    const cognito = new SimAws().cognitoIdentityProvider();
    const pool = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );

    // When a client that was never created is updated.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.updateUserPoolClient(
        new UpdateUserPoolClientCommand({
          UserPoolId: pool.UserPool?.Id,
          ClientId: "1example23456789abcdefghij",
          ClientName: "web",
        }),
      );
    });

    // Then it is reported missing.
    assertInstanceOf(error, SimCognitoResourceNotFoundException);
  });
});
