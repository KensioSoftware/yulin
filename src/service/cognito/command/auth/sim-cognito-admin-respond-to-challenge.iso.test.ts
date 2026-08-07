import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimCognitoInvalidPasswordException,
  SimCognitoNotAuthorizedException,
} from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

const temporaryPassword = "Temp0rary!";
const newPassword = "Sup3rSecret!";

interface SimCognitoChallenged {
  readonly simAws: SimAws;
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly clientId: string;
  readonly session: string;
}

/**
 * A user an admin created, one sign-in in, waiting on the challenge.
 */
async function simCognitoChallenged(): Promise<SimCognitoChallenged> {
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
      ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
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

  const challenged = await cognito.adminInitiateAuth(
    new AdminInitiateAuthCommand({
      UserPoolId: userPoolId,
      ClientId: clientId,
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: "alice", PASSWORD: temporaryPassword },
    }),
  );

  assertNonNullable(challenged.Session);

  return {
    simAws,
    cognito,
    userPoolId,
    clientId,
    session: challenged.Session,
  };
}

function respond(
  userPoolId: string,
  clientId: string,
  session: string,
  password: string,
): AdminRespondToAuthChallengeCommand {
  return new AdminRespondToAuthChallengeCommand({
    UserPoolId: userPoolId,
    ClientId: clientId,
    ChallengeName: "NEW_PASSWORD_REQUIRED",
    Session: session,
    ChallengeResponses: { USERNAME: "alice", NEW_PASSWORD: password },
  });
}

describe("sim Cognito AdminRespondToAuthChallenge", () => {
  it("completes the challenge and answers with tokens", async () => {
    // Given a user waiting on the new password challenge.
    const { cognito, userPoolId, clientId, session } =
      await simCognitoChallenged();

    // When it answers with a new password.
    const signedIn = await cognito.adminRespondToAuthChallenge(
      respond(userPoolId, clientId, session, newPassword),
    );

    // Then it gets tokens, and the user is confirmed from then on.
    assertNonNullable(signedIn.AuthenticationResult?.IdToken);

    const read = await cognito.adminGetUser(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    assertIdentical(read.UserStatus, "CONFIRMED");
  });

  it("leaves the user signing in with the new password", async () => {
    // Given a user that answered the challenge.
    const { cognito, userPoolId, clientId, session } =
      await simCognitoChallenged();

    await cognito.adminRespondToAuthChallenge(
      respond(userPoolId, clientId, session, newPassword),
    );

    // When it signs in again with that password.
    const signedIn = await cognito.adminInitiateAuth(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: newPassword },
      }),
    );

    // Then it gets tokens without a challenge this time.
    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
  });

  it("refuses a session it did not issue", async () => {
    // Given a user waiting on the challenge.
    const { cognito, userPoolId, clientId } = await simCognitoChallenged();

    // When a made up session answers it.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminRespondToAuthChallenge(
        respond(userPoolId, clientId, "not-a-session", newPassword),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Invalid session");
  });

  it("refuses a response carrying no session", async () => {
    // Given a user waiting on the challenge.
    const { cognito, userPoolId, clientId } = await simCognitoChallenged();

    // When it answers without the session it was given.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminRespondToAuthChallenge(
        new AdminRespondToAuthChallengeCommand({
          UserPoolId: userPoolId,
          ClientId: clientId,
          ChallengeName: "NEW_PASSWORD_REQUIRED",
          ChallengeResponses: {
            USERNAME: "alice",
            NEW_PASSWORD: newPassword,
          },
        }),
      );
    });

    // Then it is refused: the session is what ties the response to the
    // challenge that asked for it.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
  });

  it("refuses a session that has already been used", async () => {
    // Given a challenge that has been answered.
    const { cognito, userPoolId, clientId, session } =
      await simCognitoChallenged();

    await cognito.adminRespondToAuthChallenge(
      respond(userPoolId, clientId, session, newPassword),
    );

    // When the same session is replayed.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminRespondToAuthChallenge(
        respond(userPoolId, clientId, session, "An0therPassword!"),
      );
    });

    // Then it is refused: a session is single use.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
  });

  it("refuses a session that has run out", async () => {
    // Given a challenge issued four minutes of simulated time ago.
    const { simAws, cognito, userPoolId, clientId, session } =
      await simCognitoChallenged();

    await simAws.clock().advanceBy({ minutes: 4 });

    // When it is answered.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminRespondToAuthChallenge(
        respond(userPoolId, clientId, session, newPassword),
      );
    });

    // Then it is refused, as a session lasts the three minutes real Cognito
    // gives it.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Invalid session");
  });

  it("keeps a session that is still live when another is issued", async () => {
    // Given a user challenged twice, so two sessions are outstanding.
    const { cognito, userPoolId, clientId, session } =
      await simCognitoChallenged();

    await cognito.adminInitiateAuth(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: temporaryPassword },
      }),
    );

    // When the first one is answered.
    const signedIn = await cognito.adminRespondToAuthChallenge(
      respond(userPoolId, clientId, session, newPassword),
    );

    // Then it still works: issuing a session does not cancel one that has not
    // run out.
    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
  });

  it("drops a session nobody answered once it has run out", async () => {
    // Given a challenge that was left for four minutes of simulated time.
    const { simAws, cognito, userPoolId, clientId, session } =
      await simCognitoChallenged();

    await simAws.clock().advanceBy({ minutes: 4 });

    // When the user starts again and answers the new challenge.
    const challenged = await cognito.adminInitiateAuth(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: temporaryPassword },
      }),
    );

    assertNonNullable(challenged.Session);

    const signedIn = await cognito.adminRespondToAuthChallenge(
      respond(userPoolId, clientId, challenged.Session, newPassword),
    );

    // Then that works, and the session left behind is gone rather than kept
    // for a simulation that runs for a long time.
    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);

    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminRespondToAuthChallenge(
        respond(userPoolId, clientId, session, newPassword),
      );
    });

    assertInstanceOf(error, SimCognitoNotAuthorizedException);
  });

  it("refuses a new password the pool's policy does not allow", async () => {
    // Given a user waiting on the challenge.
    const { cognito, userPoolId, clientId, session } =
      await simCognitoChallenged();

    // When it answers with a password with no symbol in it.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminRespondToAuthChallenge(
        respond(userPoolId, clientId, session, "Password1"),
      );
    });

    // Then it is refused, saying which rule it broke.
    assertInstanceOf(error, SimCognitoInvalidPasswordException);
    assertStringIncludes(error.message, "must have symbol characters");
  });

  it("refuses a challenge this simulation does not issue", async () => {
    // Given a user waiting on the challenge.
    const { cognito, userPoolId, clientId, session } =
      await simCognitoChallenged();

    // When an SMS challenge is answered instead.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminRespondToAuthChallenge(
        new AdminRespondToAuthChallengeCommand({
          UserPoolId: userPoolId,
          ClientId: clientId,
          ChallengeName: "SMS_MFA",
          Session: session,
          ChallengeResponses: { USERNAME: "alice", SMS_MFA_CODE: "123456" },
        }),
      );
    });

    // Then it is refused rather than treated as the one challenge simulated.
    assertStringIncludes(error.message, "is not simulated");
  });
});
