import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolCommand,
  DescribeUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUuidV4,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCognitoAttributeType } from "../../user-pool/user/sim-cognito-user-attributes.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";
import { SimCognitoUserNotFoundException } from "../../error/sim-cognito.error.js";

function attributeValue(
  attributes: readonly SimCognitoAttributeType[] | undefined,
  name: string,
): string | undefined {
  return (attributes ?? []).find((attribute) => attribute.Name === name)?.Value;
}

interface SimCognitoWithPool {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
}

async function simCognitoWithPool(): Promise<SimCognitoWithPool> {
  const simAws = new SimAws({
    defaultAccountId: "111111111111",
    defaultRegionName: "eu-west-2",
  });
  const cognito = simAws.cognitoIdentityProvider();
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(created.UserPool?.Id);

  return { cognito, userPoolId: created.UserPool.Id };
}

describe("sim Cognito user commands", () => {
  it("creates a user that cannot sign in yet", async () => {
    // Given a simulated user pool.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When an admin creates a user in it.
    const created = await cognito.adminCreateUser(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
      }),
    );

    // Then the user is enabled but left in FORCE_CHANGE_PASSWORD, as real
    // Cognito leaves an admin-created user.
    assertNonNullable(created.User);
    assertObjectMatches(created.User, {
      Username: "alice",
      Enabled: true,
      UserStatus: "FORCE_CHANGE_PASSWORD",
    });
    assertInstanceOf(created.User.UserCreateDate, Date);
  });

  it("gives a user a sub that is not its username", async () => {
    // Given a simulated user pool.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When a user is created.
    const created = await cognito.adminCreateUser(
      new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    // Then its sub is a UUID reported among its attributes, and nothing like
    // the username.
    const sub = attributeValue(created.User?.Attributes, "sub");

    assertNonNullable(sub);
    assertUuidV4(sub);
  });

  it("refuses an admin operation naming a user's sub", async () => {
    // Given a created user.
    const { cognito, userPoolId } = await simCognitoWithPool();
    const created = await cognito.adminCreateUser(
      new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );
    const sub = attributeValue(created.User?.Attributes, "sub");

    // When it is read by its sub rather than its username.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminGetUser(
        new AdminGetUserCommand({ UserPoolId: userPoolId, Username: sub }),
      );
    });

    // Then it is refused, and the refusal says which of the two this
    // simulation resolves users by.
    assertInstanceOf(error, SimCognitoUserNotFoundException);
    assertStringIncludes(error.message, "that is the sub of user alice");
  });

  it("reads a user back with its attributes", async () => {
    // Given a created user with an email.
    const { cognito, userPoolId } = await simCognitoWithPool();
    await cognito.adminCreateUser(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        UserAttributes: [
          { Name: "email", Value: "alice@example.com" },
          { Name: "email_verified", Value: "true" },
        ],
      }),
    );

    // When it is read.
    const read = await cognito.adminGetUser(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    // Then the attributes come back under UserAttributes, which is what
    // AdminGetUser calls them, with the sub among them.
    assertIdentical(read.Username, "alice");
    assertIdentical(read.UserStatus, "FORCE_CHANGE_PASSWORD");
    assertIdentical(
      attributeValue(read.UserAttributes, "email"),
      "alice@example.com",
    );
    assertNonNullable(attributeValue(read.UserAttributes, "email_verified"));
    assertNonNullable(attributeValue(read.UserAttributes, "sub"));
  });

  it("confirms a user given a permanent password", async () => {
    // Given a created user, which cannot sign in yet.
    const { cognito, userPoolId } = await simCognitoWithPool();
    await cognito.adminCreateUser(
      new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    // When an admin sets a permanent password on it.
    await cognito.adminSetUserPassword(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        Password: "Sup3rSecret!",
        Permanent: true,
      }),
    );

    // Then the user is confirmed, which is what lets it sign in normally.
    const read = await cognito.adminGetUser(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    assertIdentical(read.UserStatus, "CONFIRMED");
  });

  it("accepts a temporary password the pool's policy allows", async () => {
    // Given a simulated user pool.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When a user is created with a temporary password.
    const created = await cognito.adminCreateUser(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        TemporaryPassword: "Temp0rary!",
        MessageAction: "SUPPRESS",
      }),
    );

    // Then the user still has to change it before it can sign in.
    assertIdentical(created.User?.UserStatus, "FORCE_CHANGE_PASSWORD");
  });

  it("deletes a user", async () => {
    // Given a created user.
    const { cognito, userPoolId } = await simCognitoWithPool();
    await cognito.adminCreateUser(
      new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    // When it is deleted.
    await cognito.adminDeleteUser(
      new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    // Then it is gone.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminGetUser(
        new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
      );
    });

    assertInstanceOf(error, SimCognitoUserNotFoundException);
  });

  it("counts the users a pool holds", async () => {
    // Given a pool with two users.
    const { cognito, userPoolId } = await simCognitoWithPool();
    await cognito.adminCreateUser(
      new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );
    await cognito.adminCreateUser(
      new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "bob" }),
    );

    // When the pool is described.
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
    );

    // Then it reports the users it holds.
    assertIdentical(described.UserPool?.EstimatedNumberOfUsers, 2);
    assertTrue(
      cognito.findUserPool(userPoolId)?.findUser("alice") !== undefined,
    );
  });
});
