/* eslint-disable @typescript-eslint/naming-convention -- the challenge
   response names are Cognito's own, rather than identifier names. */
import {
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  SimCognitoInvalidParameterException,
  SimCognitoNotAuthorizedException,
} from "../../error/sim-cognito.error.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

const temporaryPassword = "Temp0rary!";
const newPassword = "Sup3rSecret!";

interface SimCognitoChallenged {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly clientId: string;
  readonly session: string;
}

/**
 * A user an admin created, part way through the client-side sign-in that its
 * temporary password answers with a challenge.
 */
async function simCognitoChallenged(): Promise<SimCognitoChallenged> {
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
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
    }),
  );

  assertNonNullable(client.UserPoolClient?.ClientId);

  const clientId = client.UserPoolClient.ClientId;

  await cognito.adminCreateUser(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: "alice",
      TemporaryPassword: temporaryPassword,
    }),
  );

  const challenged = await cognito.initiateAuth(
    new InitiateAuthCommand({
      ClientId: clientId,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: "alice", PASSWORD: temporaryPassword },
    }),
  );

  assertNonNullable(challenged.Session);

  return { cognito, userPoolId, clientId, session: challenged.Session };
}

function respond(
  clientId: string,
  session: string,
): RespondToAuthChallengeCommand {
  return new RespondToAuthChallengeCommand({
    ClientId: clientId,
    ChallengeName: "NEW_PASSWORD_REQUIRED",
    Session: session,
    ChallengeResponses: { USERNAME: "alice", NEW_PASSWORD: newPassword },
  });
}

describe("sim Cognito RespondToAuthChallenge", () => {
  it("completes the challenge and answers with tokens", async () => {
    // Given a user challenged for a new password.
    const { cognito, clientId, session } = await simCognitoChallenged();

    // When it answers with one.
    const signedIn = await cognito.respondToAuthChallenge(
      respond(clientId, session),
    );

    // Then it is signed in, without the pool ever having been named.
    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
    assertNonNullable(signedIn.AuthenticationResult.RefreshToken);
    assertIdentical(signedIn.AuthenticationResult.TokenType, "Bearer");
  });

  it("leaves the user signing in with the new password", async () => {
    // Given a user that answered the challenge.
    const { cognito, clientId, session } = await simCognitoChallenged();

    await cognito.respondToAuthChallenge(respond(clientId, session));

    // When it signs in again with the password it chose.
    const signedIn = await cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: clientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: newPassword },
      }),
    );

    // Then it gets tokens rather than the challenge again.
    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
  });

  it("refuses a user disabled since the challenge was issued", async () => {
    // Given a challenged user that has been disabled in the meantime.
    const { cognito, userPoolId, clientId, session } =
      await simCognitoChallenged();

    await cognito.adminDisableUser(
      new AdminDisableUserCommand({
        UserPoolId: userPoolId,
        Username: "alice",
      }),
    );

    // When it answers the challenge.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.respondToAuthChallenge(respond(clientId, session));
    });

    // Then it is refused, and the password it asked for is not set: a
    // disabled user cannot finish a sign-in any more than it can start one.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "User is disabled");
  });

  it("refuses a session that has already been used", async () => {
    // Given a user that answered the challenge.
    const { cognito, clientId, session } = await simCognitoChallenged();

    await cognito.respondToAuthChallenge(respond(clientId, session));

    // When the same session is answered again.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.respondToAuthChallenge(respond(clientId, session));
    });

    // Then it is refused: a session is single use.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Invalid session for the user");
  });

  it("refuses a challenge this simulation does not issue", async () => {
    // Given a user challenged for a new password.
    const { cognito, clientId, session } = await simCognitoChallenged();

    // When an MFA challenge is answered instead.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.respondToAuthChallenge(
        new RespondToAuthChallengeCommand({
          ClientId: clientId,
          ChallengeName: "SMS_MFA",
          Session: session,
          ChallengeResponses: { USERNAME: "alice", SMS_MFA_CODE: "123456" },
        }),
      );
    });

    // Then it is refused rather than answered as the one challenge that is
    // simulated.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "is not simulated");
  });

  it("refuses a response carrying an input this simulation cannot honour", async () => {
    // Given a user challenged for a new password.
    const { cognito, clientId, session } = await simCognitoChallenged();

    // When the response carries data for a Lambda trigger.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.respondToAuthChallenge(
        new RespondToAuthChallengeCommand({
          ClientId: clientId,
          ChallengeName: "NEW_PASSWORD_REQUIRED",
          Session: session,
          ChallengeResponses: { USERNAME: "alice", NEW_PASSWORD: newPassword },
          ClientMetadata: { tenant: "acme" },
        }),
      );
    });

    // Then it is refused rather than answered as if nothing had been sent.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "ClientMetadata is not simulated");
  });
});
