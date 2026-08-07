import {
  AdminGetUserCommand,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { DeleteFunctionCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  makeTriggerPool,
  makeTriggerUser,
  triggerFunctionArn,
  triggerFunctionName,
  triggerPassword,
} from "../../../../../test/cognito/trigger-fixture.js";
import type { SimCognitoTriggerPool } from "../../../../../test/cognito/trigger-fixture.js";

const newPassword = "Rep1acementPassw0rd!";

function signIn(clientId: string): InitiateAuthCommand {
  return new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: triggerPassword },
  });
}

/**
 * Start the sign-in a user with a temporary password gets, which is the
 * `NEW_PASSWORD_REQUIRED` challenge and the session to answer it with.
 */
async function challengeSession(pool: SimCognitoTriggerPool): Promise<string> {
  const challenged = await pool.cognito.adminInitiateAuth(
    new AdminInitiateAuthCommand({
      UserPoolId: pool.userPoolId,
      ClientId: pool.clientId,
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: "alice", PASSWORD: "Temp0rary!" },
    }),
  );

  assertIdentical(challenged.ChallengeName, "NEW_PASSWORD_REQUIRED");
  assertNonNullable(challenged.Session);

  return challenged.Session;
}

describe("sim Cognito user pool trigger failures", () => {
  it("refuses the sign-in with the message a PreAuthentication handler threw", async () => {
    // Given a pool whose PreAuthentication trigger turns the sign-in down.
    const pool = await makeTriggerPool({
      triggers: { PreAuthentication: triggerFunctionArn },
      handler: () => {
        throw new Error("Sign-in is closed for maintenance");
      },
    });

    await makeTriggerUser(pool);

    // When the user signs in with the right password.
    const error = await assertThrowsErrorAsync(async () =>
      pool.cognito.initiateAuth(signIn(pool.clientId)),
    );

    // Then the sign-in was refused as real Cognito refuses it, carrying the
    // handler's own words so the caller knows why.
    assertIdentical(error.name, "UserLambdaValidationException");
    assertStringIncludes(
      error.message,
      "PreAuthentication failed with error Sign-in is closed for maintenance.",
    );
  });

  it("fails a trigger the pool has no permission to invoke", async () => {
    // Given a pool whose trigger function was never granted the invoke
    // permission a CDK addTrigger emits.
    const pool = await makeTriggerPool({
      triggers: { PreAuthentication: triggerFunctionArn },
      permitted: false,
    });

    await makeTriggerUser(pool);

    // When a user signs in.
    const error = await assertThrowsErrorAsync(async () =>
      pool.cognito.initiateAuth(signIn(pool.clientId)),
    );

    // Then the trigger failed for the permission it is missing, naming the
    // principal and the pool the resource policy has to admit.
    assertIdentical(error.name, "UnexpectedLambdaException");
    assertStringIncludes(error.message, "cognito-idp.amazonaws.com");
    assertStringIncludes(error.message, pool.userPoolArn);
    assertStringIncludes(error.message, "AddPermission");
  });

  it("fails a trigger whose function is not there", async () => {
    // Given a pool whose trigger function has since been deleted, which a pool
    // only finds out about when the trigger fires.
    const pool = await makeTriggerPool({
      triggers: { PreAuthentication: triggerFunctionArn },
    });

    await makeTriggerUser(pool);
    await pool.simAws
      .lambda()
      .deleteFunction(
        new DeleteFunctionCommand({ FunctionName: triggerFunctionName }),
      );

    // When a user signs in.
    const error = await assertThrowsErrorAsync(async () =>
      pool.cognito.initiateAuth(signIn(pool.clientId)),
    );

    // Then the missing function is reported rather than the sign-in going
    // ahead as though the pool had no trigger.
    assertIdentical(error.name, "UnexpectedLambdaException");
    assertStringIncludes(error.message, "is not a simulated Lambda function");
  });

  it("refuses a handler that returned something other than the event", async () => {
    // Given a trigger handler that answers with a string.
    const pool = await makeTriggerPool({
      triggers: { PreAuthentication: triggerFunctionArn },
      handler: () => "ok",
    });

    await makeTriggerUser(pool);

    // When a user signs in.
    const error = await assertThrowsErrorAsync(async () =>
      pool.cognito.initiateAuth(signIn(pool.clientId)),
    );

    // Then the response is refused, because Cognito reads the returned event
    // rather than the one it sent.
    assertIdentical(error.name, "InvalidLambdaResponseException");
    assertStringIncludes(error.message, "rather than the event it was given");
  });

  it("carries what a handler threw when it was not an Error", async () => {
    // Given a trigger handler that throws a string rather than an Error, which
    // JavaScript allows and a hand-written handler sometimes does.
    const pool = await makeTriggerPool({
      triggers: { PreAuthentication: triggerFunctionArn },
      handler: () => {
        // oxlint-disable-next-line typescript/only-throw-error -- a handler may throw anything, and that is the case under test
        throw "Sign-in is closed";
      },
    });

    await makeTriggerUser(pool);

    // When a user signs in.
    const error = await assertThrowsErrorAsync(async () =>
      pool.cognito.initiateAuth(signIn(pool.clientId)),
    );

    // Then what it threw still reaches the caller, rather than the refusal
    // saying nothing about why.
    assertIdentical(error.name, "UserLambdaValidationException");
    assertStringIncludes(
      error.message,
      "PreAuthentication failed with error Sign-in is closed.",
    );
  });

  it("refuses a handler that returned an array", async () => {
    // Given a trigger handler that answers with a list.
    const pool = await makeTriggerPool({
      triggers: { PreAuthentication: triggerFunctionArn },
      handler: () => [],
    });

    await makeTriggerUser(pool);

    // When a user signs in.
    const error = await assertThrowsErrorAsync(async () =>
      pool.cognito.initiateAuth(signIn(pool.clientId)),
    );

    // Then it is refused, and named for what it was: an array is an object,
    // and it is still not the event.
    assertIdentical(error.name, "InvalidLambdaResponseException");
    assertStringIncludes(error.message, "returned an array rather than");
  });

  it("refuses a handler that returned an object without the request", async () => {
    // Given a trigger handler that answers with the response half alone.
    const pool = await makeTriggerPool({
      triggers: { PreAuthentication: triggerFunctionArn },
      handler: () => ({ response: {} }),
    });

    await makeTriggerUser(pool);

    // When a user signs in.
    const error = await assertThrowsErrorAsync(async () =>
      pool.cognito.initiateAuth(signIn(pool.clientId)),
    );

    // Then it is refused too: an event without its request is a different
    // event, not the one the handler was given.
    assertIdentical(error.name, "InvalidLambdaResponseException");
    assertStringIncludes(error.message, "without a request");
  });

  it("does not undo the sign-in when PostAuthentication fails", async () => {
    // Given a pool whose PostAuthentication trigger throws, and a user that
    // has to replace its temporary password before it can sign in.
    const pool = await makeTriggerPool({
      triggers: { PostAuthentication: triggerFunctionArn },
      handler: () => {
        throw new Error("The audit log is unreachable");
      },
    });

    await makeTriggerUser(pool, false);

    const session = await challengeSession(pool);

    // When the user answers the challenge, which is where its sign-in
    // completes.
    const error = await assertThrowsErrorAsync(async () =>
      pool.cognito.adminRespondToAuthChallenge(
        new AdminRespondToAuthChallengeCommand({
          UserPoolId: pool.userPoolId,
          ClientId: pool.clientId,
          ChallengeName: "NEW_PASSWORD_REQUIRED",
          ChallengeResponses: {
            USERNAME: "alice",
            NEW_PASSWORD: newPassword,
          },
          Session: session,
        }),
      ),
    );

    // Then the request failed on the trigger.
    assertIdentical(error.name, "UserLambdaValidationException");
    assertStringIncludes(error.message, "PostAuthentication failed with error");

    // And the sign-in that had already happened stands: the user took its new
    // password and is confirmed, rather than being left with the temporary one.
    const described = await pool.cognito.adminGetUser(
      new AdminGetUserCommand({
        UserPoolId: pool.userPoolId,
        Username: "alice",
      }),
    );
    assertIdentical(described.UserStatus, "CONFIRMED");
  });
});
