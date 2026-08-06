import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertFalse,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  confirmTriggerSignUp,
  makeTriggerPool,
  signUpTriggerUser,
  triggerFunctionArn,
  triggerPassword,
} from "../../../../../test/cognito/trigger-fixture.js";
import type { SimCognitoTriggerPool } from "../../../../../test/cognito/trigger-fixture.js";

/**
 * A handler that turns the request down the way a trigger handler does, by
 * throwing.
 */
function refusingHandler(message: string): () => never {
  return () => {
    throw new Error(message);
  };
}

/**
 * How many users the pool holds.
 */
function userCount(pool: SimCognitoTriggerPool): number {
  return pool.cognito.userPool(pool.userPoolId).userCount;
}

describe("sim Cognito sign-up trigger failures", () => {
  it("refuses the sign-up with the message a PreSignUp handler threw", async () => {
    // Given a pool whose PreSignUp trigger turns sign-ups down.
    const pool = await makeTriggerPool({
      triggers: { PreSignUp: triggerFunctionArn },
      handler: refusingHandler("Only example.com may sign up"),
    });

    // When a user tries to sign itself up.
    const error = await assertThrowsErrorAsync(async () =>
      signUpTriggerUser(pool),
    );

    // Then it is refused the way real Cognito refuses it, carrying the
    // handler's own words.
    assertIdentical(error.name, "UserLambdaValidationException");
    assertStringIncludes(
      error.message,
      "PreSignUp failed with error Only example.com may sign up.",
    );

    // And no user was created, because the trigger ran before the pool took
    // one.
    assertIdentical(userCount(pool), 0);
  });

  it("creates no user when a PreSignUp handler refuses an AdminCreateUser", async () => {
    // Given a pool whose PreSignUp trigger turns every new user down.
    const pool = await makeTriggerPool({
      triggers: { PreSignUp: triggerFunctionArn },
      handler: refusingHandler("Nobody new today"),
    });

    // When an admin tries to create one.
    const error = await assertThrowsErrorAsync(async () =>
      pool.cognito.adminCreateUser(
        new AdminCreateUserCommand({
          UserPoolId: pool.userPoolId,
          Username: "alice",
        }),
      ),
    );

    // Then the creation was refused and the pool is still empty.
    assertIdentical(error.name, "UserLambdaValidationException");
    assertStringIncludes(error.message, "PreSignUp failed with error");
    assertIdentical(userCount(pool), 0);
  });

  it("refuses a sign-up whose PreSignUp trigger cannot be invoked", async () => {
    // Given a pool whose trigger function was never granted the invoke
    // permission a CDK addTrigger emits.
    const pool = await makeTriggerPool({
      triggers: { PreSignUp: triggerFunctionArn },
      permitted: false,
    });

    // When a user tries to sign itself up.
    const error = await assertThrowsErrorAsync(async () =>
      signUpTriggerUser(pool),
    );

    // Then the missing permission is reported rather than the sign-up going
    // ahead as though the pool had no trigger.
    assertIdentical(error.name, "UnexpectedLambdaException");
    assertStringIncludes(error.message, "cognito-idp.amazonaws.com");
    assertIdentical(userCount(pool), 0);
  });

  it("refuses a sign-up whose PreSignUp handler verified an attribute it has not got", async () => {
    // Given a pool whose PreSignUp trigger vouches for a phone number.
    const pool = await makeTriggerPool({
      triggers: { PreSignUp: triggerFunctionArn },
      handler: (event: { response: Record<string, boolean> }) => {
        event.response["autoVerifyPhone"] = true;

        return event;
      },
    });

    // When a user signs up with an email and no phone number.
    const error = await assertThrowsErrorAsync(async () =>
      signUpTriggerUser(pool),
    );

    // Then the sign-up is refused, as real Cognito refuses one whose
    // auto-verified attribute is not there, rather than creating a user with
    // the flag quietly unset.
    assertIdentical(error.name, "InvalidParameterException");
    assertStringIncludes(error.message, "asked to verify 'phone_number'");
    assertIdentical(userCount(pool), 0);
  });

  it("leaves the user confirmed when PostConfirmation fails", async () => {
    // Given a pool whose PostConfirmation trigger throws.
    const pool = await makeTriggerPool({
      triggers: { PostConfirmation: triggerFunctionArn },
      handler: refusingHandler("The user table is unreachable"),
    });

    await signUpTriggerUser(pool);

    // When the user confirms.
    const error = await assertThrowsErrorAsync(async () =>
      confirmTriggerSignUp(pool),
    );

    // Then the request failed on the trigger.
    assertIdentical(error.name, "UserLambdaValidationException");
    assertStringIncludes(error.message, "PostConfirmation failed with error");

    // And the confirmation that had already happened stands, as it does on
    // real Cognito: the trigger runs after it, not as part of it.
    const read = await pool.cognito.adminGetUser(
      new AdminGetUserCommand({
        UserPoolId: pool.userPoolId,
        Username: "alice",
      }),
    );

    assertIdentical(read.UserStatus, "CONFIRMED");
  });

  it("refuses a PreSignUp handler that returned something else", async () => {
    // Given a PreSignUp handler that answers with a string.
    const pool = await makeTriggerPool({
      triggers: { PreSignUp: triggerFunctionArn },
      handler: () => "ok",
    });

    // When a user signs itself up.
    const error = await assertThrowsErrorAsync(async () =>
      signUpTriggerUser(pool),
    );

    // Then the response is refused, because Cognito reads the returned event
    // rather than the one it sent.
    assertIdentical(error.name, "InvalidLambdaResponseException");
    assertStringIncludes(error.message, "rather than the event it was given");
    assertIdentical(userCount(pool), 0);
  });

  it("reads a dropped response as a handler asking for nothing", async () => {
    // Given a PreSignUp handler that hands back the request half alone, which
    // is an event without the response Cognito sent.
    const pool = await makeTriggerPool({
      triggers: { PreSignUp: triggerFunctionArn },
      handler: (event: { request: object }) => ({ request: event.request }),
    });

    // When a user signs itself up.
    const signedUp = await signUpTriggerUser(pool);

    // Then the sign-up went ahead unconfirmed: a handler with no response has
    // asked for none of the three things it could have.
    assertFalse(signedUp.UserConfirmed);
    assertIdentical(userCount(pool), 1);
  });

  it("refuses ValidationData that names nothing", async () => {
    // Given a pool with a PreSignUp trigger.
    const pool = await makeTriggerPool({
      triggers: { PreSignUp: triggerFunctionArn },
    });

    // When a sign-up carries a validation data entry with no Name, which the
    // SDK's own types would not let a caller build.
    const error = await assertThrowsErrorAsync(async () =>
      pool.cognito.signUp({
        input: {
          ClientId: pool.clientId,
          Username: "alice",
          Password: triggerPassword,
          ValidationData: [{ Value: "acme" }],
        },
      }),
    );

    // Then it is refused: a handler reads validation data by name, so an entry
    // without one reaches nothing.
    assertIdentical(error.name, "InvalidParameterException");
    assertStringIncludes(error.message, "SignUp ValidationData needs a Name");
  });
});
