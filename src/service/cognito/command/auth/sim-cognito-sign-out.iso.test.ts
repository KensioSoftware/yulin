/* eslint-disable @typescript-eslint/naming-convention -- the authentication
   parameter names are Cognito's own, rather than identifier names. */
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminUserGlobalSignOutCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  GlobalSignOutCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { CreateRoleCommand } from "@aws-sdk/client-iam";
import {
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  SimCognitoInvalidParameterException,
  SimCognitoNotAuthorizedException,
} from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

const password = "Sup3rSecret!";

interface SimCognitoSignedIn {
  readonly simAws: SimAws;
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly clientId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
}

/**
 * A confirmed user, signed in and holding both its tokens.
 */
async function simCognitoSignedIn(): Promise<SimCognitoSignedIn> {
  const simAws = new SimAws();
  const cognito = simAws.cognitoIdentityProvider();
  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(pool.UserPool?.Id);

  const userPoolId = pool.UserPool.Id;
  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: "web",
      ExplicitAuthFlows: [
        "ALLOW_USER_PASSWORD_AUTH",
        "ALLOW_REFRESH_TOKEN_AUTH",
      ],
    }),
  );

  assertNonNullable(client.UserPoolClient?.ClientId);

  const clientId = client.UserPoolClient.ClientId;

  await cognito.adminCreateUser(
    new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
  );
  await cognito.adminSetUserPassword(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: "alice",
      Password: password,
      Permanent: true,
    }),
  );

  const signedIn = await cognito.initiateAuth(
    new InitiateAuthCommand({
      ClientId: clientId,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: "alice", PASSWORD: password },
    }),
  );

  assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
  assertNonNullable(signedIn.AuthenticationResult.RefreshToken);

  return {
    simAws,
    cognito,
    userPoolId,
    clientId,
    accessToken: signedIn.AuthenticationResult.AccessToken,
    refreshToken: signedIn.AuthenticationResult.RefreshToken,
  };
}

async function refusedRefresh(signedIn: SimCognitoSignedIn): Promise<Error> {
  return await assertThrowsErrorAsync(async () => {
    await signedIn.cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: signedIn.clientId,
        AuthFlow: "REFRESH_TOKEN_AUTH",
        AuthParameters: { REFRESH_TOKEN: signedIn.refreshToken },
      }),
    );
  });
}

