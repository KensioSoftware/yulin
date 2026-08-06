import {
  AdminCreateUserCommand,
  ResendConfirmationCodeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertIdentical,
  assertTrue,
  assertNonNullable,
  assertObjectMatches,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  makeTriggerPool,
  signUpTriggerUser,
  triggerFunctionArn,
  triggerUsername,
  type SimCognitoTriggerPool,
} from "../../../../../test/cognito/trigger-fixture.js";
import { recordingTriggerHandler } from "../../../../../test/cognito/trigger-handler-fixture.js";
import type { SimCognitoSentMessage } from "../message/sim-cognito-sent-message.js";

/**
 * The parts of a `CustomMessage` event a handler here reads.
 */
interface CustomMessageEvent {
  readonly request: {
    readonly codeParameter: string;
    readonly usernameParameter?: string | undefined;
  };
}

/**
 * Write a message of the handler's own, with the code placeholder in it where
 * the code belongs.
 */
function writingHandler(event: unknown): unknown {
  const { request } = event as CustomMessageEvent;

  return {
    ...(event as object),
    response: {
      emailSubject: "Welcome to Acme",
      emailMessage: `Your Acme code is ${request.codeParameter}`,
      smsMessage: `Acme: ${request.codeParameter}`,
    },
  };
}

function sentBy(pool: SimCognitoTriggerPool): readonly SimCognitoSentMessage[] {
  return pool.cognito.userPool(pool.userPoolId).sentMessages();
}

function codeIn(pool: SimCognitoTriggerPool): string {
  const code = pool.cognito
    .userPool(pool.userPoolId)
    .confirmationCode(triggerUsername);
  assertNonNullable(code);

  return code;
}

/**
 * A pool that verifies an email address and runs a CustomMessage trigger.
 */
async function makeMessagePool(
  handler: (event: unknown) => unknown,
): Promise<SimCognitoTriggerPool> {
  return await makeTriggerPool({
    triggers: { CustomMessage: triggerFunctionArn },
    autoVerifiedAttributes: ["email"],
    handler,
  });
}

