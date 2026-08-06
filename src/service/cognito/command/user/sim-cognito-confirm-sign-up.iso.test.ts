import {
  AdminConfirmSignUpCommand,
  AdminGetUserCommand,
  ConfirmSignUpCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type { VerifiedAttributeType } from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCognitoAttributeType } from "../../user-pool/user/sim-cognito-user-attributes.js";
import {
  SimCognitoCodeMismatchException,
  SimCognitoInvalidParameterException,
  SimCognitoNotAuthorizedException,
} from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

const password = "Sup3rSecret!";

/**
 * What Cognito sets a `_verified` attribute to, which is the string rather
 * than a boolean.
 */
const verified = "true";

interface SimCognitoWithSignUp {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly clientId: string;
  readonly confirmationCode: string;
}

function attributeValue(
  attributes: readonly SimCognitoAttributeType[] | undefined,
  name: string,
): string | undefined {
  return (attributes ?? []).find((attribute) => attribute.Name === name)?.Value;
}

/**
 * A pool holding one user that has signed itself up and not confirmed.
 */
async function simCognitoWithSignUp(
  autoVerifiedAttributes?: VerifiedAttributeType[],
): Promise<SimCognitoWithSignUp> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({
      PoolName: "myapp-users",
      AutoVerifiedAttributes: autoVerifiedAttributes,
    }),
  );

  assertNonNullable(pool.UserPool?.Id);

  const userPoolId = pool.UserPool.Id;
  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: "web",
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
    }),
  );

  assertNonNullable(client.UserPoolClient?.ClientId);

  const clientId = client.UserPoolClient.ClientId;

  await cognito.signUp(
    new SignUpCommand({
      ClientId: clientId,
      Username: "alice",
      Password: password,
      UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
    }),
  );

  const confirmationCode = cognito
    .userPool(userPoolId)
    .confirmationCode("alice");

  assertNonNullable(confirmationCode);

  return { cognito, userPoolId, clientId, confirmationCode };
}

async function userStatus(
  cognito: SimCognitoIdentityProvider,
  userPoolId: string,
): Promise<string | undefined> {
  const read = await cognito.adminGetUser(
    new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
  );

  return read.UserStatus;
}

