import {
  AdminCreateUserCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DescribeUserPoolClientCommand,
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

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimCognitoInvalidParameterException,
  SimCognitoNotAuthorizedException,
} from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

const temporaryPassword = "Temp0rary!";
const newPassword = "Sup3rSecret!";

interface SimCognitoChallengedUser {
  readonly simAws: SimAws;
  readonly cognito: SimCognitoIdentityProvider;
  readonly clientId: string;
  readonly session: string;
}

/**
 * A user holding a temporary password, answered with the new password
 * challenge and the session that challenge carries.
 */
async function simCognitoChallenged(
  authSessionValidity?: number,
): Promise<SimCognitoChallengedUser> {
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
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
      ...(authSessionValidity !== undefined && {
        AuthSessionValidity: authSessionValidity,
      }),
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

  return { simAws, cognito, clientId, session: challenged.Session };
}

/**
 * Answer the new password challenge, which is what the session is for.
 */
async function respond(
  cognito: SimCognitoIdentityProvider,
  clientId: string,
  session: string,
): Promise<unknown> {
  return await cognito.respondToAuthChallenge(
    new RespondToAuthChallengeCommand({
      ClientId: clientId,
      ChallengeName: "NEW_PASSWORD_REQUIRED",
      Session: session,
      ChallengeResponses: { USERNAME: "alice", NEW_PASSWORD: newPassword },
    }),
  );
}

describe("sim Cognito app client AuthSessionValidity", () => {
  it("gives a client that asked for none three minutes", async () => {
    // Given a user challenged through an app client that named no session
    // validity.
    const { simAws, cognito, clientId, session } = await simCognitoChallenged();

    // When it answers three minutes later.
    await simAws.clock().advanceBy({ minutes: 3 });

    const error = await assertThrowsErrorAsync(async () => {
      await respond(cognito, clientId, session);
    });

    // Then the session has run out, which is the default real Cognito applies.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Invalid session for the user");
  });

  it("keeps a session open for the minutes the client asked for", async () => {
    // Given a user challenged through a client with a ten minute validity.
    const { simAws, cognito, clientId, session } =
      await simCognitoChallenged(10);

    // When it answers after the three minutes a client would otherwise get.
    await simAws.clock().advanceBy({ minutes: 9 });

    const answered = await respond(cognito, clientId, session);

    // Then the challenge is completed, because the client said longer.
    assertNonNullable(answered);
  });

  it("runs a longer session out once its own minutes are up", async () => {
    // Given a user challenged through a client with a ten minute validity.
    const { simAws, cognito, clientId, session } =
      await simCognitoChallenged(10);

    // When it answers eleven minutes later.
    await simAws.clock().advanceBy({ minutes: 11 });

    const error = await assertThrowsErrorAsync(async () => {
      await respond(cognito, clientId, session);
    });

    // Then the session has run out, as a shorter one would have.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
  });

  it("reports the validity on the client, defaulted to three", async () => {
    // Given a pool with one client that asked for a validity and one that did
    // not.
    const cognito = new SimAws().cognitoIdentityProvider();
    const pool = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );

    assertNonNullable(pool.UserPool?.Id);

    const userPoolId = pool.UserPool.Id;
    const asked = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "long",
        AuthSessionValidity: 15,
      }),
    );
    const quiet = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
      }),
    );

    assertNonNullable(quiet.UserPoolClient?.ClientId);

    // When each is described.
    const described = await cognito.describeUserPoolClient(
      new DescribeUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: quiet.UserPoolClient.ClientId,
      }),
    );

    // Then the one that asked reports what it asked for, and the one that did
    // not reports the three minutes Cognito gave it.
    assertIdentical(asked.UserPoolClient?.AuthSessionValidity, 15);
    assertIdentical(described.UserPoolClient?.AuthSessionValidity, 3);
  });

  it("refuses a validity outside the range Cognito allows", async () => {
    // Given a pool.
    const cognito = new SimAws().cognitoIdentityProvider();
    const pool = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );

    assertNonNullable(pool.UserPool?.Id);

    // When a client asks for two minutes, or for a fraction of one.
    const short = await assertThrowsErrorAsync(async () => {
      await cognito.createUserPoolClient(
        new CreateUserPoolClientCommand({
          UserPoolId: pool.UserPool?.Id,
          ClientName: "web",
          AuthSessionValidity: 2,
        }),
      );
    });
    const fractional = await assertThrowsErrorAsync(async () => {
      await cognito.createUserPoolClient(
        new CreateUserPoolClientCommand({
          UserPoolId: pool.UserPool?.Id,
          ClientName: "web",
          AuthSessionValidity: 3.5,
        }),
      );
    });

    // Then both are refused, as real Cognito refuses them.
    assertInstanceOf(short, SimCognitoInvalidParameterException);
    assertStringIncludes(short.message, "between 3 and 15 minutes");
    assertInstanceOf(fractional, SimCognitoInvalidParameterException);
    assertStringIncludes(fractional.message, "whole number of minutes");
  });
});
