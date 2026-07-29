/* eslint-disable @typescript-eslint/naming-convention -- the authentication
   parameter names are Cognito's own, rather than identifier names. */
import { createHmac } from "node:crypto";
import {
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type { ExplicitAuthFlowsType } from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimCognitoInvalidParameterException,
  SimCognitoNotAuthorizedException,
  SimCognitoUserNotFoundException,
} from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

const password = "Sup3rSecret!";

interface SimCognitoWithClient {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly clientId: string;
}

/**
 * A pool with an app client, and a user that has to change its password.
 */
async function simCognitoWithClient(
  authFlows: ExplicitAuthFlowsType[] = ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
): Promise<SimCognitoWithClient> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(pool.UserPool?.Id);

  const userPoolId = pool.UserPool.Id;
  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: "web",
      ExplicitAuthFlows: authFlows,
    }),
  );

  assertNonNullable(client.UserPoolClient?.ClientId);

  await cognito.adminCreateUser(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: "alice",
      TemporaryPassword: "Temp0rary!",
    }),
  );

  return { cognito, userPoolId, clientId: client.UserPoolClient.ClientId };
}

/**
 * Give the user a password of its own, which confirms it.
 */
async function confirmAlice(
  cognito: SimCognitoIdentityProvider,
  userPoolId: string,
): Promise<void> {
  await cognito.adminSetUserPassword(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: "alice",
      Password: password,
      Permanent: true,
    }),
  );
}

function signIn(
  userPoolId: string,
  clientId: string,
  candidate: string,
): AdminInitiateAuthCommand {
  return new AdminInitiateAuthCommand({
    UserPoolId: userPoolId,
    ClientId: clientId,
    AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: candidate },
  });
}

