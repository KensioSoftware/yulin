import {
  AdminCreateUserCommand,
  AdminUpdateUserAttributesCommand,
  InitiateAuthCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simCognitoAliasEmail,
  simCognitoAliasPassword,
  simCognitoAliasPool,
  simCognitoAliasUser,
} from "../../../../test/cognito/sign-in-alias-fixture.js";
import { SimAws } from "../../aws/sim-aws.js";
import {
  SimCognitoAliasExistsException,
  SimCognitoInvalidParameterException,
  SimCognitoNotAuthorizedException,
  SimCognitoUsernameExistsException,
} from "../error/sim-cognito.error.js";
import { simCognitoSecretHash } from "./auth/sim-cognito-secret-hash.js";

describe("sim Cognito sign-in attribute validation", () => {
  it("computes a refresh SECRET_HASH over the generated username", async () => {
    // Given a confirmed user of a pool that signs users in by email, signed
    // in through an app client holding a secret.
    const setUp = await simCognitoAliasPool({ generateSecret: true });
    const { cognito, clientId, clientSecret } = setUp;
    assertNonNullable(clientSecret);

    const username = await simCognitoAliasUser(setUp);
    const signedIn = await cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: clientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: simCognitoAliasEmail,
          PASSWORD: simCognitoAliasPassword,
          SECRET_HASH: simCognitoSecretHash(
            simCognitoAliasEmail,
            clientId,
            clientSecret,
          ),
        },
      }),
    );

    assertNonNullable(signedIn.AuthenticationResult?.RefreshToken);
    const refreshToken = signedIn.AuthenticationResult.RefreshToken;

    // When the session is refreshed with a hash computed over the address the
    // sign-in named.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.initiateAuth(
        new InitiateAuthCommand({
          ClientId: clientId,
          AuthFlow: "REFRESH_TOKEN_AUTH",
          AuthParameters: {
            REFRESH_TOKEN: refreshToken,
            SECRET_HASH: simCognitoSecretHash(
              simCognitoAliasEmail,
              clientId,
              clientSecret,
            ),
          },
        }),
      );
    });

    // Then it is refused. A refresh names no user, so the hash has to cover
    // the username the token was issued to, which is the generated one.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Unable to verify secret hash");

    // And the same refresh with the generated username in the hash is
    // answered with new tokens.
    const refreshed = await cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: clientId,
        AuthFlow: "REFRESH_TOKEN_AUTH",
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
          SECRET_HASH: simCognitoSecretHash(username, clientId, clientSecret),
        },
      }),
    );

    assertNonNullable(refreshed.AuthenticationResult?.AccessToken);
  });

  it("refuses a second account signing in by the same address", async () => {
    // Given a user of a pool that signs users in by email.
    const setUp = await simCognitoAliasPool();
    await simCognitoAliasUser(setUp);

    // When someone signs up with the same address.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.signUp(
        new SignUpCommand({
          ClientId: setUp.clientId,
          Username: simCognitoAliasEmail,
          Password: simCognitoAliasPassword,
        }),
      );
    });

    // Then it is refused. The address identifies the account on such a pool,
    // so two users holding it would leave a sign-in naming an account the
    // pool has two of.
    assertInstanceOf(error, SimCognitoUsernameExistsException);
    assertStringIncludes(
      error.message,
      "An account with the given email already exists.",
    );
  });

  it("refuses an attribute update taking an address another user has", async () => {
    // Given two users of a pool that signs users in by email.
    const setUp = await simCognitoAliasPool();
    await simCognitoAliasUser(setUp);
    const other = await simCognitoAliasUser(setUp, "bob@example.com");

    // When the second is given the first one's address.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.adminUpdateUserAttributes(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: setUp.userPoolId,
          Username: other,
          UserAttributes: [{ Name: "email", Value: simCognitoAliasEmail }],
        }),
      );
    });

    // Then it is refused as real Cognito refuses it, rather than leaving the
    // pool with two users a sign-in by that address could mean.
    assertInstanceOf(error, SimCognitoAliasExistsException);
    assertStringIncludes(
      error.message,
      "An account with the given email already exists.",
    );

    // And setting the address a user already signs in by is left alone.
    await setUp.cognito.adminUpdateUserAttributes(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: setUp.userPoolId,
        Username: other,
        UserAttributes: [{ Name: "email", Value: "bob@example.com" }],
      }),
    );
  });

  it("refuses a username that is not the address the pool signs in by", async () => {
    // Given a pool that signs its users in by email.
    const setUp = await simCognitoAliasPool();

    // When someone signs up with a username of their own.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.signUp(
        new SignUpCommand({
          ClientId: setUp.clientId,
          Username: "alice",
          Password: simCognitoAliasPassword,
        }),
      );
    });

    // Then it is refused, as real Cognito refuses one: a user created that
    // way could never sign in.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "Username should be an email.");
  });

  it("names both forms where the pool signs users in by either", async () => {
    // Given a pool that signs its users in by email or by phone number.
    const setUp = await simCognitoAliasPool({
      usernameAttributes: ["email", "phone_number"],
    });

    // When a user is created under a username that is neither.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.adminCreateUser(
        new AdminCreateUserCommand({
          UserPoolId: setUp.userPoolId,
          Username: "07700900000",
        }),
      );
    });

    // Then the refusal names both forms it would have taken.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(
      error.message,
      "Username should be either an email or a phone number.",
    );
  });

  it("refuses an attribute Cognito cannot sign users in by", async () => {
    // Given a request for a pool signing users in by an ordinary attribute.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When it is made. The SDK's own type names the two attributes Cognito
    // takes, so a request for anything else is built by hand.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.createUserPool({
        input: {
          PoolName: "myapp-users",
          UsernameAttributes: ["preferred_username"],
        },
      });
    });

    // Then the refusal names the two attributes Cognito does sign users in
    // by.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(
      error.message,
      "UsernameAttributes 'preferred_username' is not an attribute Cognito " +
        "can sign users in by",
    );
    assertStringIncludes(error.message, "email and phone_number");
  });

  it("refuses a sign-up whose email attribute is not its username", async () => {
    // Given a pool that signs its users in by email.
    const setUp = await simCognitoAliasPool();

    // When someone signs up naming one address as the username and another as
    // the email attribute.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.signUp(
        new SignUpCommand({
          ClientId: setUp.clientId,
          Username: simCognitoAliasEmail,
          Password: simCognitoAliasPassword,
          UserAttributes: [{ Name: "email", Value: "bob@example.com" }],
        }),
      );
    });

    // Then it is refused rather than resolved in favour of either: the pool
    // signs the user in by one of them, and code written against the other
    // would look up a user that is not there.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "name different accounts");
  });

  it("refuses an update changing what the pool signs users in by", async () => {
    // Given a pool that signs its users in by email.
    const { cognito, userPoolId } = await simCognitoAliasPool();

    // When an update asks for something else. Real UpdateUserPool has no such
    // input, so the SDK's own type does not carry it and the request is built
    // by hand.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.updateUserPool({
        input: { UserPoolId: userPoolId, UsernameAttributes: ["phone_number"] },
      });
    });

    // Then it is refused, saying that what a pool signs its users in by is
    // settled when the pool is created.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(
      error.message,
      "UpdateUserPool UsernameAttributes is not an input real Cognito has",
    );
  });
});
