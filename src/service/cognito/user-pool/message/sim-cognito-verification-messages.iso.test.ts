import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type { CreateUserPoolCommandInput } from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertStringNotIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";
import type { SimCognitoSentMessage } from "./sim-cognito-sent-message.js";

/** The password the user in each of these signs up with. */
const password = "Sup3rSecret!";

interface MessagePool {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly clientId: string;
}

/**
 * A pool that verifies an attribute automatically, with an app client to sign
 * up through.
 */
async function makePool(
  input: Partial<CreateUserPoolCommandInput> = {},
): Promise<MessagePool> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({
      PoolName: "myapp-users",
      AutoVerifiedAttributes: ["email"],
      ...input,
    }),
  );
  const userPoolId = pool.UserPool?.Id;
  assertTypeString(userPoolId);

  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: "web",
    }),
  );
  const clientId = client.UserPoolClient?.ClientId;
  assertTypeString(clientId);

  return { cognito, userPoolId, clientId };
}

async function signUp(
  pool: MessagePool,
  attributes: readonly { Name: string; Value: string }[] = [
    { Name: "email", Value: "alice@example.com" },
  ],
): Promise<void> {
  await pool.cognito.signUp(
    new SignUpCommand({
      ClientId: pool.clientId,
      Username: "alice",
      Password: password,
      UserAttributes: [...attributes],
    }),
  );
}

function sentBy(pool: MessagePool): readonly SimCognitoSentMessage[] {
  return pool.cognito.userPool(pool.userPoolId).sentMessages();
}

function codeIn(pool: MessagePool): string {
  const code = pool.cognito.userPool(pool.userPoolId).confirmationCode("alice");
  assertTypeString(code);

  return code;
}

describe("sim Cognito user pool verification messages", () => {
  it("records the message a sign-up would have sent", async () => {
    // Given a pool that verifies the email attribute automatically.
    const pool = await makePool();

    // When a user signs itself up.
    await signUp(pool);

    // Then the pool recorded the verification message it would have sent,
    // addressed to the user's own email address.
    const [message] = sentBy(pool);
    assertNonNullable(message);
    assertIdentical(message.username, "alice");
    assertIdentical(message.recipient, "alice@example.com");
    assertIdentical(message.medium, "EMAIL");
    assertIdentical(message.occasion, "SignUp");
    assertIdentical(message.subject, "Your verification code");

    // And the body carries the code the user was issued, in place of the
    // placeholder the wording has.
    assertIdentical(message.body, `Your verification code is ${codeIn(pool)}`);
  });

  it("says what the pool was created with rather than the default", async () => {
    // Given a pool created with its own verification wording, which used to be
    // refused at anything but the one string CDK emits.
    const pool = await makePool({
      EmailVerificationSubject: "Welcome to Acme",
      EmailVerificationMessage:
        "Hello, your Acme code is {####}. Twice: {####}",
    });

    // When a user signs itself up.
    await signUp(pool);

    // Then the recorded message says what the pool was asked to say, with
    // every placeholder in it filled in.
    const [message] = sentBy(pool);
    const code = codeIn(pool);
    assertNonNullable(message);
    assertIdentical(message.subject, "Welcome to Acme");
    assertIdentical(
      message.body,
      `Hello, your Acme code is ${code}. Twice: ${code}`,
    );
  });

  it("prefers the template over the inputs it replaced", async () => {
    // Given a pool that sets both the older inputs and the template, as a CDK
    // pool does, with the two disagreeing.
    const pool = await makePool({
      EmailVerificationSubject: "The older subject",
      EmailVerificationMessage: "The older message {####}",
      VerificationMessageTemplate: {
        DefaultEmailOption: "CONFIRM_WITH_CODE",
        EmailSubject: "The template subject",
      },
    });

    // When a user signs itself up.
    await signUp(pool);

    // Then the template wins where it says something, and the older input
    // fills in what it left out.
    const [message] = sentBy(pool);
    assertNonNullable(message);
    assertIdentical(message.subject, "The template subject");
    assertIdentical(message.body, `The older message ${codeIn(pool)}`);
  });

  it("texts a user it has a phone number for", async () => {
    // Given a pool that verifies the phone number automatically.
    const pool = await makePool({
      AutoVerifiedAttributes: ["phone_number"],
      SmsVerificationMessage: "Acme code: {####}",
    });

    // When a user with a phone number signs itself up.
    await signUp(pool, [{ Name: "phone_number", Value: "+447700900123" }]);

    // Then the message went to the number, as a text message with no subject:
    // Cognito picks the medium from the attribute it is writing to.
    const [message] = sentBy(pool);
    assertNonNullable(message);
    assertIdentical(message.recipient, "+447700900123");
    assertIdentical(message.medium, "SMS");
    assertUndefined(message.subject);
    assertIdentical(message.body, `Acme code: ${codeIn(pool)}`);
  });

  it("sends nothing for a pool that verifies nothing", async () => {
    // Given a pool with no AutoVerifiedAttributes, which is the default.
    const pool = await makePool({ AutoVerifiedAttributes: undefined });

    // When a user signs itself up.
    await signUp(pool);

    // Then no message was sent: the pool is not trying to prove any address
    // belongs to the user, so real Cognito leaves it to an administrator to
    // confirm.
    assertArrayEquals(sentBy(pool), []);
  });

  it("sends nothing to a user it has no address for", async () => {
    // Given a pool that verifies the email attribute.
    const pool = await makePool();

    // When a user signs up without one.
    await signUp(pool, []);

    // Then there was nowhere to write to, and no message was recorded.
    assertArrayEquals(sentBy(pool), []);
  });

  it("records another message when the code is resent", async () => {
    // Given a signed-up user waiting to be confirmed.
    const pool = await makePool();
    await signUp(pool);
    const firstCode = codeIn(pool);

    // When it asks for the code again.
    await pool.cognito.resendConfirmationCode(
      new ResendConfirmationCodeCommand({
        ClientId: pool.clientId,
        Username: "alice",
      }),
    );

    // Then a second message was recorded, naming the occasion it was sent on.
    const messages = sentBy(pool);
    assertArrayEquals(
      messages.map((message) => message.occasion),
      ["SignUp", "ResendCode"],
    );

    // And it carries the fresh code rather than the one that no longer works.
    const [, resent] = messages;
    assertNonNullable(resent);
    assertStringIncludes(resent.body, codeIn(pool));
    assertStringNotIncludes(resent.body, firstCode);
  });

  it("refuses wording with no code placeholder in it", async () => {
    // When a pool is created with wording that would carry no code.
    const error = await assertThrowsErrorAsync(async () => {
      await makePool({ EmailVerificationMessage: "Welcome to Acme" });
    });

    // Then it is refused as real Cognito refuses it, rather than recording a
    // message a user could not confirm with.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "{####}");
  });

  it("refuses wording longer than the medium takes", async () => {
    // When a pool is created with a text message longer than an SMS carries.
    const error = await assertThrowsErrorAsync(async () => {
      await makePool({
        SmsVerificationMessage: `{####} ${"a".repeat(140)}`,
      });
    });

    // Then it is refused, naming the length Cognito takes.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "140");
  });
});
