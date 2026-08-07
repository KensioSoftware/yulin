import {
  AdminConfirmSignUpCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertIdentical,
  assertObjectMatches,
  assertUndefined,
  assertUuidV4,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  confirmTriggerSignUp,
  makeTriggerPool,
  signUpTriggerUser,
  triggerFunctionArn,
} from "../../../../../test/cognito/trigger-fixture.js";
import { recordingTriggerHandler } from "../../../../../test/cognito/trigger-handler-fixture.js";

/**
 * The `triggerSource` of every event a handler recorded.
 */
function sourcesOf(events: readonly unknown[]): readonly string[] {
  return events.map(
    (event) => (event as { triggerSource: string }).triggerSource,
  );
}

describe("sim Cognito PostConfirmation trigger", () => {
  it("invokes the trigger after ConfirmSignUp with the confirmed user", async () => {
    // Given a pool that verifies an email on confirmation and records what its
    // PostConfirmation trigger is given.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: { PostConfirmation: triggerFunctionArn },
      handler: recordingTriggerHandler(events),
      autoVerifiedAttributes: ["email"],
    });

    await signUpTriggerUser(pool);

    // When the user confirms with the code the pool issued.
    await confirmTriggerSignUp(pool, { source: "web" });

    // Then the handler was given the confirmed user's attributes, including
    // the verification the confirmation had just applied.
    assertObjectMatches(events[0], {
      userPoolId: pool.userPoolId,
      userName: "alice",
      triggerSource: "PostConfirmation_ConfirmSignUp",
      callerContext: { clientId: pool.clientId },
      request: {
        userAttributes: {
          email: "alice@example.com",
          email_verified: "true",
        },
        clientMetadata: { source: "web" },
      },
      response: {},
    });
  });

  it("gives the handler the sub the pool allocated", async () => {
    // Given a pool whose PostConfirmation trigger records what it is given.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: { PostConfirmation: triggerFunctionArn },
      handler: recordingTriggerHandler(events),
    });

    const signedUp = await signUpTriggerUser(pool);

    // When the user confirms.
    await confirmTriggerSignUp(pool);

    // Then the sub is among the attributes, which is what a handler keys an
    // external record on.
    const { request } = events[0] as {
      request: { userAttributes: Record<string, string> };
    };

    assertUuidV4(request.userAttributes["sub"]);
    assertIdentical(request.userAttributes["sub"], signedUp.UserSub);
  });

  it("reaches a user the PreSignUp trigger confirmed outright", async () => {
    // Given a pool with both triggers, where the first auto-confirms.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: {
        PreSignUp: triggerFunctionArn,
        PostConfirmation: triggerFunctionArn,
      },
      handler: (event: { response: Record<string, boolean> }) => {
        events.push(structuredClone(event));
        event.response["autoConfirmUser"] = true;

        return event;
      },
    });

    // When a user signs itself up and never calls ConfirmSignUp.
    await signUpTriggerUser(pool);

    // Then both fired, in the order the sign-up reaches them, so a project
    // whose users never confirm still runs its post confirmation handler.
    assertArrayEquals(sourcesOf(events), [
      "PreSignUp_SignUp",
      "PostConfirmation_ConfirmSignUp",
    ]);
  });

  it("invokes the trigger after AdminConfirmSignUp", async () => {
    // Given a signed-up user waiting to be confirmed.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: { PostConfirmation: triggerFunctionArn },
      handler: recordingTriggerHandler(events),
    });

    await signUpTriggerUser(pool);

    // When an admin confirms it with no code at all.
    await pool.cognito.adminConfirmSignUp(
      new AdminConfirmSignUpCommand({
        UserPoolId: pool.userPoolId,
        Username: "alice",
        ClientMetadata: { source: "console" },
      }),
    );

    // Then the trigger fired under the same source, because the user being
    // confirmed signed itself up either way, and with no app client to name.
    assertObjectMatches(events[0], {
      triggerSource: "PostConfirmation_ConfirmSignUp",
      userName: "alice",
      callerContext: { clientId: "CLIENT_ID_NOT_APPLICABLE" },
      request: { clientMetadata: { source: "console" } },
    });
  });

  it("does not invoke the trigger for AdminCreateUser", async () => {
    // Given a pool with a PostConfirmation trigger.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: { PostConfirmation: triggerFunctionArn },
      handler: recordingTriggerHandler(events),
    });

    // When an admin creates a user and gives it a permanent password, which is
    // what takes an admin-created user to CONFIRMED.
    await pool.cognito.adminCreateUser(
      new AdminCreateUserCommand({
        UserPoolId: pool.userPoolId,
        Username: "alice",
        TemporaryPassword: "Temp0rary!",
      }),
    );
    await pool.cognito.adminSetUserPassword(
      new AdminSetUserPasswordCommand({
        UserPoolId: pool.userPoolId,
        Username: "alice",
        Password: "Sup3rSecret!",
        Permanent: true,
      }),
    );

    // Then nothing fired, as nothing fires on real Cognito: the trigger is for
    // users who sign themselves up. A project hanging its user record on this
    // would pass here and write nothing in production, so it has to fail here
    // too.
    assertUndefined(events[0]);
  });
});
