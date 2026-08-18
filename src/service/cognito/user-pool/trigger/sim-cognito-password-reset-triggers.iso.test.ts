import {
  ConfirmForgotPasswordCommand,
  ForgotPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  confirmTriggerSignUp,
  makeTriggerPool,
  signUpTriggerUser,
  triggerFunctionArn,
  triggerUsername,
  type SimCognitoTriggerPool,
} from "../../../../../test/cognito/trigger-fixture.js";
import { recordingTriggerHandler } from "../../../../../test/cognito/trigger-handler-fixture.js";

const newPassword = "Ev3nBetter!";

/**
 * The parts of a `CustomMessage` event a handler here reads.
 */
interface CustomMessageEvent {
  readonly request: { readonly codeParameter: string };
}

/**
 * Write a reset message of the handler's own, with the code placeholder where
 * the code belongs.
 */
function writingHandler(event: unknown): unknown {
  const { request } = event as CustomMessageEvent;

  return {
    ...(event as object),
    response: {
      emailSubject: "Reset your Acme password",
      emailMessage: `Your Acme reset code is ${request.codeParameter}`,
    },
  };
}

function codeIn(pool: SimCognitoTriggerPool): string {
  const code = pool.cognito
    .userPool(pool.userPoolId)
    .confirmationCode(triggerUsername);

  assertNonNullable(code);

  return code;
}

/**
 * Sign the fixture's user up, confirm it, and ask to reset its password.
 */
async function askToReset(pool: SimCognitoTriggerPool): Promise<void> {
  await signUpTriggerUser(pool);
  await confirmTriggerSignUp(pool);
  await pool.cognito.forgotPassword(
    new ForgotPasswordCommand({
      ClientId: pool.clientId,
      Username: triggerUsername,
    }),
  );
}

describe("sim Cognito password reset triggers", () => {
  it("writes the reset message from the CustomMessage handler", async () => {
    // Given a pool whose CustomMessage trigger writes its own wording.
    const pool = await makeTriggerPool({
      triggers: { CustomMessage: triggerFunctionArn },
      autoVerifiedAttributes: ["email"],
      handler: writingHandler,
    });

    // When a user asks to reset its password.
    await askToReset(pool);

    // Then the pool recorded the handler's wording, carrying the reset code.
    const message = pool.cognito
      .userPool(pool.userPoolId)
      .sentMessages()
      .at(-1);

    assertNonNullable(message);
    assertIdentical(message.occasion, "ForgotPassword");
    assertIdentical(message.subject, "Reset your Acme password");
    assertStringIncludes(message.body, codeIn(pool));
  });

  it("tells the CustomMessage handler a reset from a sign-up", async () => {
    // Given a pool whose CustomMessage trigger records what it is given.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: { CustomMessage: triggerFunctionArn },
      autoVerifiedAttributes: ["email"],
      handler: recordingTriggerHandler(events),
    });

    // When a user signs up, confirms and then asks to reset its password.
    await askToReset(pool);

    // Then the reset carries the source real Cognito gives it, which is what a
    // handler customising one message and not another branches on.
    assertObjectMatches(events.at(-1), {
      userPoolId: pool.userPoolId,
      userName: triggerUsername,
      triggerSource: "CustomMessage_ForgotPassword",
      callerContext: { clientId: pool.clientId },
    });
  });

  it("runs PostConfirmation once the reset is confirmed", async () => {
    // Given a pool whose PostConfirmation trigger records what it is given.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: { PostConfirmation: triggerFunctionArn },
      autoVerifiedAttributes: ["email"],
      handler: recordingTriggerHandler(events),
    });

    await askToReset(pool);

    // When the user answers with the code and a password of its own.
    await pool.cognito.confirmForgotPassword(
      new ConfirmForgotPasswordCommand({
        ClientId: pool.clientId,
        Username: triggerUsername,
        ConfirmationCode: codeIn(pool),
        Password: newPassword,
        ClientMetadata: { source: "web" },
      }),
    );

    // Then the trigger ran again, under the source of its own real Cognito
    // gives a reset, so a handler can tell it from the sign-up it also saw.
    assertArrayLength(events, 2);
    assertObjectMatches(events.at(-1), {
      userPoolId: pool.userPoolId,
      userName: triggerUsername,
      triggerSource: "PostConfirmation_ConfirmForgotPassword",
      callerContext: { clientId: pool.clientId },
      request: { clientMetadata: { source: "web" } },
      response: {},
    });
  });
});
