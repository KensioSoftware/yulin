import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  ConfirmSignUpCommand,
  DescribeUserPoolCommand,
  InitiateAuthCommand,
  SignUpCommand,
  UpdateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertStringNotIncludes,
  assertUndefined,
  assertUuidV4,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simCognitoAliasEmail,
  simCognitoAliasPassword,
  simCognitoAliasPool,
  simCognitoAliasUser,
} from "../../../../test/cognito/sign-in-alias-fixture.js";
import type { JSONObject } from "../../../util/type-guard/json.js";
import type { SimCognitoAttributeType } from "./user/sim-cognito-user-attributes.js";

/**
 * Read the claims of a JWT, which are base64url encoded JSON.
 */
function tokenClaims(token: string): JSONObject {
  const [, claims] = token.split(".", 2);

  return JSON.parse(
    Buffer.from(claims ?? "", "base64url").toString("utf8"),
  ) as JSONObject;
}

/**
 * The value of one attribute of a described user.
 */
function attributeOf(
  attributes: readonly SimCognitoAttributeType[] | undefined,
  name: string,
): string | undefined {
  return attributes?.find((attribute) => attribute.Name === name)?.Value;
}

describe("sim Cognito pools that sign users in by an attribute", () => {
  it("stores a generated username and the address it was signed up by", async () => {
    // Given a pool that signs its users in by email.
    const setUp = await simCognitoAliasPool();

    // When someone signs up with their address as the username.
    const username = await simCognitoAliasUser(setUp);

    // Then the username the pool holds is a UUID it generated rather than the
    // address, which is what a real pool created this way stores.
    assertUuidV4(username);
    assertStringNotIncludes(username, "@");

    // And the address is the user's email attribute, so nothing about it was
    // lost.
    const found = await setUp.cognito.adminGetUser(
      new AdminGetUserCommand({
        UserPoolId: setUp.userPoolId,
        Username: username,
      }),
    );

    assertIdentical(
      attributeOf(found.UserAttributes, "email"),
      simCognitoAliasEmail,
    );
  });

  it("resolves an admin operation naming the user by its address", async () => {
    // Given a user of a pool that signs users in by email.
    const setUp = await simCognitoAliasPool();
    const username = await simCognitoAliasUser(setUp);

    // When an admin operation names that user by its address rather than by
    // the username the pool generated.
    await setUp.cognito.adminUpdateUserAttributes(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: setUp.userPoolId,
        Username: simCognitoAliasEmail,
        UserAttributes: [{ Name: "name", Value: "Alice" }],
      }),
    );

    // Then it reached the same user, which is the alias resolution real
    // Cognito does for its admin operations.
    const found = await setUp.cognito.adminGetUser(
      new AdminGetUserCommand({
        UserPoolId: setUp.userPoolId,
        Username: username,
      }),
    );

    assertIdentical(attributeOf(found.UserAttributes, "name"), "Alice");
  });

  it("confirms a sign-up named by the address it was made with", async () => {
    // Given someone who has signed up by their address.
    const { cognito, userPoolId, clientId } = await simCognitoAliasPool();

    await cognito.signUp(
      new SignUpCommand({
        ClientId: clientId,
        Username: simCognitoAliasEmail,
        Password: simCognitoAliasPassword,
      }),
    );

    // When they confirm with the code the pool issued, naming themselves by
    // the address as the sign-up did.
    const code = cognito
      .userPool(userPoolId)
      .confirmationCode(simCognitoAliasEmail);

    await cognito.confirmSignUp(
      new ConfirmSignUpCommand({
        ClientId: clientId,
        Username: simCognitoAliasEmail,
        ConfirmationCode: code,
      }),
    );

    // Then the user is confirmed, so the client-side sign-up flow works
    // throughout without the caller ever knowing the generated username.
    const found = await cognito.adminGetUser(
      new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: simCognitoAliasEmail,
      }),
    );

    assertIdentical(found.UserStatus, "CONFIRMED");
  });

  it("names the generated username in the tokens a sign-in answers with", async () => {
    // Given a confirmed user of a pool that signs users in by email.
    const setUp = await simCognitoAliasPool();
    const username = await simCognitoAliasUser(setUp);

    // When the user signs in with its address.
    const signedIn = await setUp.cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: setUp.clientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: simCognitoAliasEmail,
          PASSWORD: simCognitoAliasPassword,
        },
      }),
    );

    // Then the tokens name the generated username rather than the address, so
    // an application storing what it reads there stores what a deployment
    // would have given it.
    assertNonNullable(signedIn.AuthenticationResult?.IdToken);
    assertNonNullable(signedIn.AuthenticationResult.AccessToken);

    const idClaims = tokenClaims(signedIn.AuthenticationResult.IdToken);
    const accessClaims = tokenClaims(signedIn.AuthenticationResult.AccessToken);

    assertIdentical(idClaims["cognito:username"], username);
    assertIdentical(accessClaims["username"], username);

    // And the address is on the id token as the email claim, which is where
    // an application reads it from.
    assertIdentical(idClaims["email"], simCognitoAliasEmail);
  });

  it("gives an admin-created user a generated username too", async () => {
    // Given a pool that signs its users in by email.
    const { cognito, userPoolId } = await simCognitoAliasPool();

    // When an administrator creates a user with an address as the username.
    const created = await cognito.adminCreateUser(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: "bob@example.com",
        TemporaryPassword: simCognitoAliasPassword,
      }),
    );

    // Then that user was stored under a generated username as well, with the
    // address as its email attribute.
    assertNonNullable(created.User?.Username);
    assertUuidV4(created.User.Username);
    assertIdentical(
      attributeOf(created.User.Attributes, "email"),
      "bob@example.com",
    );
  });

  it("keeps a signed-up address as the email attribute the request set", async () => {
    // Given a pool that signs its users in by email.
    const { cognito, userPoolId } = await simCognitoAliasPool();

    // When a user is created naming the same address twice, as an application
    // that always sends its attributes does.
    const created = await cognito.adminCreateUser(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: simCognitoAliasEmail,
        TemporaryPassword: simCognitoAliasPassword,
        UserAttributes: [
          { Name: "email", Value: simCognitoAliasEmail },
          { Name: "email_verified", Value: "true" },
        ],
      }),
    );

    // Then the attributes the request set are the user's, rather than the
    // address being written over them.
    assertNonNullable(created.User?.Username);
    assertIdentical(
      attributeOf(created.User.Attributes, "email"),
      simCognitoAliasEmail,
    );
    assertIdentical(
      attributeOf(created.User.Attributes, "email_verified"),
      "true",
    );
  });

  it("reports what the pool signs users in by, and keeps it through an update", async () => {
    // Given a pool that signs its users in by phone number.
    const { cognito, userPoolId } = await simCognitoAliasPool({
      usernameAttributes: ["phone_number"],
    });

    // When the pool is described, and then updated without saying anything
    // about it.
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
    );

    await cognito.updateUserPool(
      new UpdateUserPoolCommand({
        UserPoolId: userPoolId,
        DeletionProtection: "INACTIVE",
      }),
    );

    const updated = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
    );

    // Then both report it. What a pool signs its users in by is fixed when
    // the pool is created, so an update that replaces every other setting
    // leaves this one alone.
    assertArrayEquals(described.UserPool?.UsernameAttributes, ["phone_number"]);
    assertArrayEquals(updated.UserPool?.UsernameAttributes, ["phone_number"]);
  });

  it("signs users in by username where the pool names no attribute", async () => {
    // Given a pool created without any, which is the default.
    const { cognito, userPoolId } = await simCognitoAliasPool({
      usernameAttributes: [],
    });

    // When a user is created under a username of its own.
    const created = await cognito.adminCreateUser(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        TemporaryPassword: simCognitoAliasPassword,
      }),
    );

    // Then the username is the one the request asked for, and the pool
    // reports no sign-in attributes at all rather than an empty list.
    assertIdentical(created.User?.Username, "alice");

    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
    );

    assertUndefined(described.UserPool?.UsernameAttributes);
  });
});
