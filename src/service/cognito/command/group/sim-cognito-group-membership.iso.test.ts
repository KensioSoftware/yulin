import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  CreateGroupCommand,
  CreateUserPoolCommand,
  DeleteGroupCommand,
  ListUsersInGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimCognitoResourceNotFoundException,
  SimCognitoUserNotFoundException,
} from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

interface SimCognitoWithUsers {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
}

/**
 * A pool holding alice and bob, and an empty admins group with precedence 1.
 */
async function simCognitoWithUsers(): Promise<SimCognitoWithUsers> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(created.UserPool?.Id);

  const userPoolId = created.UserPool.Id;

  await cognito.adminCreateUser(
    new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
  );
  await cognito.adminCreateUser(
    new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "bob" }),
  );
  await cognito.createGroup(
    new CreateGroupCommand({
      UserPoolId: userPoolId,
      GroupName: "admins",
      Precedence: 1,
    }),
  );

  return { cognito, userPoolId };
}

describe("sim Cognito group membership", () => {
  it("puts a user in a group and reads the membership both ways round", async () => {
    // Given a pool with users and a group.
    const { cognito, userPoolId } = await simCognitoWithUsers();

    // When alice is added to the group.
    await cognito.adminAddUserToGroup(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        GroupName: "admins",
      }),
    );

    // Then the group holds her, and she holds the group.
    const members = await cognito.listUsersInGroup(
      new ListUsersInGroupCommand({
        UserPoolId: userPoolId,
        GroupName: "admins",
      }),
    );
    const groups = await cognito.adminListGroupsForUser(
      new AdminListGroupsForUserCommand({
        UserPoolId: userPoolId,
        Username: "alice",
      }),
    );

    assertArrayEquals(
      (members.Users ?? []).map((user) => user.Username),
      ["alice"],
    );
    assertArrayEquals(
      (groups.Groups ?? []).map((group) => group.GroupName),
      ["admins"],
    );
  });

  it("adds a user already in the group without complaining", async () => {
    // Given a user in a group.
    const { cognito, userPoolId } = await simCognitoWithUsers();
    const aliceInAdmins = new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: "alice",
      GroupName: "admins",
    });

    await cognito.adminAddUserToGroup(aliceInAdmins);

    // When she is added again.
    await cognito.adminAddUserToGroup(aliceInAdmins);

    // Then it changed nothing and was not an error, as on real Cognito.
    const members = await cognito.listUsersInGroup(
      new ListUsersInGroupCommand({
        UserPoolId: userPoolId,
        GroupName: "admins",
      }),
    );

    assertArrayEquals(
      (members.Users ?? []).map((user) => user.Username),
      ["alice"],
    );
  });

  it("takes a user out of a group, and out of one they were never in", async () => {
    // Given a user in a group.
    const { cognito, userPoolId } = await simCognitoWithUsers();

    await cognito.adminAddUserToGroup(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        GroupName: "admins",
      }),
    );

    // When she and a user who was never a member are removed.
    await cognito.adminRemoveUserFromGroup(
      new AdminRemoveUserFromGroupCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        GroupName: "admins",
      }),
    );
    await cognito.adminRemoveUserFromGroup(
      new AdminRemoveUserFromGroupCommand({
        UserPoolId: userPoolId,
        Username: "bob",
        GroupName: "admins",
      }),
    );

    // Then the group is empty and neither request was an error.
    const members = await cognito.listUsersInGroup(
      new ListUsersInGroupCommand({
        UserPoolId: userPoolId,
        GroupName: "admins",
      }),
    );

    assertArrayEquals(members.Users ?? [], []);
  });

  it("lists a user's groups strongest precedence first", async () => {
    // Given a user in three groups, added in no particular order.
    const { cognito, userPoolId } = await simCognitoWithUsers();

    await cognito.createGroup(
      new CreateGroupCommand({ UserPoolId: userPoolId, GroupName: "everyone" }),
    );
    await cognito.createGroup(
      new CreateGroupCommand({
        UserPoolId: userPoolId,
        GroupName: "readers",
        Precedence: 10,
      }),
    );

    await cognito.adminAddUserToGroup(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        GroupName: "readers",
      }),
    );
    await cognito.adminAddUserToGroup(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        GroupName: "everyone",
      }),
    );
    await cognito.adminAddUserToGroup(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        GroupName: "admins",
      }),
    );

    // When her groups are listed.
    const groups = await cognito.adminListGroupsForUser(
      new AdminListGroupsForUserCommand({
        UserPoolId: userPoolId,
        Username: "alice",
      }),
    );

    // Then they come back by precedence, lowest value first, and the group
    // with no precedence at all comes last. That is the order the
    // cognito:groups claim will use.
    assertArrayEquals(
      (groups.Groups ?? []).map((group) => group.GroupName),
      ["admins", "readers", "everyone"],
    );
  });

  it("forgets the membership of a deleted group", async () => {
    // Given a user in a group.
    const { cognito, userPoolId } = await simCognitoWithUsers();

    await cognito.adminAddUserToGroup(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        GroupName: "admins",
      }),
    );

    // When the group is deleted.
    await cognito.deleteGroup(
      new DeleteGroupCommand({ UserPoolId: userPoolId, GroupName: "admins" }),
    );

    // Then the user keeps her account and belongs to nothing.
    const groups = await cognito.adminListGroupsForUser(
      new AdminListGroupsForUserCommand({
        UserPoolId: userPoolId,
        Username: "alice",
      }),
    );

    assertArrayEquals(groups.Groups ?? [], []);
  });

  it("forgets the membership of a deleted user", async () => {
    // Given a user in a group.
    const { cognito, userPoolId } = await simCognitoWithUsers();

    await cognito.adminAddUserToGroup(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        GroupName: "admins",
      }),
    );

    // When the user is deleted.
    await cognito.adminDeleteUser(
      new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    // Then the group no longer holds a member this pool cannot describe.
    const members = await cognito.listUsersInGroup(
      new ListUsersInGroupCommand({
        UserPoolId: userPoolId,
        GroupName: "admins",
      }),
    );

    assertArrayEquals(members.Users ?? [], []);
  });

  it("refuses membership operations naming a user or group that is not there", async () => {
    // Given a pool with users and a group.
    const { cognito, userPoolId } = await simCognitoWithUsers();

    // When an unknown group and an unknown user are named.
    const groupError = await assertThrowsErrorAsync(async () => {
      await cognito.adminAddUserToGroup(
        new AdminAddUserToGroupCommand({
          UserPoolId: userPoolId,
          Username: "alice",
          GroupName: "nobody",
        }),
      );
    });
    const userError = await assertThrowsErrorAsync(async () => {
      await cognito.adminAddUserToGroup(
        new AdminAddUserToGroupCommand({
          UserPoolId: userPoolId,
          Username: "nobody",
          GroupName: "admins",
        }),
      );
    });

    // Then each is reported as what was missing.
    assertInstanceOf(groupError, SimCognitoResourceNotFoundException);
    assertInstanceOf(userError, SimCognitoUserNotFoundException);
  });
});
