import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertFalse,
  assertIdentical,
  assertObjectMatches,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  makeTriggerPool,
  signUpTriggerUser,
  triggerFunctionArn,
} from "../../../../../test/cognito/trigger-fixture.js";
import {
  answeringTriggerHandler,
  recordingTriggerHandler,
} from "../../../../../test/cognito/trigger-handler-fixture.js";
import type { SimCognitoTriggerPool } from "../../../../../test/cognito/trigger-fixture.js";

/**
 * The status the pool holds a user at.
 */
async function statusOf(pool: SimCognitoTriggerPool): Promise<string> {
  const read = await pool.cognito.adminGetUser(
    new AdminGetUserCommand({ UserPoolId: pool.userPoolId, Username: "alice" }),
  );

  return read.UserStatus ?? "";
}

/**
 * The value of one attribute of the pool's user.
 */
async function attributeOf(
  pool: SimCognitoTriggerPool,
  name: string,
): Promise<string | undefined> {
  const read = await pool.cognito.adminGetUser(
    new AdminGetUserCommand({ UserPoolId: pool.userPoolId, Username: "alice" }),
  );

  return read.UserAttributes?.find((attribute) => attribute.Name === name)
    ?.Value;
}

/**
 * Whether the pool's user has an attribute marked verified.
 */
async function isVerified(
  pool: SimCognitoTriggerPool,
  name: string,
): Promise<boolean> {
  return (await attributeOf(pool, `${name}_verified`)) === "true";
}

