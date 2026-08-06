import {
  AdminCreateUserCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type { AdminCreateUserCommandInput } from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";
import type { SimCognitoSentMessage } from "./sim-cognito-sent-message.js";

const temporaryPassword = "Temp0rary!";

interface InvitationPool {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
}

async function makePool(): Promise<InvitationPool> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );
  const userPoolId = pool.UserPool?.Id;
  assertTypeString(userPoolId);

  return { cognito, userPoolId };
}

async function createUser(
  pool: InvitationPool,
  input: Partial<AdminCreateUserCommandInput> = {},
): Promise<void> {
  await pool.cognito.adminCreateUser(
    new AdminCreateUserCommand({
      UserPoolId: pool.userPoolId,
      Username: "alice",
      TemporaryPassword: temporaryPassword,
      UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
      ...input,
    }),
  );
}

function sentBy(pool: InvitationPool): readonly SimCognitoSentMessage[] {
  return pool.cognito.userPool(pool.userPoolId).sentMessages();
}

describe("sim Cognito user pool invitation messages", () => {
  it("records the invitation an admin-created user would have been sent", async () => {
    // Given a pool with no messages recorded yet.
    const pool = await makePool();

    // When an administrator creates a user with a temporary password.
    await createUser(pool);

    // Then the pool recorded the invitation, carrying the username and the
    // password the user needs to sign in with.
    const [message] = sentBy(pool);
    assertNonNullable(message);
    assertIdentical(message.recipient, "alice@example.com");
    assertIdentical(message.medium, "EMAIL");
    assertIdentical(message.occasion, "AdminCreateUser");
    assertIdentical(message.subject, "Your temporary password");
    assertIdentical(
      message.body,
      `Your username is alice and temporary password is ${temporaryPassword}.`,
    );
  });

  it("records nothing where the request suppressed the message", async () => {
    // Given a pool with no messages recorded yet.
    const pool = await makePool();

    // When the user is created with the invitation suppressed.
    await createUser(pool, { MessageAction: "SUPPRESS" });

    // Then no invitation was recorded, which is the difference SUPPRESS makes
    // on real Cognito too.
    assertArrayEquals(sentBy(pool), []);
  });

  it("leaves the placeholder where there is no password to put in it", async () => {
    // Given a pool, and a user created without a temporary password.
    const pool = await makePool();
    await createUser(pool, { TemporaryPassword: undefined });

    // Then the invitation still went, with the placeholder left as it is:
    // real Cognito generates a password there, and this simulation leaves the
    // user with none at all, so there is nothing to fill in.
    const [message] = sentBy(pool);
    assertNonNullable(message);
    assertIdentical(
      message.body,
      "Your username is alice and temporary password is {####}.",
    );
  });

  it("texts a user it has only a phone number for", async () => {
    // Given a pool with no messages recorded yet.
    const pool = await makePool();

    // When the user has a phone number rather than an email address.
    await createUser(pool, {
      UserAttributes: [{ Name: "phone_number", Value: "+447700900123" }],
    });

    // Then the invitation is a text message, which has no subject.
    const [message] = sentBy(pool);
    assertNonNullable(message);
    assertIdentical(message.recipient, "+447700900123");
    assertIdentical(message.medium, "SMS");
    assertUndefined(message.subject);
  });

  it("records nothing for a user it has no address for", async () => {
    // Given a pool with no messages recorded yet.
    const pool = await makePool();

    // When a user is created with neither attribute the pool could write to.
    await createUser(pool, { UserAttributes: undefined });

    // Then there was nowhere to send an invitation, and none was recorded.
    assertArrayEquals(sentBy(pool), []);
  });

  it("invites a user whatever the pool verifies automatically", async () => {
    // Given a pool that verifies the phone number rather than the email.
    const cognito = new SimAws().cognitoIdentityProvider();
    const created = await cognito.createUserPool(
      new CreateUserPoolCommand({
        PoolName: "myapp-users",
        AutoVerifiedAttributes: ["phone_number"],
      }),
    );
    const userPoolId = created.UserPool?.Id;
    assertTypeString(userPoolId);

    // When a user with only an email address is created.
    await createUser({ cognito, userPoolId });

    // Then the invitation went to the email address anyway: what a pool
    // verifies narrows a verification message, not an invitation.
    const [message] = sentBy({ cognito, userPoolId });
    assertNonNullable(message);
    assertIdentical(message.recipient, "alice@example.com");
  });
});
