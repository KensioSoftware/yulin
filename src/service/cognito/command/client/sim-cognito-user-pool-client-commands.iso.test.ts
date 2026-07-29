import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DeleteUserPoolClientCommand,
  DeleteUserPoolCommand,
  DescribeUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringLength,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCognitoResourceNotFoundException } from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

interface SimCognitoWithPool {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
}

async function simCognitoWithPool(): Promise<SimCognitoWithPool> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(created.UserPool?.Id);

  return { cognito, userPoolId: created.UserPool.Id };
}

describe("sim Cognito app client commands", () => {
  it("creates an app client with the defaults real Cognito applies", async () => {
    // Given a user pool.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When an app client is created with nothing but a name.
    const created = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
      }),
    );

    // Then it has an id, no secret, the three default authentication flows,
    // and refresh tokens lasting thirty days.
    assertNonNullable(created.UserPoolClient);
    assertNonNullable(created.UserPoolClient.ClientId);
    assertStringLength(created.UserPoolClient.ClientId, 26);
    assertIdentical(created.UserPoolClient.UserPoolId, userPoolId);
    assertUndefined(created.UserPoolClient.ClientSecret);
    assertArrayEquals(created.UserPoolClient.ExplicitAuthFlows, [
      "ALLOW_REFRESH_TOKEN_AUTH",
      "ALLOW_USER_SRP_AUTH",
      "ALLOW_CUSTOM_AUTH",
    ]);
    assertIdentical(created.UserPoolClient.RefreshTokenValidity, 30);
    assertUndefined(created.UserPoolClient.AccessTokenValidity);
  });

  it("generates a client secret only for a client that asked for one", async () => {
    // Given a user pool.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When one client asks for a secret and another does not.
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
        GenerateSecret: false,
      }),
    );

    // Then only the first has one, and it is the length Cognito generates.
    assertNonNullable(withSecret.UserPoolClient?.ClientSecret);
    assertStringLength(withSecret.UserPoolClient.ClientSecret, 52);
    assertUndefined(withoutSecret.UserPoolClient?.ClientSecret);
  });

  it("stores the authentication flows and token lifetimes it is given", async () => {
    // Given a user pool.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When a client names its flows and its token lifetimes.
    const created = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
        ExplicitAuthFlows: [
          "ALLOW_USER_PASSWORD_AUTH",
          "ALLOW_REFRESH_TOKEN_AUTH",
        ],
        AccessTokenValidity: 15,
        IdTokenValidity: 15,
        RefreshTokenValidity: 1,
        TokenValidityUnits: {
          AccessToken: "minutes",
          IdToken: "minutes",
          RefreshToken: "days",
        },
      }),
    );

    // Then they are reported back as set, and resolve to the durations they
    // name.
    assertArrayEquals(created.UserPoolClient?.ExplicitAuthFlows, [
      "ALLOW_USER_PASSWORD_AUTH",
      "ALLOW_REFRESH_TOKEN_AUTH",
    ]);
    assertIdentical(created.UserPoolClient.AccessTokenValidity, 15);
    assertIdentical(
      created.UserPoolClient.TokenValidityUnits?.AccessToken,
      "minutes",
    );

    const client = cognito
      .findUserPool(userPoolId)
      ?.findClient(created.UserPoolClient.ClientId ?? "");

    assertNonNullable(client);
    assertIdentical(client.tokenValidity.accessToken.seconds, 15 * 60);
    assertIdentical(client.tokenValidity.refreshToken.seconds, 24 * 60 * 60);
    assertFalse(client.hasSecret);
    assertTrue(client.explicitAuthFlows.allows("ALLOW_USER_PASSWORD_AUTH"));
    assertFalse(client.explicitAuthFlows.allows("ALLOW_USER_SRP_AUTH"));
  });

  it("gives an access token an hour when the client says nothing", async () => {
    // Given a user pool and a client with no token settings.
    const { cognito, userPoolId } = await simCognitoWithPool();
    const created = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
      }),
    );

    // When the stored lifetimes are read.
    const client = cognito
      .findUserPool(userPoolId)
      ?.findClient(created.UserPoolClient?.ClientId ?? "");

    // Then they are the defaults real Cognito applies: an hour for access and
    // ID tokens, thirty days for refresh tokens.
    assertNonNullable(client);
    assertIdentical(client.tokenValidity.accessToken.seconds, 60 * 60);
    assertIdentical(client.tokenValidity.idToken.seconds, 60 * 60);
    assertIdentical(
      client.tokenValidity.refreshToken.seconds,
      30 * 24 * 60 * 60,
    );
  });

  it("describes an app client, including its secret", async () => {
    // Given a client created with a secret.
    const { cognito, userPoolId } = await simCognitoWithPool();
    const created = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "server",
        GenerateSecret: true,
      }),
    );

    // When it is described.
    const described = await cognito.describeUserPoolClient(
      new DescribeUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: created.UserPoolClient?.ClientId,
      }),
    );

    // Then the secret comes back, which is how an application reads the one
    // it was given.
    assertIdentical(
      described.UserPoolClient?.ClientSecret,
      created.UserPoolClient?.ClientSecret,
    );
    assertIdentical(described.UserPoolClient?.ClientName, "server");
  });

  it("deletes an app client", async () => {
    // Given a client.
    const { cognito, userPoolId } = await simCognitoWithPool();
    const created = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
      }),
    );
    const clientId = created.UserPoolClient?.ClientId;

    // When it is deleted.
    await cognito.deleteUserPoolClient(
      new DeleteUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
      }),
    );

    // Then it is gone, while its pool is not.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.describeUserPoolClient(
        new DescribeUserPoolClientCommand({
          UserPoolId: userPoolId,
          ClientId: clientId,
        }),
      );
    });

    assertInstanceOf(error, SimCognitoResourceNotFoundException);
    assertNonNullable(cognito.findUserPool(userPoolId));
  });

  it("takes a pool's app clients with it when the pool is deleted", async () => {
    // Given a pool with a client.
    const { cognito, userPoolId } = await simCognitoWithPool();
    const created = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
      }),
    );

    // When the pool is deleted.
    await cognito.deleteUserPool(
      new DeleteUserPoolCommand({ UserPoolId: userPoolId }),
    );

    // Then its client cannot be reached either.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.describeUserPoolClient(
        new DescribeUserPoolClientCommand({
          UserPoolId: userPoolId,
          ClientId: created.UserPoolClient?.ClientId,
        }),
      );
    });

    assertInstanceOf(error, SimCognitoResourceNotFoundException);
  });
});
