import {
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCognitoAttributeType } from "../../user-pool/user/sim-cognito-user-attributes.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

interface SimCognitoWithUser {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
}

async function simCognitoWithUser(): Promise<SimCognitoWithUser> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(created.UserPool?.Id);

  await cognito.adminCreateUser(
    new AdminCreateUserCommand({
      UserPoolId: created.UserPool.Id,
      Username: "alice",
      UserAttributes: [
        { Name: "email", Value: "alice@example.com" },
        { Name: "given_name", Value: "Alice" },
      ],
    }),
  );

  return { cognito, userPoolId: created.UserPool.Id };
}

function attributeValue(
  attributes: readonly SimCognitoAttributeType[] | undefined,
  name: string,
): string | undefined {
  return (attributes ?? []).find((attribute) => attribute.Name === name)?.Value;
}

describe("sim Cognito user update commands", () => {
  it("leaves a user needing a new password when the password is temporary", async () => {
    // Given a created user.
    const { cognito, userPoolId } = await simCognitoWithUser();

    // When a password is set without Permanent.
    await cognito.adminSetUserPassword(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        Password: "Temp0rary!",
      }),
    );

    // Then the user is still in FORCE_CHANGE_PASSWORD, which is what stops it
    // signing in with a password an admin chose.
    const read = await cognito.adminGetUser(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    assertIdentical(read.UserStatus, "FORCE_CHANGE_PASSWORD");
  });

  it("changes only the attributes the request names", async () => {
    // Given a user with an email and a given name.
    const { cognito, userPoolId } = await simCognitoWithUser();

    // When one attribute is changed and another added.
    await cognito.adminUpdateUserAttributes(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        UserAttributes: [
          { Name: "email", Value: "alice@example.net" },
          { Name: "family_name", Value: "Adams" },
        ],
      }),
    );

    // Then the untouched attribute keeps its value.
    const read = await cognito.adminGetUser(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    assertIdentical(
      attributeValue(read.UserAttributes, "email"),
      "alice@example.net",
    );
    assertIdentical(attributeValue(read.UserAttributes, "given_name"), "Alice");
    assertIdentical(
      attributeValue(read.UserAttributes, "family_name"),
      "Adams",
    );
  });

  it("notes when a user last changed", async () => {
    // Given a created user.
    const { cognito, userPoolId } = await simCognitoWithUser();
    const created = await cognito.adminGetUser(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    // When its attributes are updated.
    await cognito.adminUpdateUserAttributes(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        UserAttributes: [{ Name: "nickname", Value: "ali" }],
      }),
    );

    // Then it was last modified no earlier than when it was created.
    const updated = await cognito.adminGetUser(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    assertNonNullable(created.UserLastModifiedDate);
    assertNonNullable(updated.UserLastModifiedDate);
    assertTrue(
      updated.UserLastModifiedDate.getTime() >=
        created.UserLastModifiedDate.getTime(),
    );
  });

  it("disables and enables a user", async () => {
    // Given a created user.
    const { cognito, userPoolId } = await simCognitoWithUser();

    // When it is disabled.
    await cognito.adminDisableUser(
      new AdminDisableUserCommand({
        UserPoolId: userPoolId,
        Username: "alice",
      }),
    );

    const disabled = await cognito.adminGetUser(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    // Then it is no longer enabled, and enabling it again restores that.
    assertFalse(disabled.Enabled);

    await cognito.adminEnableUser(
      new AdminEnableUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    const enabled = await cognito.adminGetUser(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    assertTrue(enabled.Enabled);
  });

  it("keeps a disabled user's status and attributes", async () => {
    // Given a confirmed user.
    const { cognito, userPoolId } = await simCognitoWithUser();
    await cognito.adminSetUserPassword(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        Password: "Sup3rSecret!",
        Permanent: true,
      }),
    );

    // When it is disabled.
    await cognito.adminDisableUser(
      new AdminDisableUserCommand({
        UserPoolId: userPoolId,
        Username: "alice",
      }),
    );

    // Then only Enabled changed: disabling a user does not unconfirm it.
    const read = await cognito.adminGetUser(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    assertIdentical(read.UserStatus, "CONFIRMED");
    assertIdentical(
      attributeValue(read.UserAttributes, "email"),
      "alice@example.com",
    );
  });
});