describe("sim Cognito GlobalSignOut", () => {
  it("invalidates the refresh tokens of the user its access token names", async () => {
    // Given a signed-in user.
    const signedIn = await simCognitoSignedIn();

    // When it signs out with its access token.
    await signedIn.cognito.globalSignOut(
      new GlobalSignOutCommand({ AccessToken: signedIn.accessToken }),
    );

    // Then the refresh token it kept is spent.
    const error = await refusedRefresh(signedIn);

    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Invalid Refresh Token");
  });

  it("needs no IAM permission", async () => {
    // Given a signed-in user, and a caller whose Role permits nothing.
    const signedIn = await simCognitoSignedIn();
    const role = await signedIn.simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "AppClient",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: "arn:aws:iam::123456789012:root" },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    const caller: SimAwsCaller = { kind: "arn", arn: role.Role.Arn };

    // When that caller signs the user out through the admin operation.
    const error = await assertThrowsErrorAsync(async () => {
      await signedIn.cognito.adminUserGlobalSignOut(
        new AdminUserGlobalSignOutCommand({
          UserPoolId: signedIn.userPoolId,
          Username: "alice",
        }),
        { caller },
      );
    });

    // Then it is denied, where the user's own sign-out is not: real Cognito
    // authorizes GlobalSignOut with the access token and no IAM policy.
    assertInstanceOf(error, SimIamAccessDenied);

    await signedIn.cognito.globalSignOut(
      new GlobalSignOutCommand({ AccessToken: signedIn.accessToken }),
    );
  });

  it("refuses an access token that has already signed out", async () => {
    // Given a user that has signed out.
    const signedIn = await simCognitoSignedIn();

    await signedIn.cognito.globalSignOut(
      new GlobalSignOutCommand({ AccessToken: signedIn.accessToken }),
    );

    // When the same access token signs out again.
    const error = await assertThrowsErrorAsync(async () => {
      await signedIn.cognito.globalSignOut(
        new GlobalSignOutCommand({ AccessToken: signedIn.accessToken }),
      );
    });

    // Then it is refused: signing out revokes the access token too.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Access Token has been revoked");
  });

  it("refuses an access token that has expired", async () => {
    // Given a signed-in user whose access token has run out.
    const signedIn = await simCognitoSignedIn();

    await signedIn.simAws.clock().advanceBy({ hours: 2 });

    // When it signs out.
    const error = await assertThrowsErrorAsync(async () => {
      await signedIn.cognito.globalSignOut(
        new GlobalSignOutCommand({ AccessToken: signedIn.accessToken }),
      );
    });

    // Then it is refused, as an expired token authorizes nothing.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Access Token has expired");
  });

  it("refuses a request carrying no access token", async () => {
    // Given a signed-in user.
    const signedIn = await simCognitoSignedIn();

    // When a sign-out names no token.
    const error = await assertThrowsErrorAsync(async () => {
      await signedIn.cognito.globalSignOut({ input: {} });
    });

    // Then it is refused, naming what was missing.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "AccessToken is required");
  });

  it("leaves another user's session alone", async () => {
    // Given two users signed in through the same app client.
    const signedIn = await simCognitoSignedIn();

    await signedIn.cognito.adminCreateUser(
      new AdminCreateUserCommand({
        UserPoolId: signedIn.userPoolId,
        Username: "bob",
      }),
    );
    await signedIn.cognito.adminSetUserPassword(
      new AdminSetUserPasswordCommand({
        UserPoolId: signedIn.userPoolId,
        Username: "bob",
        Password: password,
        Permanent: true,
      }),
    );

    const bob = await signedIn.cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: signedIn.clientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "bob", PASSWORD: password },
      }),
    );

    assertNonNullable(bob.AuthenticationResult?.RefreshToken);

    // When one of them signs out.
    await signedIn.cognito.globalSignOut(
      new GlobalSignOutCommand({ AccessToken: signedIn.accessToken }),
    );

    // Then the other's session goes on.
    const refreshed = await signedIn.cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: signedIn.clientId,
        AuthFlow: "REFRESH_TOKEN_AUTH",
        AuthParameters: {
          REFRESH_TOKEN: bob.AuthenticationResult.RefreshToken,
        },
      }),
    );

    assertNonNullable(refreshed.AuthenticationResult?.AccessToken);
  });
});

describe("sim Cognito AdminUserGlobalSignOut", () => {
  it("invalidates the refresh tokens of the user it names", async () => {
    // Given a signed-in user.
    const signedIn = await simCognitoSignedIn();

    // When an administrator signs it out.
    await signedIn.cognito.adminUserGlobalSignOut(
      new AdminUserGlobalSignOutCommand({
        UserPoolId: signedIn.userPoolId,
        Username: "alice",
      }),
    );

    // Then the refresh token it kept is spent.
    const error = await refusedRefresh(signedIn);

    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Invalid Refresh Token");
  });

  it("lets the user sign in again afterwards", async () => {
    // Given a user that has been signed out.
    const signedIn = await simCognitoSignedIn();

    await signedIn.cognito.adminUserGlobalSignOut(
      new AdminUserGlobalSignOutCommand({
        UserPoolId: signedIn.userPoolId,
        Username: "alice",
      }),
    );

    // When it signs in again.
    const again = await signedIn.cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: signedIn.clientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: password },
      }),
    );

    // Then it gets a session again: signing out ends the sessions it had
    // rather than stopping it authenticating.
    assertNonNullable(again.AuthenticationResult?.RefreshToken);
  });
});