describe("sim Cognito AdminInitiateAuth", () => {
  it("answers a confirmed user with tokens", async () => {
    // Given a confirmed user.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient();

    await confirmAlice(cognito, userPoolId);

    // When it signs in.
    const signedIn = await cognito.adminInitiateAuth(
      signIn(userPoolId, clientId, password),
    );

    // Then the tokens come back, with the access token's hour reported and a
    // refresh token that is not a JWT.
    const result = signedIn.AuthenticationResult;

    assertNonNullable(result?.AccessToken);
    assertNonNullable(result.IdToken);
    assertNonNullable(result.RefreshToken);
    assertIdentical(result.ExpiresIn, 3600);
    assertIdentical(result.TokenType, "Bearer");
    assertArrayLength(result.RefreshToken.split("."), 1);
    assertUndefined(signedIn.ChallengeName);
  });

  it("challenges a user that has to change its password", async () => {
    // Given a user an admin created, still in FORCE_CHANGE_PASSWORD.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient();

    // When it signs in with its temporary password.
    const signedIn = await cognito.adminInitiateAuth(
      signIn(userPoolId, clientId, "Temp0rary!"),
    );

    // Then it gets the challenge and a session rather than tokens.
    assertIdentical(signedIn.ChallengeName, "NEW_PASSWORD_REQUIRED");
    assertNonNullable(signedIn.Session);
    assertIdentical(signedIn.ChallengeParameters?.["USER_ID_FOR_SRP"], "alice");
    assertUndefined(signedIn.AuthenticationResult);
  });

  it("refuses a flow the app client is not configured for", async () => {
    // Given an app client without the admin flow among its ExplicitAuthFlows.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient([
      "ALLOW_USER_SRP_AUTH",
      "ALLOW_REFRESH_TOKEN_AUTH",
    ]);

    await confirmAlice(cognito, userPoolId);

    // When a sign-in is tried anyway.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminInitiateAuth(signIn(userPoolId, clientId, password));
    });

    // Then it is refused before the password is looked at, as real Cognito
    // refuses it.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "is not enabled for the client");
  });

  it("refuses a wrong password", async () => {
    // Given a confirmed user.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient();

    await confirmAlice(cognito, userPoolId);

    // When it signs in with the wrong password.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminInitiateAuth(
        signIn(userPoolId, clientId, "Wr0ngPassword!"),
      );
    });

    // Then it is refused, saying no more than real Cognito says.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Incorrect username or password");
  });

  it("refuses a disabled user", async () => {
    // Given a confirmed user that has been disabled.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient();

    await confirmAlice(cognito, userPoolId);
    await cognito.adminDisableUser(
      new AdminDisableUserCommand({
        UserPoolId: userPoolId,
        Username: "alice",
      }),
    );

    // When it signs in with the right password.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminInitiateAuth(signIn(userPoolId, clientId, password));
    });

    // Then it is refused: disabling a user is what stops it authenticating.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "User is disabled");
  });

  it("refuses a user the pool does not hold", async () => {
    // Given a pool with an app client.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient();

    // When an unknown user signs in.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminInitiateAuth(
        new AdminInitiateAuthCommand({
          UserPoolId: userPoolId,
          ClientId: clientId,
          AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
          AuthParameters: { USERNAME: "nobody", PASSWORD: password },
        }),
      );
    });

    // Then the user is reported missing, as an admin flow reports it.
    assertInstanceOf(error, SimCognitoUserNotFoundException);
  });

  it("refuses a user created without a temporary password", async () => {
    // Given a user created with no password at all.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient();

    await cognito.adminCreateUser(
      new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "bob" }),
    );

    // When it signs in.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminInitiateAuth(
        new AdminInitiateAuthCommand({
          UserPoolId: userPoolId,
          ClientId: clientId,
          AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
          AuthParameters: { USERNAME: "bob", PASSWORD: password },
        }),
      );
    });

    // Then nothing matches: real Cognito emails a generated password, and
    // nothing here delivers one.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
  });

  it("refuses an authentication flow this simulation does not run", async () => {
    // Given a pool with an app client.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient();

    // When SRP sign-in is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminInitiateAuth(
        new AdminInitiateAuthCommand({
          UserPoolId: userPoolId,
          ClientId: clientId,
          AuthFlow: "USER_SRP_AUTH",
          AuthParameters: { USERNAME: "alice", SRP_A: "abc" },
        }),
      );
    });

    // Then it is refused rather than run as one of the flows that are
    // simulated.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "is not simulated");
  });

  it("refuses a request carrying no parameters at all", async () => {
    // Given a pool with an app client.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient();

    // When a sign-in arrives without AuthParameters.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminInitiateAuth(
        new AdminInitiateAuthCommand({
          UserPoolId: userPoolId,
          ClientId: clientId,
          AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        }),
      );
    });

    // Then the username it needed is what it names.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "Missing required parameter USERNAME");
  });

  it("wants a SECRET_HASH from an app client with a secret", async () => {
    // Given a pool whose app client was created with a secret.
    const cognito = new SimAws().cognitoIdentityProvider();
    const pool = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );

    assertNonNullable(pool.UserPool?.Id);

    const userPoolId = pool.UserPool.Id;
    const client = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "server",
        GenerateSecret: true,
        ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
      }),
    );

    assertNonNullable(client.UserPoolClient?.ClientId);
    assertNonNullable(client.UserPoolClient.ClientSecret);

    const clientId = client.UserPoolClient.ClientId;

    await cognito.adminCreateUser(
      new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );
    await confirmAlice(cognito, userPoolId);

    // When a sign-in arrives without one.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminInitiateAuth(signIn(userPoolId, clientId, password));
    });

    // Then it is refused, and the hash the SDKs compute is what gets in.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Unable to verify secret hash");

    const secretHash = createHmac("sha256", client.UserPoolClient.ClientSecret)
      .update(`alice${clientId}`)
      .digest("base64");

    const signedIn = await cognito.adminInitiateAuth(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: "alice",
          PASSWORD: password,
          SECRET_HASH: secretHash,
        },
      }),
    );

    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
  });

  it("refuses a request missing a parameter the flow needs", async () => {
    // Given a pool with an app client.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient();

    // When the password is left out.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminInitiateAuth(
        new AdminInitiateAuthCommand({
          UserPoolId: userPoolId,
          ClientId: clientId,
          AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
          AuthParameters: { USERNAME: "alice" },
        }),
      );
    });

    // Then it is refused, naming what was missing.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "Missing required parameter PASSWORD");
  });
});