describe("sim Cognito PreSignUp trigger", () => {
  it("invokes the trigger on SignUp with the real event", async () => {
    // Given a pool whose PreSignUp trigger records what it is given.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: { PreSignUp: triggerFunctionArn },
      handler: recordingTriggerHandler(events),
    });

    // When a user signs itself up, carrying data for the trigger to read.
    await signUpTriggerUser(pool, {
      ValidationData: [{ Name: "tenant", Value: "acme" }],
      ClientMetadata: { source: "web" },
    });

    // Then the handler was given the real event, naming the occasion it fired
    // on and carrying the response flags it can answer with.
    assertObjectMatches(events[0], {
      version: "1",
      region: pool.simAws.defaultRegionName,
      userPoolId: pool.userPoolId,
      userName: "alice",
      triggerSource: "PreSignUp_SignUp",
      callerContext: { clientId: pool.clientId },
      request: {
        userAttributes: { email: "alice@example.com" },
        validationData: { tenant: "acme" },
        clientMetadata: { source: "web" },
      },
      response: {
        autoConfirmUser: false,
        autoVerifyEmail: false,
        autoVerifyPhone: false,
      },
    });
  });

  it("reads validation data that names a key and no value", async () => {
    // Given a pool whose PreSignUp trigger records what it is given.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: { PreSignUp: triggerFunctionArn },
      handler: recordingTriggerHandler(events),
    });

    // When a sign-up carries a validation data entry with no value.
    await signUpTriggerUser(pool, {
      ValidationData: [{ Name: "tenant" }],
    });

    // Then the handler reads it as the empty string, because a trigger event
    // carries strings rather than the Name/Value pairs the request sent.
    assertObjectMatches(events[0], {
      request: { validationData: { tenant: "" } },
    });
  });

  it("gives the handler no sub, because the user does not exist yet", async () => {
    // Given a pool whose PreSignUp trigger records what it is given.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: { PreSignUp: triggerFunctionArn },
      handler: recordingTriggerHandler(events),
    });

    // When a user signs itself up.
    await signUpTriggerUser(pool);

    // Then the attributes carry no sub: real Cognito allocates one only once
    // the sign-up has got past this handler.
    const { request } = events[0] as {
      request: { userAttributes: Record<string, string> };
    };

    assertUndefined(request.userAttributes["sub"]);
  });

  it("confirms the user outright when the handler asks it to", async () => {
    // Given a pool whose PreSignUp trigger auto-confirms every user.
    const pool = await makeTriggerPool({
      triggers: { PreSignUp: triggerFunctionArn },
      handler: answeringTriggerHandler({ autoConfirmUser: true }),
    });

    // When a user signs itself up.
    const signedUp = await signUpTriggerUser(pool);

    // Then the sign-up reported the user confirmed, and the pool holds it that
    // way with no ConfirmSignUp call ever made.
    assertTrue(signedUp.UserConfirmed);
    assertIdentical(await statusOf(pool), "CONFIRMED");
  });

  it("verifies the attributes the handler asks it to", async () => {
    // Given a pool whose PreSignUp trigger vouches for the addresses it is
    // given.
    const pool = await makeTriggerPool({
      triggers: { PreSignUp: triggerFunctionArn },
      handler: answeringTriggerHandler({
        autoVerifyEmail: true,
        autoVerifyPhone: true,
      }),
    });

    // When a user signs itself up with both addresses.
    await signUpTriggerUser(pool, {
      UserAttributes: [
        { Name: "email", Value: "alice@example.com" },
        { Name: "phone_number", Value: "+12065550100" },
      ],
    });

    // Then both are marked verified without a code ever being answered.
    assertTrue(await isVerified(pool, "email"));
    assertTrue(await isVerified(pool, "phone_number"));
  });

  it("leaves an auto-verified user unconfirmed unless it was told otherwise", async () => {
    // Given a pool whose PreSignUp trigger verifies the email and says nothing
    // about confirming, which real Cognito treats as two separate answers.
    const pool = await makeTriggerPool({
      triggers: { PreSignUp: triggerFunctionArn },
      handler: answeringTriggerHandler({ autoVerifyEmail: true }),
    });

    // When a user signs itself up.
    const signedUp = await signUpTriggerUser(pool);

    // Then the address is verified and the user still has to confirm.
    assertTrue(await isVerified(pool, "email"));
    assertFalse(signedUp.UserConfirmed);
    assertIdentical(await statusOf(pool), "UNCONFIRMED");
  });

  it("invokes the trigger on AdminCreateUser, naming that occasion", async () => {
    // Given a pool whose PreSignUp trigger records what it is given.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: { PreSignUp: triggerFunctionArn },
      handler: recordingTriggerHandler(events),
    });

    // When an admin creates a user instead.
    await pool.cognito.adminCreateUser(
      new AdminCreateUserCommand({
        UserPoolId: pool.userPoolId,
        Username: "alice",
        UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
        ValidationData: [{ Name: "tenant", Value: "acme" }],
        ClientMetadata: { source: "console" },
      }),
    );

    // Then the trigger fired for the occasion real Cognito names it, with no
    // app client to report because an admin operation is made with AWS
    // credentials rather than through one.
    assertObjectMatches(events[0], {
      triggerSource: "PreSignUp_AdminCreateUser",
      userName: "alice",
      callerContext: { clientId: "CLIENT_ID_NOT_APPLICABLE" },
      request: {
        userAttributes: { email: "alice@example.com" },
        validationData: { tenant: "acme" },
        clientMetadata: { source: "console" },
      },
    });
  });

  it("ignores what the handler answers on the AdminCreateUser occasion", async () => {
    // Given a pool whose PreSignUp trigger answers every flag it has.
    const pool = await makeTriggerPool({
      triggers: { PreSignUp: triggerFunctionArn },
      handler: answeringTriggerHandler({
        autoConfirmUser: true,
        autoVerifyEmail: true,
        autoVerifyPhone: true,
      }),
    });

    // When an admin creates a user.
    await pool.cognito.adminCreateUser(
      new AdminCreateUserCommand({
        UserPoolId: pool.userPoolId,
        Username: "alice",
        UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
      }),
    );

    // Then none of it was acted on, as real Cognito ignores all three here:
    // the user is already past confirmation, so it waits on its temporary
    // password with nothing vouched for.
    assertIdentical(await statusOf(pool), "FORCE_CHANGE_PASSWORD");
    assertUndefined(await attributeOf(pool, "email_verified"));
  });

  it("runs no trigger for a pool that names none", async () => {
    // Given a pool with a PostConfirmation trigger and no PreSignUp one.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: { PostConfirmation: triggerFunctionArn },
      handler: recordingTriggerHandler(events),
    });

    // When a user signs itself up.
    const signedUp = await signUpTriggerUser(pool);

    // Then nothing was invoked and the sign-up went ahead unconfirmed, which
    // is where a pool with no trigger leaves one.
    assertUndefined(events[0]);
    assertFalse(signedUp.UserConfirmed);
  });
});