describe("sim Cognito CustomMessage trigger", () => {
  it("invokes the handler with the sign-up event", async () => {
    // Given a pool whose CustomMessage trigger records what it is given.
    const events: unknown[] = [];
    const pool = await makeMessagePool(recordingTriggerHandler(events));

    // When a user signs itself up.
    await signUpTriggerUser(pool);

    // Then the handler was given the real event, naming the occasion, the
    // pool, the app client the sign-up came through and the user.
    assertObjectMatches(events[0], {
      version: "1",
      region: pool.simAws.defaultRegionName,
      userPoolId: pool.userPoolId,
      userName: "alice",
      triggerSource: "CustomMessage_SignUp",
      callerContext: { clientId: pool.clientId },
      request: {
        userAttributes: { email: "alice@example.com" },
        // The placeholder rather than the code, as real Cognito passes it: the
        // handler writes it into its message and the code goes in afterwards.
        codeParameter: "{####}",
      },
      response: {},
    });
  });

  it("records the message the handler wrote", async () => {
    // Given a pool whose handler writes a message of its own.
    const pool = await makeMessagePool(writingHandler);

    // When a user signs itself up.
    await signUpTriggerUser(pool);

    // Then the recorded message says what the handler wrote rather than what
    // the pool would have said.
    const [message] = sentBy(pool);
    assertNonNullable(message);
    assertIdentical(message.subject, "Welcome to Acme");

    // And the code parameter the handler wrote into it carries the real code.
    assertIdentical(message.body, `Your Acme code is ${codeIn(pool)}`);
  });

  it("names the occasion a resent code fired on", async () => {
    // Given a signed-up user of a pool with the trigger on it.
    const events: unknown[] = [];
    const pool = await makeMessagePool(recordingTriggerHandler(events));
    await signUpTriggerUser(pool);

    // When the user asks for its code again.
    await pool.cognito.resendConfirmationCode(
      new ResendConfirmationCodeCommand({
        ClientId: pool.clientId,
        Username: "alice",
      }),
    );

    // Then the handler can tell the two occasions apart by their source.
    assertObjectMatches(events[1], {
      triggerSource: "CustomMessage_ResendCode",
    });
  });

  it("names the occasion an invitation fired on", async () => {
    // Given a pool with the trigger on it.
    const events: unknown[] = [];
    const pool = await makeMessagePool(recordingTriggerHandler(events));

    // When an administrator creates a user.
    await pool.cognito.adminCreateUser(
      new AdminCreateUserCommand({
        UserPoolId: pool.userPoolId,
        Username: "alice",
        TemporaryPassword: "Temp0rary!",
        UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
      }),
    );

    // Then the event names the invitation, carries the username placeholder
    // the invitation wording uses, and reports no app client: an admin
    // operation comes through none, and real Cognito says so rather than
    // inventing one.
    assertObjectMatches(events[0], {
      triggerSource: "CustomMessage_AdminCreateUser",
      callerContext: { clientId: "CLIENT_ID_NOT_APPLICABLE" },
      request: { codeParameter: "{####}", usernameParameter: "{username}" },
    });
  });

  it("writes the text message for a user with a phone number", async () => {
    // Given a pool that verifies a phone number and writes its own messages.
    const pool = await makeTriggerPool({
      triggers: { CustomMessage: triggerFunctionArn },
      autoVerifiedAttributes: ["phone_number"],
      handler: writingHandler,
    });

    // When a user with a phone number signs itself up.
    await signUpTriggerUser(pool, {
      UserAttributes: [{ Name: "phone_number", Value: "+447700900123" }],
    });

    // Then the message the handler wrote for SMS is the one recorded, and the
    // subject it wrote for email reaches nothing.
    const [message] = sentBy(pool);
    assertNonNullable(message);
    assertIdentical(message.medium, "SMS");
    assertIdentical(message.body, `Acme: ${codeIn(pool)}`);
    assertUndefined(message.subject);
  });

  it("passes the request's ClientMetadata to the handler", async () => {
    // Given a pool with the trigger on it.
    const events: unknown[] = [];
    const pool = await makeMessagePool(recordingTriggerHandler(events));

    // When the sign-up carries ClientMetadata, which reaches the handler.
    await signUpTriggerUser(pool, { ClientMetadata: { tenant: "acme" } });

    // Then the handler reads it, which is what it is sent for.
    assertObjectMatches(events[0], {
      request: { clientMetadata: { tenant: "acme" } },
    });
  });

  it("keeps the pool's wording where the handler wrote none", async () => {
    // Given a pool whose handler returns the event untouched.
    const pool = await makeMessagePool((event: unknown) => event);

    // When a user signs itself up.
    await signUpTriggerUser(pool);

    // Then the pool's own wording is what was recorded, as it is for a pool
    // with no trigger at all.
    const [message] = sentBy(pool);
    assertNonNullable(message);
    assertIdentical(message.subject, "Your verification code");
    assertIdentical(message.body, `Your verification code is ${codeIn(pool)}`);
  });

  it("sends nothing for a sign-up PreSignUp confirmed itself", async () => {
    // Given a pool whose PreSignUp trigger confirms the user, and whose
    // CustomMessage trigger would write a message if it ran.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: {
        PreSignUp: triggerFunctionArn,
        CustomMessage: triggerFunctionArn,
      },
      autoVerifiedAttributes: ["email"],
      handler: (event: unknown) => {
        events.push(structuredClone(event));
        Object.assign((event as { response: object }).response, {
          autoConfirmUser: true,
        });

        return event;
      },
    });

    // When a user signs itself up.
    const signedUp = await signUpTriggerUser(pool);

    // Then the user is confirmed already, so there is no code to send it and
    // no message was recorded, which is what real Cognito does here.
    assertTrue(signedUp.UserConfirmed);
    assertArrayEquals(sentBy(pool), []);

    // And CustomMessage never fired: only PreSignUp did.
    assertArrayEquals(
      events.map((event) => (event as { triggerSource: string }).triggerSource),
      ["PreSignUp_SignUp"],
    );
  });
});