describe("sim Cognito sign-up confirmation", () => {
  it("confirms a sign-up and lets the user sign in", async () => {
    // Given a user waiting to confirm.
    const { cognito, userPoolId, clientId, confirmationCode } =
      await simCognitoWithSignUp();

    // When it answers with the code it was issued.
    await cognito.confirmSignUp(
      new ConfirmSignUpCommand({
        ClientId: clientId,
        Username: "alice",
        ConfirmationCode: confirmationCode,
      }),
    );

    // Then it is confirmed, and signs in with the password it chose at
    // sign-up rather than being sent a challenge.
    assertIdentical(await userStatus(cognito, userPoolId), "CONFIRMED");

    const signedIn = await cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: clientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: password },
      }),
    );

    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
  });

  it("spends the code, so it confirms nothing twice", async () => {
    // Given a confirmed user.
    const { cognito, userPoolId, clientId, confirmationCode } =
      await simCognitoWithSignUp();
    await cognito.confirmSignUp(
      new ConfirmSignUpCommand({
        ClientId: clientId,
        Username: "alice",
        ConfirmationCode: confirmationCode,
      }),
    );

    // When the same code is presented again.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.confirmSignUp(
        new ConfirmSignUpCommand({
          ClientId: clientId,
          Username: "alice",
          ConfirmationCode: confirmationCode,
        }),
      );
    });

    // Then it is refused, and the pool no longer holds a code at all.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Current status is CONFIRMED");
    assertUndefined(cognito.userPool(userPoolId).confirmationCode("alice"));
  });

  it("refuses a wrong code and leaves the user where it was", async () => {
    // Given a user waiting to confirm.
    const { cognito, userPoolId, clientId } = await simCognitoWithSignUp();

    // When it answers with a code that is not the one it was issued.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.confirmSignUp(
        new ConfirmSignUpCommand({
          ClientId: clientId,
          Username: "alice",
          ConfirmationCode: "000000-not-it",
        }),
      );
    });

    // Then it is refused, and the user is still waiting with the code it had,
    // so a second attempt with the right one works.
    assertInstanceOf(error, SimCognitoCodeMismatchException);
    assertIdentical(await userStatus(cognito, userPoolId), "UNCONFIRMED");
    assertNonNullable(cognito.userPool(userPoolId).confirmationCode("alice"));
  });

  it("verifies the pool's auto-verified attributes on confirmation", async () => {
    // Given a pool that verifies email addresses, and a user waiting to
    // confirm.
    const { cognito, userPoolId, clientId, confirmationCode } =
      await simCognitoWithSignUp(["email"]);

    // When the sign-up is confirmed.
    await cognito.confirmSignUp(
      new ConfirmSignUpCommand({
        ClientId: clientId,
        Username: "alice",
        ConfirmationCode: confirmationCode,
      }),
    );

    // Then the address the code went to is marked verified.
    const read = await cognito.adminGetUser(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    assertIdentical(
      attributeValue(read.UserAttributes, "email_verified"),
      verified,
    );
  });

  it("verifies nothing on a pool that verifies nothing", async () => {
    // Given a pool with no AutoVerifiedAttributes.
    const { cognito, userPoolId, clientId, confirmationCode } =
      await simCognitoWithSignUp();

    // When the sign-up is confirmed.
    await cognito.confirmSignUp(
      new ConfirmSignUpCommand({
        ClientId: clientId,
        Username: "alice",
        ConfirmationCode: confirmationCode,
      }),
    );

    // Then the email is left unverified, as it is on such a pool.
    const read = await cognito.adminGetUser(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    assertUndefined(attributeValue(read.UserAttributes, "email_verified"));
  });

  it("issues a fresh code, and the earlier one stops working", async () => {
    // Given a user waiting to confirm, holding the code it was issued.
    const { cognito, userPoolId, clientId, confirmationCode } =
      await simCognitoWithSignUp();

    // When it asks for the code again.
    await cognito.resendConfirmationCode(
      new ResendConfirmationCodeCommand({
        ClientId: clientId,
        Username: "alice",
      }),
    );

    // Then the earlier code confirms nothing, as it does not on real Cognito.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.confirmSignUp(
        new ConfirmSignUpCommand({
          ClientId: clientId,
          Username: "alice",
          ConfirmationCode: confirmationCode,
        }),
      );
    });

    assertInstanceOf(error, SimCognitoCodeMismatchException);

    // And the code the pool holds now is the one that does.
    const resent = cognito.userPool(userPoolId).confirmationCode("alice");

    await cognito.confirmSignUp(
      new ConfirmSignUpCommand({
        ClientId: clientId,
        Username: "alice",
        ConfirmationCode: resent,
      }),
    );

    assertIdentical(await userStatus(cognito, userPoolId), "CONFIRMED");
  });

  it("refuses another code for a user that has confirmed", async () => {
    // Given a confirmed user.
    const { cognito, userPoolId, clientId, confirmationCode } =
      await simCognitoWithSignUp();
    await cognito.confirmSignUp(
      new ConfirmSignUpCommand({
        ClientId: clientId,
        Username: "alice",
        ConfirmationCode: confirmationCode,
      }),
    );

    // When another code is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.resendConfirmationCode(
        new ResendConfirmationCodeCommand({
          ClientId: clientId,
          Username: "alice",
        }),
      );
    });

    // Then it is refused, and the user still holds no code.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "already confirmed");
    assertUndefined(cognito.userPool(userPoolId).confirmationCode("alice"));
  });

  it("confirms a user as an admin with no code at all", async () => {
    // Given a user waiting to confirm, on a pool that verifies emails.
    const { cognito, userPoolId } = await simCognitoWithSignUp(["email"]);

    // When an admin confirms it.
    await cognito.adminConfirmSignUp(
      new AdminConfirmSignUpCommand({
        UserPoolId: userPoolId,
        Username: "alice",
      }),
    );

    // Then the user is confirmed, and its email is still unverified: an admin
    // confirming a user says nothing about whose address that is.
    const read = await cognito.adminGetUser(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    assertIdentical(read.UserStatus, "CONFIRMED");
    assertUndefined(attributeValue(read.UserAttributes, "email_verified"));
  });
});
