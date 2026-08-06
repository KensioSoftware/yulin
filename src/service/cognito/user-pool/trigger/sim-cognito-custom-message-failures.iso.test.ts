import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  makeTriggerPool,
  signUpTriggerUser,
  triggerFunctionArn,
  type SimCognitoTriggerPool,
} from "../../../../../test/cognito/trigger-fixture.js";
import type { SimLambdaHandler } from "../../../lambda/function/sim-lambda-handler.type.js";

/**
 * A pool that verifies an email address and runs a CustomMessage handler that
 * answers badly.
 */
async function makeMessagePool(
  handler: SimLambdaHandler,
): Promise<SimCognitoTriggerPool> {
  return await makeTriggerPool({
    triggers: { CustomMessage: triggerFunctionArn },
    autoVerifiedAttributes: ["email"],
    handler,
  });
}

async function refusedSignUp(pool: SimCognitoTriggerPool): Promise<Error> {
  return await assertThrowsErrorAsync(async () => signUpTriggerUser(pool));
}

describe("sim Cognito CustomMessage trigger failures", () => {
  it("fails the sign-up with the message the handler threw", async () => {
    // Given a pool whose CustomMessage handler cannot write the message.
    const pool = await makeMessagePool(() => {
      throw new Error("The wording service is down");
    });

    // When a user signs itself up.
    const error = await refusedSignUp(pool);

    // Then the request failed on the trigger, carrying the handler's own
    // words.
    assertIdentical(error.name, "UserLambdaValidationException");
    assertStringIncludes(
      error.message,
      "CustomMessage failed with error The wording service is down.",
    );

    // And the pool recorded no message: the trigger runs before the message
    // is recorded, so there is no wording to fall back to.
    assertArrayEquals(
      pool.cognito.userPool(pool.userPoolId).sentMessages(),
      [],
    );
  });

  it("refuses a response that is not an object", async () => {
    // Given a handler that answers with a response of the wrong shape.
    const pool = await makeMessagePool((event: unknown) => ({
      ...(event as object),
      response: "Welcome to Acme",
    }));

    // When a user signs itself up.
    const error = await refusedSignUp(pool);

    // Then it is refused rather than the string being read as a message.
    assertIdentical(error.name, "InvalidLambdaResponseException");
    assertStringIncludes(error.message, "a response that is not an object");
  });

  it("refuses a message that is not a string", async () => {
    // Given a handler that wrote a number where the message belongs.
    const pool = await makeMessagePool((event: unknown) => ({
      ...(event as object),
      response: { emailMessage: 42 },
    }));

    // When a user signs itself up.
    const error = await refusedSignUp(pool);

    // Then it is refused, naming the field and what it was given, rather than
    // recording a message the pool could never have sent.
    assertIdentical(error.name, "InvalidLambdaResponseException");
    assertStringIncludes(
      error.message,
      "whose emailMessage is a number rather than a string",
    );
  });

  it("keeps the pool's wording where the handler dropped the response", async () => {
    // Given a handler that answers with the request half alone, which real
    // Cognito accepts.
    const pool = await makeMessagePool((event: unknown) => ({
      request: (event as { request: object }).request,
    }));

    // When a user signs itself up.
    await signUpTriggerUser(pool);

    // Then the pool's own wording is what was recorded: a handler that wrote
    // nothing has not changed the message.
    const [message] = pool.cognito.userPool(pool.userPoolId).sentMessages();
    assertNonNullable(message);
    assertIdentical(message.subject, "Your verification code");
  });

  it("fails a sign-up whose trigger function cannot be invoked", async () => {
    // Given a pool whose trigger function was never granted the invoke
    // permission a CDK addTrigger emits.
    const pool = await makeTriggerPool({
      triggers: { CustomMessage: triggerFunctionArn },
      autoVerifiedAttributes: ["email"],
      permitted: false,
    });

    // When a user signs itself up.
    const error = await refusedSignUp(pool);

    // Then the trigger failed for the permission it is missing, naming the
    // pool whose resource policy has to admit Cognito.
    assertIdentical(error.name, "UnexpectedLambdaException");
    assertStringIncludes(error.message, "CustomMessage trigger of user pool");
  });
});
