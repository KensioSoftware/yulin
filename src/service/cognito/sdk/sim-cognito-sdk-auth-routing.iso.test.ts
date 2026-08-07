import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  AdminSetUserPasswordCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";

describe("Cognito authentication SDK interception", () => {
  it("signs a user in through an intercepted client and verifies the token", async () => {
    // Given an intercepted Cognito SDK client, and a simulation to read the
    // pool's JWKS from.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    using simSdk = new SimSdk({ simAws });
    simSdk.intercept(CognitoIdentityProviderClient);

    const client = new CognitoIdentityProviderClient({ region: "eu-west-2" });
    const pool = await client.send(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const UserPoolId = pool.UserPool?.Id;
    const appClient = await client.send(
      new CreateUserPoolClientCommand({
        UserPoolId,
        ClientName: "web",
        ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
      }),
    );
    const ClientId = appClient.UserPoolClient?.ClientId;

    await client.send(
      new AdminCreateUserCommand({
        UserPoolId,
        Username: "alice",
        TemporaryPassword: "Temp0rary!",
      }),
    );

    // When ordinary SDK code signs the user in and answers the challenge.
    const challenged = await client.send(
      new AdminInitiateAuthCommand({
        UserPoolId,
        ClientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: "Temp0rary!" },
      }),
    );

    assertIdentical(challenged.ChallengeName, "NEW_PASSWORD_REQUIRED");

    const signedIn = await client.send(
      new AdminRespondToAuthChallengeCommand({
        UserPoolId,
        ClientId,
        ChallengeName: "NEW_PASSWORD_REQUIRED",
        Session: challenged.Session,
        ChallengeResponses: {
          USERNAME: "alice",
          NEW_PASSWORD: "Sup3rSecret!",
        },
      }),
    );

    // Then the token it got back verifies against the pool's JWKS, with
    // nothing having touched the network.
    assertNonNullable(UserPoolId);
    assertNonNullable(ClientId);
    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);

    const verifier = CognitoJwtVerifier.create({
      userPoolId: UserPoolId,
      tokenUse: "access",
      clientId: ClientId,
    });

    verifier.cacheJwks(
      simAws.cognitoIdentityProvider().userPool(UserPoolId).jwks(),
    );

    const payload = await verifier.verify(
      signedIn.AuthenticationResult.AccessToken,
    );

    assertIdentical(payload.username, "alice");
  });

  it("signs a user in, refreshes and signs out through an intercepted client", async () => {
    // Given an intercepted Cognito SDK client, and a pool whose app client
    // allows the client-side flows.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    using simSdk = new SimSdk({ simAws });
    simSdk.intercept(CognitoIdentityProviderClient);

    const client = new CognitoIdentityProviderClient({ region: "eu-west-2" });
    const pool = await client.send(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const UserPoolId = pool.UserPool?.Id;
    const appClient = await client.send(
      new CreateUserPoolClientCommand({
        UserPoolId,
        ClientName: "web",
        ExplicitAuthFlows: [
          "ALLOW_USER_PASSWORD_AUTH",
          "ALLOW_REFRESH_TOKEN_AUTH",
        ],
      }),
    );
    const ClientId = appClient.UserPoolClient?.ClientId;

    await client.send(
      new AdminCreateUserCommand({ UserPoolId, Username: "alice" }),
    );
    await client.send(
      new AdminSetUserPasswordCommand({
        UserPoolId,
        Username: "alice",
        Password: "Sup3rSecret!",
        Permanent: true,
      }),
    );

    // When ordinary SDK code signs in, refreshes and then signs out.
    const signedIn = await client.send(
      new InitiateAuthCommand({
        ClientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
      }),
    );

    assertNonNullable(signedIn.AuthenticationResult?.RefreshToken);
    assertNonNullable(signedIn.AuthenticationResult.AccessToken);

    const REFRESH_TOKEN = signedIn.AuthenticationResult.RefreshToken;
    const refreshed = await client.send(
      new InitiateAuthCommand({
        ClientId,
        AuthFlow: "REFRESH_TOKEN_AUTH",
        AuthParameters: { REFRESH_TOKEN },
      }),
    );

    assertNonNullable(refreshed.AuthenticationResult?.AccessToken);

    await client.send(
      new GlobalSignOutCommand({
        AccessToken: signedIn.AuthenticationResult.AccessToken,
      }),
    );

    // Then the refresh token is spent, as it is after a sign-out on real
    // Cognito.
    const error = await assertThrowsErrorAsync(async () => {
      await client.send(
        new InitiateAuthCommand({
          ClientId,
          AuthFlow: "REFRESH_TOKEN_AUTH",
          AuthParameters: { REFRESH_TOKEN },
        }),
      );
    });

    assertIdentical(error.name, "NotAuthorizedException");
  });

  it("answers the challenge and signs a user out as an administrator", async () => {
    // Given an intercepted Cognito SDK client, and a user with a temporary
    // password.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    using simSdk = new SimSdk({ simAws });
    simSdk.intercept(CognitoIdentityProviderClient);

    const client = new CognitoIdentityProviderClient({ region: "eu-west-2" });
    const pool = await client.send(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const UserPoolId = pool.UserPool?.Id;
    const appClient = await client.send(
      new CreateUserPoolClientCommand({
        UserPoolId,
        ClientName: "web",
        ExplicitAuthFlows: [
          "ALLOW_USER_PASSWORD_AUTH",
          "ALLOW_REFRESH_TOKEN_AUTH",
        ],
      }),
    );
    const ClientId = appClient.UserPoolClient?.ClientId;

    await client.send(
      new AdminCreateUserCommand({
        UserPoolId,
        Username: "alice",
        TemporaryPassword: "Temp0rary!",
      }),
    );

    // When ordinary SDK code answers the challenge and an administrator then
    // signs the user out.
    const challenged = await client.send(
      new InitiateAuthCommand({
        ClientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: "Temp0rary!" },
      }),
    );

    assertIdentical(challenged.ChallengeName, "NEW_PASSWORD_REQUIRED");

    const signedIn = await client.send(
      new RespondToAuthChallengeCommand({
        ClientId,
        ChallengeName: "NEW_PASSWORD_REQUIRED",
        Session: challenged.Session,
        ChallengeResponses: {
          USERNAME: "alice",
          NEW_PASSWORD: "Sup3rSecret!",
        },
      }),
    );

    assertNonNullable(signedIn.AuthenticationResult?.RefreshToken);

    const REFRESH_TOKEN = signedIn.AuthenticationResult.RefreshToken;

    await client.send(
      new AdminUserGlobalSignOutCommand({ UserPoolId, Username: "alice" }),
    );

    // Then the session the challenge response gave is over.
    const error = await assertThrowsErrorAsync(async () => {
      await client.send(
        new InitiateAuthCommand({
          ClientId,
          AuthFlow: "REFRESH_TOKEN_AUTH",
          AuthParameters: { REFRESH_TOKEN },
        }),
      );
    });

    assertIdentical(error.name, "NotAuthorizedException");
  });
});
